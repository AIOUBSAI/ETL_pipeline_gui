from __future__ import annotations
from pathlib import Path
from typing import Any, Dict, Iterable, Mapping, Optional, Sequence
import pandas as pd
import polars as pl
import time

from pipeline.common.headers import make_unique_headers
from pipeline.common.fileio import iter_source_files
from pipeline.plugins.api import Table, Reader
from pipeline.plugins.registry import register_reader
from pipeline.common.logger import get_logger

log = get_logger()


@register_reader
class ExcelReader(Reader):
    """
    Reader for Excel workbooks (.xls, .xlsx, .xlsm, .ods).

    Features:
      - Iterates all sheets by default (one output table per sheet)
      - Optional sheet filter: source['sheets'] = ['Sheet1','Sheet2']
      - Header de-dup via `make_unique_headers`
      - engine_list override (default tries 'calamine' then 'openpyxl')
      - Workbook caching: enable with cache_workbooks=True in runner options
      - Memory-efficient: Use engine_list: ["calamine"] for large files (21MB+)
    """
    name = "excel"
    _default_engines: Sequence[str] = ("calamine", "openpyxl")
    _cache: Dict[str, tuple[Dict[str, pd.DataFrame], float]] = {}  # {file_path: (workbook_dict, timestamp)}

    def can_handle(self, source: Mapping[str, Any]) -> bool:
        t = str(source.get("type") or "").lower()
        if t in {"excel", "xls", "xlsx", "xlsm", "ods"}:
            return True
        files = str(source.get("files") or "")
        path = str(source.get("path") or "")
        exts = (".xlsx", ".xlsm", ".xls", ".ods")
        return path.lower().endswith(exts) or files.lower().endswith(exts)

    def read(self, source: Mapping[str, Any], base_dir: Path) -> Iterable[Table]:
        engines = list(source.get("engine_list") or self._default_engines)
        only_sheets: Optional[Sequence[str]] = source.get("sheets")

        # Cache options
        cache_enabled = source.get("cache_workbooks", False)
        cache_duration = source.get("cache_duration", 300)  # 5 minutes default

        log.debug(f"Excel reader scanning for files...")
        log.debug(f"Base dir: {base_dir}")
        log.debug(f"Source path: {source.get('path', 'N/A')}")
        log.debug(f"File pattern: {source.get('files', '*.xlsx')}")
        log.debug(f"Engines priority: {engines}")
        if only_sheets:
            log.debug(f"Sheet filter: {only_sheets}")
        if cache_enabled:
            log.debug(f"Workbook caching enabled (duration: {cache_duration}s)")

        files_found = 0
        for fp in iter_source_files(base_dir, source, default_glob="*.xlsx"):
            if not fp.exists() or not fp.is_file():
                log.debug(f"Skipping (not a file): {fp}")
                continue

            files_found += 1
            file_size_mb = fp.stat().st_size / (1024 * 1024)
            log.dev(f"Found file: {fp} ({file_size_mb:.1f}MB)")

            pdf_dict: Dict[str, pd.DataFrame] | None = None
            cache_key = str(fp.resolve())

            # Check cache if enabled
            if cache_enabled and cache_key in self._cache:
                cached_dict, cached_time = self._cache[cache_key]
                age = time.time() - cached_time
                if age < cache_duration:
                    pdf_dict = cached_dict
                    log.debug(f"Using cached workbook (age: {age:.1f}s)")
                else:
                    log.debug(f"Cache expired (age: {age:.1f}s)")
                    del self._cache[cache_key]

            # Load workbook if not cached
            if pdf_dict is None:
                last_err: Exception | None = None
                for eng in engines:
                    try:
                        log.debug(f"Trying engine: {eng} (file size: {file_size_mb:.1f}MB)")
                        if file_size_mb > 10:
                            log.info(f"Reading large file ({file_size_mb:.1f}MB) with {eng} engine - this may take a while...")

                        # For calamine, don't use dtype=str (not supported)
                        if eng == "calamine":
                            pdf_dict = pd.read_excel(fp, sheet_name=None, engine=eng)  # type: ignore[arg-type]
                        else:
                            pdf_dict = pd.read_excel(fp, sheet_name=None, dtype=str, engine=eng)  # type: ignore[arg-type]
                        log.debug(f"Success with engine: {eng}")
                        log.debug(f"Found {len(pdf_dict)} sheet(s): {list(pdf_dict.keys())}")

                        # Cache the workbook if enabled
                        if cache_enabled:
                            self._cache[cache_key] = (pdf_dict, time.time())
                            log.debug(f"Cached workbook: {fp.name}")

                        break
                    except Exception as e:
                        log.debug(f"Engine {eng} failed: {e}")
                        last_err = e

            if pdf_dict is None:
                assert last_err is not None
                log.error(f"Failed to read {fp} with all engines: {engines}")
                log.error(f"For large files (>20MB), try: engine_list: ['calamine']")
                raise last_err

            sheets_yielded = 0
            for sh, pdf in pdf_dict.items():
                sh_name = str(sh)
                if only_sheets and sh_name not in only_sheets:
                    log.debug(f"Skipping sheet '{sh_name}' (not in filter)")
                    continue

                rows_before = len(pdf)
                pdf.columns = make_unique_headers(list(pdf.columns))

                # Convert all columns to string for consistency
                pdf = pdf.astype(str)
                pdf = pdf.replace({"nan": None, "None": None, "<NA>": None})
                pdf = pdf.replace({pd.NA: None}).dropna(how="all")
                rows_after = len(pdf)

                log.debug(f"Sheet '{sh_name}': {rows_before} rows ({rows_after} after dropping empty)")
                log.debug(f"Columns ({len(pdf.columns)}): {list(pdf.columns)[:10]}...")

                df = pl.from_pandas(pdf, include_index=False)
                sheets_yielded += 1
                yield Table(name=sh_name, df=df, meta={"file": str(fp), "sheet": sh_name})

            log.dev(f"Yielded {sheets_yielded} sheet(s) from {fp.name}")

        if files_found == 0:
            log.dev(f"No Excel files found matching criteria")
