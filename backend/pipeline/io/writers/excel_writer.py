from __future__ import annotations
import os, re
from pathlib import Path
from typing import Mapping
import pandas as pd

from pipeline.plugins.api import Table, Writer
from pipeline.plugins.registry import register_writer
from pipeline.common.polars_to_pandas import to_pandas as pl_to_pandas

_DOLLAR = re.compile(r"\$\{([^}]+)\}")
_BRACES = re.compile(r"\{([A-Za-z0-9_]+)\}")
def _expand(s: str, env): 
    s = _DOLLAR.sub(lambda m: str(env.get(m.group(1), "")), s)
    s = _BRACES.sub(lambda m: str(env.get(m.group(1), "")), s)
    return s

@register_writer
class ExcelWriter(Writer):
    """Excel sheet writer. Expands ${ENV}/{ENV} in 'dir', 'name', 'sheet'."""
    name = "excel"

    def can_handle(self, target: Mapping[str, object]) -> bool:
        fmt = str(target.get("format") or "").lower()
        return fmt in ("excel", "xlsx") or target.get("writer") == "excel"

    def write(self, table: Table, target: Mapping[str, object], out_dir: Path) -> Path:
        env = {**os.environ, **(target.get("env") or {})}
        subdir = _expand(str(target.get("dir") or ""), env)
        base = _expand(str(target.get("name") or table.name or "table"), env)
        sheet = _expand(str(target.get("sheet") or table.name or "Sheet1"), env)

        root = out_dir / subdir if subdir else out_dir
        root.mkdir(parents=True, exist_ok=True)
        path = root / f"{base}.xlsx"

        mode = str(target.get("mode") or "w")
        engine = str(target.get("engine") or "openpyxl")
        include_index = bool(target.get("index", False))

        with pd.ExcelWriter(path, engine=engine, mode=mode if path.exists() else "w") as xw:
            pl_to_pandas(table.df).to_excel(xw, sheet_name=sheet[:31], index=include_index)

        return path
