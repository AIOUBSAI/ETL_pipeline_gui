from __future__ import annotations
from pathlib import Path
from typing import Any, Iterable, Mapping, Optional, List
import polars as pl

from pipeline.plugins.api import Table, Reader
from pipeline.plugins.registry import register_reader
from pipeline.common.fileio import iter_source_files


@register_reader
class ParquetReader(Reader):
    """
    Reader for Apache Parquet files.

    Options:
      - path/files/recursive
      - columns (list[str]): optional projection
    """
    name = "parquet"

    def can_handle(self, source: Mapping[str, object]) -> bool:
        t = str(source.get("type") or "").lower()
        if t == "parquet":
            return True
        files = str(source.get("files") or "")
        path = str(source.get("path") or "")
        return path.lower().endswith(".parquet") or files.lower().endswith(".parquet")

    def read(self, source: Mapping[str, object], base_dir: Path) -> Iterable[Table]:
        cols = source.get("columns")
        columns = list(cols) if isinstance(cols, list) else None
        for fp in iter_source_files(base_dir, source, default_glob="*.parquet"):
            if not fp.exists() or not fp.is_file():
                continue
            df = pl.read_parquet(fp, columns=columns)
            yield Table(name=str(source.get("name") or fp.stem), df=df, meta={"file": str(fp)})
