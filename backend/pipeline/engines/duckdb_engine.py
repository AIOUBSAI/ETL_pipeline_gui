"""
DuckDB Database Engine Plugin
"""
from __future__ import annotations
from pathlib import Path
from typing import Any, Dict, Mapping
import duckdb
import re

from pipeline.plugins.api import DatabaseEngine, Table
from pipeline.plugins.registry import register_database_engine
from pipeline.common.logger import get_logger

log = get_logger()


@register_database_engine
class DuckDBEngine(DatabaseEngine):
    """
    DuckDB database engine plugin.

    Supports both in-memory and file-based DuckDB databases.
    """
    name = "duckdb"
    supports_schemas = True  # DuckDB supports schemas

    def can_handle(self, config: Mapping[str, Any]) -> bool:
        """Check if this is a DuckDB configuration."""
        db_type = str(config.get("type", "")).strip().lower()
        return db_type in ("duckdb", "duck", "")  # Empty defaults to DuckDB

    def connect(self, config: Mapping[str, Any]) -> duckdb.DuckDBPyConnection:
        """
        Create DuckDB connection.

        Config options:
            path: Database file path (optional, defaults to in-memory)
            read_only: Boolean (default False)
            config: Dict of DuckDB configuration options
            extensions: List of extensions to load
        """
        path = config.get("path", ":memory:")
        read_only = config.get("read_only", False)
        db_config = config.get("config", {})

        # Convert path to string and ensure directory exists
        if path and path != ":memory:":
            path = str(Path(path))
            # Create parent directory if it doesn't exist
            parent_dir = Path(path).parent
            if parent_dir and not parent_dir.exists():
                parent_dir.mkdir(parents=True, exist_ok=True)
                log.debug(f"Created directory: {parent_dir}")
            log.debug(f"Connecting to DuckDB: {path}")
        else:
            log.debug("Connecting to in-memory DuckDB")

        # Create connection
        conn = duckdb.connect(database=path, read_only=read_only, config=db_config)

        # Load extensions if specified
        extensions = config.get("extensions", [])
        for ext in extensions:
            try:
                conn.execute(f"INSTALL {ext};")
                conn.execute(f"LOAD {ext};")
                log.debug(f"  Loaded extension: {ext}")
            except Exception as e:
                log.warning(f"  Failed to load extension {ext}: {e}")

        # Execute initialization SQL if specified
        init_sql = config.get("init_sql", [])
        for sql in init_sql:
            try:
                conn.execute(sql)
                log.debug(f"  Executed init SQL: {sql[:50]}...")
            except Exception as e:
                log.warning(f"  Failed to execute init SQL: {e}")

        return conn

    def execute(self, connection: duckdb.DuckDBPyConnection, sql: str) -> duckdb.DuckDBPyRelation:
        """Execute SQL and return DuckDB relation."""
        return connection.execute(sql)

    def close(self, connection: duckdb.DuckDBPyConnection) -> None:
        """Close DuckDB connection."""
        try:
            connection.close()
            log.debug("DuckDB connection closed")
        except Exception as e:
            log.warning(f"Error closing DuckDB connection: {e}")

    def get_table_info(self, connection: duckdb.DuckDBPyConnection, schema: str, table: str) -> Dict[str, Any]:
        """Get table metadata."""
        try:
            full_table = f"{schema}.{table}" if schema else table

            # Get row count
            row_count = connection.execute(f"SELECT COUNT(*) FROM {full_table}").fetchone()[0]

            # Get column info
            columns_result = connection.execute(
                f"SELECT column_name, data_type FROM information_schema.columns "
                f"WHERE table_schema = '{schema}' AND table_name = '{table}'"
            ).fetchall()

            columns = {col[0]: col[1] for col in columns_result}

            return {
                "row_count": row_count,
                "columns": columns,
                "column_count": len(columns)
            }
        except Exception as e:
            log.warning(f"Failed to get table info for {schema}.{table}: {e}")
            return {}

    def register_table(
        self,
        connection: duckdb.DuckDBPyConnection,
        table: Table,
        schema: str = "",
        replace: bool = True,
        as_table: bool = True
    ) -> None:
        """
        Register/stage a Table into DuckDB.

        Args:
            connection: DuckDB connection
            table: Table object (name + polars DataFrame)
            schema: Schema name (e.g., "staging")
            replace: If True, replace existing table
            as_table: If True, create as TABLE; if False, create as VIEW
        """
        # Sanitize table name
        table_name = self._sanitize_name(table.name or "table")
        full_table = self.format_table_name(schema, table_name)

        # Drop existing if replace
        if replace:
            connection.execute(f"DROP TABLE IF EXISTS {full_table}")
            connection.execute(f"DROP VIEW IF EXISTS {full_table}")

        # Convert polars → pandas → DuckDB relation
        from pipeline.common.polars_to_pandas import to_pandas
        pdf = to_pandas(table.df)
        rel = connection.from_df(pdf)

        row_count = len(pdf)
        col_count = len(pdf.columns)

        # Create table or view
        if as_table:
            rel.create(full_table)
            log.debug(f"Created TABLE {full_table} ({row_count} rows, {col_count} cols)")
        else:
            rel.create_view(full_table, replace=True)
            log.debug(f"Created VIEW {full_table} ({row_count} rows, {col_count} cols)")

    @staticmethod
    def _sanitize_name(name: str) -> str:
        """Make a valid SQL identifier from arbitrary names."""
        if not name:
            return "table"
        # Replace invalid chars with underscore
        s = re.sub(r"[^A-Za-z0-9_]", "_", str(name).strip())
        # Identifier cannot start with a digit
        if s and s[0].isdigit():
            s = "t_" + s
        return s or "table"
