from __future__ import annotations
import os, re
from pathlib import Path
from typing import Mapping
import sqlite3

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
class SQLiteWriter(Writer):
    """SQLite writer. Expands ${ENV}/{ENV} in 'path' and 'table'."""
    name = "sqlite"

    def can_handle(self, target: Mapping[str, object]) -> bool:
        return (target.get("writer") == "sqlite") or (str(target.get("format") or "") == "sqlite")

    def write(self, table: Table, target: Mapping[str, object], out_dir: Path) -> Path:
        env = {**os.environ, **(target.get("env") or {}), "table_name": table.name}
        db_path = target.get("path")
        if not db_path:
            raise ValueError("sqlite writer requires 'path'.")
        db_path = _expand(str(db_path), env)
        path = Path(db_path)
        path.parent.mkdir(parents=True, exist_ok=True)

        tbl = _expand(str(target.get("table") or table.name or "table"), env)
        if_exists = str(target.get("if_exists") or "replace")

        pdf = pl_to_pandas(table.df)
        with sqlite3.connect(db_path) as con:
            pdf.to_sql(tbl, con, if_exists=if_exists, index=False)
        return path
