from __future__ import annotations
import csv
from pathlib import Path
from typing import Any, Iterable, Mapping, Optional, Dict
import polars as pl

from pipeline.common.headers import make_unique_headers
from pipeline.common.fileio import iter_source_files
from pipeline.plugins.api import Table, Reader
from pipeline.plugins.registry import register_reader
from pipeline.common.logger import get_logger

log = get_logger()


def _detect_delimiter(file_path: Path, sample_bytes: int = 8192) -> str:
    """
    Detect delimiter by sampling the file. Fallback to most-likely common delimiters.
    """
    with open(file_path, "rb") as f:
        raw = f.read(sample_bytes)
    text = raw.decode("utf-8-sig", errors="replace")
    try:
        dialect = csv.Sniffer().sniff(text, delimiters=",;\t|:")
        return dialect.delimiter
    except Exception:
        for line in text.splitlines():
            if line.strip():
                candidates = [",", ";", "\t", "|", ":"]
                counts = {d: line.count(d) for d in candidates}
                order = sorted(candidates, key=lambda d: (-counts[d], ";,|\t:".find(d)))
                return order[0] if counts[order[0]] > 0 else ","
        return ","


@register_reader
class CSVReader(Reader):
    """
    Reader for CSV files.

    Supports:
      - Automatic delimiter detection (overridden by source['delimiter'])
      - path/files/recursive
      - Header de-dup via `make_unique_headers`
    """
    name = "csv"

    def can_handle(self, source: Mapping[str, Any]) -> bool:
        t = str(source.get("type") or "").lower()
        if t == "csv":
            return True
        files = str(source.get("files") or "")
        path = str(source.get("path") or "")
        return files.lower().endswith(".csv") or path.lower().endswith(".csv")

    def read(self, source: Mapping[str, Any], base_dir: Path) -> Iterable[Table]:
        log.debug(f"CSV reader scanning for files...")
        log.debug(f"Base dir: {base_dir}")
        log.debug(f"Source path: {source.get('path', 'N/A')}")
        log.debug(f"File pattern: {source.get('files', '*.csv')}")

        files_found = 0
        for fp in iter_source_files(base_dir, source, default_glob="*.csv"):
            if not fp.exists() or not fp.is_file():
                log.debug(f"Skipping (not a file): {fp}")
                continue

            files_found += 1
            log.dev(f"Found file: {fp}")

            sep = str(source.get("delimiter") or _detect_delimiter(fp))
            log.debug(f"Delimiter: '{sep}' (repr: {repr(sep)})")

            df = pl.read_csv(
                fp,
                separator=sep,
                infer_schema_length=2000,
                has_header=True,
                encoding="utf8",
                null_values=["", "NA", "NaN"],
                truncate_ragged_lines=True,
                ignore_errors=False,
            )

            log.debug(f"Read {len(df)} rows, {len(df.columns)} columns")
            log.debug(f"Original columns: {list(df.columns)[:10]}...")

            df = df.rename(dict(zip(df.columns, make_unique_headers(df.columns))))
            log.debug(f"After header cleanup: {list(df.columns)[:10]}...")

            yield Table(name=str(source.get("name") or fp.stem), df=df, meta={"file": str(fp)})

        if files_found == 0:
            log.dev(f"No CSV files found matching criteria")
