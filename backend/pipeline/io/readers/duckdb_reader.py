from __future__ import annotations
from pathlib import Path
from typing import Any, Iterable, Mapping, Optional
import polars as pl
import duckdb

from pipeline.plugins.api import Table, Reader
from pipeline.plugins.registry import register_reader


@register_reader
class DuckDBReader(Reader):
    """
    Reader for DuckDB databases.

    Options:
      - path (str): .duckdb file or ':memory:'
      - table (str): table to read (if no 'sql')
      - sql (str): SELECT query
      - params (list|tuple): SQL params
      - name (str): override output table name
    """
    name = "duckdb"

    def can_handle(self, source: Mapping[str, Any]) -> bool:
        t = str(source.get("type") or "").lower()
        return t == "duckdb" or str(source.get("path") or "").lower().endswith(".duckdb")

    def read(self, source: Mapping[str, Any], base_dir: Path) -> Iterable[Table]:
        db_path = str(source.get("path") or ":memory:")
        table = source.get("table")
        sql = source.get("sql")
        params = source.get("params") or []

        con = duckdb.connect(db_path)
        try:
            if sql:
                df = pl.read_database(sql, connection=con, params=params)
                out_name = str(source.get("name") or table or "query")
                yield Table(name=out_name, df=df, meta={"db": db_path, "sql": str(sql)})
            elif table:
                df = pl.read_database(f"SELECT * FROM {table}", connection=con)
                out_name = str(source.get("name") or table)
                yield Table(name=out_name, df=df, meta={"db": db_path, "table": str(table)})
            else:
                raise ValueError("DuckDBReader: provide either 'table' or 'sql'.")
        finally:
            con.close()
