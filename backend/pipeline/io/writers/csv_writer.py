from __future__ import annotations
import os, re
from pathlib import Path
from typing import Mapping
import polars as pl

from pipeline.plugins.api import Table, Writer
from pipeline.plugins.registry import register_writer

_DOLLAR = re.compile(r"\$\{([^}]+)\}")
_BRACES = re.compile(r"\{([A-Za-z0-9_]+)\}")

def _expand(s: str, env: Mapping[str, object]) -> str:
    if not s: return s
    s = _DOLLAR.sub(lambda m: str(env.get(m.group(1), "")), s)
    s = _BRACES.sub(lambda m: str(env.get(m.group(1), "")), s)
    return s

@register_writer
class CSVWriter(Writer):
    """
    CSV writer. Expands ${ENV} / {ENV} in 'dir' and 'name'.
    """
    name = "csv"

    def can_handle(self, target: Mapping[str, object]) -> bool:
        fmt = str(target.get("format") or "").lower()
        return fmt in ("csv", "") or target.get("writer") == "csv"

    def write(self, table: Table, target: Mapping[str, object], out_dir: Path) -> Path:
        env = {**os.environ, **(target.get("env") or {})}
        subdir = _expand(str(target.get("dir") or ""), env)
        base = _expand(str(target.get("name") or table.name or "table"), env)

        root = out_dir / subdir if subdir else out_dir
        root.mkdir(parents=True, exist_ok=True)
        path = root / f"{base}.csv"

        include_header = bool(target.get("include_header", True))
        table.df.write_csv(path, include_header=include_header)
        return path
