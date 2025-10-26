from __future__ import annotations
from pathlib import Path
from typing import Mapping, Any, List, Tuple, Optional
import duckdb
import polars as pl

from pipeline.plugins.api import Table, Writer
from pipeline.plugins.registry import register_writer


def _qident(name: str) -> str:
    return '"' + str(name).replace('"', '""') + '"'


def _pl_to_pandas(df: pl.DataFrame):
    return df.to_pandas()


def _table_info(con: duckdb.DuckDBPyConnection, schema: str, table: str) -> List[Tuple]:
    return con.execute(
        f"PRAGMA table_info({_qident(schema)}.{_qident(table)});"
    ).fetchall()


def _ensure_schema(con: duckdb.DuckDBPyConnection, schema: str) -> None:
    con.execute(f"CREATE SCHEMA IF NOT EXISTS {_qident(schema)};")


def _split_schema_table(tbl: str, schema_opt: Optional[str]) -> tuple[str, str]:
    """
    Accept either:
      - tbl="schema.name" (wins), schema_opt ignored
      - tbl="name" + schema_opt="staging" => ("staging","name")
      - tbl="name" and no schema => ("main","name")
    """
    if "." in tbl:
        sch, name = tbl.split(".", 1)
        return sch.strip() or "main", name.strip()
    return (schema_opt or "main"), tbl


@register_writer
class DuckDBWriter(Writer):
    """
    Write a table into a DuckDB database.

    Target options:
      - path (str): path to .duckdb file (required).
      - table (str): table name (defaults to table.name).
      - schema (str): target schema (default "main"). Ignored if table is already "schema.name".
      - if_exists (str): 'replace' (default), 'append', or 'fail'.
      - all_varchar (bool): cast batch to VARCHAR and widen target columns to VARCHAR before append.
    """
    name = "duckdb"

    def can_handle(self, target: Mapping[str, object]) -> bool:
        return (target.get("writer") == "duckdb") or (str(target.get("format") or "") == "duckdb")

    def write(self, table: Table, target: Mapping[str, object], out_dir: Path) -> Path:
        db_path = target.get("path")
        if not db_path:
            raise ValueError("duckdb writer requires 'path' to database file.")
        db_path = str(db_path)
        Path(db_path).parent.mkdir(parents=True, exist_ok=True)

        tbl_raw = str(target.get("table") or table.name or "table")
        schema_opt = target.get("schema")
        schema, tbl = _split_schema_table(tbl_raw, str(schema_opt) if schema_opt else None)

        mode = str(target.get("if_exists") or "replace").lower()
        all_varchar = bool(target.get("all_varchar", False))

        con = duckdb.connect(db_path)
        try:
            _ensure_schema(con, schema)

            # Stage batch as a view
            rel = con.from_df(_pl_to_pandas(table.df))
            rel.create_view("tmp_v", replace=True)

            view_to_use = "tmp_v"
            if all_varchar:
                cols = table.df.columns
                cast_sql = ", ".join(f"CAST({_qident(c)} AS VARCHAR) AS {_qident(c)}" for c in cols)
                con.execute(f'CREATE OR REPLACE VIEW "tmp_v_cast" AS SELECT {cast_sql} FROM "tmp_v";')
                view_to_use = "tmp_v_cast"

            fq = f"{_qident(schema)}.{_qident(tbl)}"

            if mode == "replace":
                con.execute(f"DROP TABLE IF EXISTS {fq};")
                con.execute(f"CREATE TABLE {fq} AS SELECT * FROM {_qident(view_to_use)};")

            elif mode == "append":
                con.execute(f"CREATE TABLE IF NOT EXISTS {fq} AS SELECT * FROM {_qident(view_to_use)} WHERE 1=0;")

                # If all_varchar, widen any existing non-VARCHAR columns to VARCHAR to avoid cast errors
                if all_varchar:
                    info = _table_info(con, schema, tbl)
                    for _, col_name, col_type, *_ in info:
                        if str(col_type).upper() != "VARCHAR":
                            con.execute(f"ALTER TABLE {fq} ALTER {_qident(col_name)} TYPE VARCHAR;")

                # Align column list by intersection and stable order
                dest_cols = [row[1] for row in _table_info(con, schema, tbl)]
                batch_cols = list(table.df.columns)
                common = [c for c in dest_cols if c in batch_cols]
                if not common:
                    raise ValueError(f"No overlapping columns between batch and target table '{schema}.{tbl}'.")

                cols_csv = ", ".join(_qident(c) for c in common)
                con.execute(
                    f"INSERT INTO {fq} ({cols_csv}) "
                    f"SELECT {cols_csv} FROM {_qident(view_to_use)};"
                )

            else:  # 'fail'
                con.execute(f"CREATE TABLE {fq} AS SELECT * FROM {_qident(view_to_use)};")

        finally:
            try: con.execute('DROP VIEW IF EXISTS "tmp_v_cast";')
            except Exception: pass
            try: con.execute('DROP VIEW IF EXISTS "tmp_v";')
            except Exception: pass
            con.close()

        return Path(db_path)
