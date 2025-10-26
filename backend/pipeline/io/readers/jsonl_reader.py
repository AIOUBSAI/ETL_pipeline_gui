from __future__ import annotations
from pathlib import Path
from typing import Any, Iterable, Mapping, Optional, List
import polars as pl
import json
import gzip

from pipeline.plugins.api import Table, Reader
from pipeline.plugins.registry import register_reader
from pipeline.common.fileio import iter_source_files


@register_reader
class JSONLReader(Reader):
    """
    Reader for JSON Lines / NDJSON files.

    Supports:
      - Extensions: .jsonl, .ndjson, and their .gz variants
      - path/files/recursive
      - Fast path using polars.read_ndjson when available; otherwise manual parse
      - Skips empty lines and lines starting with '#'

    Options:
      - columns (list[str], optional): project columns after load
      - name (str, optional): override output name (default = file stem)
    """
    name = "jsonl"

    _exts = (".jsonl", ".ndjson", ".jsonl.gz", ".ndjson.gz")

    def can_handle(self, source: Mapping[str, object]) -> bool:
        t = str(source.get("type") or "").lower()
        if t in {"jsonl", "ndjson"}:
            return True
        files = str(source.get("files") or "")
        path = str(source.get("path") or "")
        return path.lower().endswith(self._exts) or files.lower().endswith(self._exts)

    def _is_gz(self, p: Path) -> bool:
        return p.suffix.lower() == ".gz"

    def _read_fast_ndjson(self, fp: Path) -> pl.DataFrame:
        # Prefer Polars' native reader if present (handles gz too via path)
        try:
            # Polars supports read_ndjson (newer) and read_json with format="ndjson" (older)
            if hasattr(pl, "read_ndjson"):
                return pl.read_ndjson(str(fp))
            # Fallback to read_json with ndjson flag (older Polars versions)
            return pl.read_json(str(fp), infer_schema_length=2000, json_rows=True)  # type: ignore[call-arg]
        except Exception:
            raise

    def _read_manual(self, fp: Path) -> pl.DataFrame:
        # Manual parse: one JSON object per line. If not dict, store under "value".
        opener = gzip.open if self._is_gz(fp) else open
        records: List[Any] = []
        with opener(fp, "rt", encoding="utf-8") as f:
            for line in f:
                s = line.strip()
                if not s or s.startswith("#"):
                    continue
                try:
                    obj = json.loads(s)
                    records.append(obj)
                except Exception:
                    # Skip bad lines rather than fail entire file
                    continue

        if not records:
            return pl.DataFrame({})

        # If all dict-like -> from_dicts, else simple single-column
        if all(isinstance(r, dict) for r in records):
            return pl.from_dicts(records)  # type: ignore[arg-type]
        return pl.DataFrame({"value": records})

    def read(self, source: Mapping[str, object], base_dir: Path) -> Iterable[Table]:
        # Optional projection after load
        cols_opt = source.get("columns")
        columns = list(cols_opt) if isinstance(cols_opt, list) else None

        for fp in iter_source_files(base_dir, source, default_glob="*.jsonl"):
            if not fp.exists() or not fp.is_file():
                continue

            # Try fast reader first, fall back to manual parsing
            try:
                df = self._read_fast_ndjson(fp)
            except Exception:
                df = self._read_manual(fp)

            if columns:
                present = [c for c in columns if c in df.columns]
                if present:
                    df = df.select([pl.col(c) for c in present])

            out_name = str(source.get("name") or fp.stem.replace(".jsonl", "").replace(".ndjson", ""))
            yield Table(name=out_name, df=df, meta={"file": str(fp)})
