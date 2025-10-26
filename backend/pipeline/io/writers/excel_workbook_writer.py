from __future__ import annotations
import os, re
from pathlib import Path
from typing import Iterable, Mapping, Optional
import pandas as pd

from pipeline.plugins.api import Table, MultiWriter
from pipeline.plugins.registry import register_multi_writer
from pipeline.common.polars_to_pandas import to_pandas as pl_to_pandas

_DOLLAR = re.compile(r"\$\{([^}]+)\}")
_BRACES = re.compile(r"\{([A-Za-z0-9_]+)\}")
def _expand(s: str, env): 
    s = _DOLLAR.sub(lambda m: str(env.get(m.group(1), "")), s)
    s = _BRACES.sub(lambda m: str(env.get(m.group(1), "")), s)
    return s

@register_multi_writer
class ExcelWorkbookWriter(MultiWriter):
    """Many tables → one workbook. Expands ${ENV}/{ENV} in 'dir' and 'name'."""
    name = "excel_workbook"

    def can_handle(self, target: Mapping[str, object]) -> bool:
        val = (target.get("writer") or target.get("format") or "").__str__().lower()
        return val == "excel_workbook"

    def write_all(self, tables: Iterable[Table], target: Mapping[str, object],
                  out_dir: Path, ctx: Optional[Mapping[str, object]] = None) -> Path:
        env = {**os.environ, **(target.get("env") or {})}

        ts = list(tables)
        if not ts:
            raise ValueError("excel_workbook received no tables.")
        subdir = _expand(str(target.get("dir") or ""), env)
        env2 = {**env, "table_name": ts[0].name}
        name = _expand(str(target.get("name") or ts[0].name or "workbook"), env2)

        root = out_dir / subdir if subdir else out_dir
        root.mkdir(parents=True, exist_ok=True)
        path = root / f"{name}.xlsx"

        engine = str(target.get("engine") or "openpyxl")
        index = bool(target.get("index", False))
        mode = str(target.get("mode") or ("a" if path.exists() else "w"))
        rename = target.get("sheet_names") if isinstance(target.get("sheet_names"), dict) else {}

        with pd.ExcelWriter(path, engine=engine, mode=mode) as xw:
            for t in ts:
                sheet = str(rename.get(t.name, t.name))[:31] or "Sheet"
                pl_to_pandas(t.df).to_excel(xw, sheet_name=sheet, index=index)

        return path
