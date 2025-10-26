from __future__ import annotations
from pathlib import Path
from typing import Any, Iterable, Mapping, Optional
import polars as pl
import sqlite3

from pipeline.plugins.api import Table, Reader
from pipeline.plugins.registry import register_reader


@register_reader
class SQLiteReader(Reader):
    """
    Reader for SQLite databases.

    Options:
      - path (str): SQLite file path
      - table (str): table to read (if no 'sql')
      - sql (str): SELECT query
      - params (list|tuple): SQL params
      - name (str): override output name
    """
    name = "sqlite"

    def can_handle(self, source: Mapping[str, object]) -> bool:
        t = str(source.get("type") or "").lower()
        return t == "sqlite" or str(source.get("path") or "").lower().endswith(".db")

    def read(self, source: Mapping[str, object], base_dir: Path) -> Iterable[Table]:
        db_path = source.get("path")
        if not db_path:
            raise ValueError("SQLiteReader requires 'path' to a database file.")
        db_path = str(db_path)
        table = source.get("table")
        sql = source.get("sql")
        params = source.get("params") or []

        with sqlite3.connect(db_path) as con:
            if sql:
                df = pl.read_database(sql, con, params=params)
                out_name = str(source.get("name") or table or "query")
                yield Table(name=out_name, df=df, meta={"db": db_path, "sql": str(sql)})
            elif table:
                df = pl.read_database(f"SELECT * FROM {table}", con)
                out_name = str(source.get("name") or table)
                yield Table(name=out_name, df=df, meta={"db": db_path, "table": str(table)})
            else:
                raise ValueError("SQLiteReader: provide either 'table' or 'sql'.")
