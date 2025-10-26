"""
SQLite Database Engine Plugin
"""
from __future__ import annotations
from pathlib import Path
from typing import Any, Dict, Mapping
import sqlite3
import re

from pipeline.plugins.api import DatabaseEngine, Table
from pipeline.plugins.registry import register_database_engine
from pipeline.common.logger import get_logger

log = get_logger()


@register_database_engine
class SQLiteEngine(DatabaseEngine):
    """
    SQLite database engine plugin.

    Supports both in-memory and file-based SQLite databases.

    Note: SQLite doesn't support schemas, so we use table prefixes instead.
    Example: schema="staging" + table="datasets" → "staging_datasets"
    """
    name = "sqlite"
    supports_schemas = False  # SQLite doesn't support schemas!

    def can_handle(self, config: Mapping[str, Any]) -> bool:
        """Check if this is a SQLite configuration."""
        db_type = str(config.get("type", "")).strip().lower()
        return db_type in ("sqlite", "sqlite3")

    def connect(self, config: Mapping[str, Any]) -> sqlite3.Connection:
        """
        Create SQLite connection.

        Config options:
            path: Database file path (required for file-based, ":memory:" for in-memory)
            timeout: Connection timeout in seconds (default 5.0)
            check_same_thread: Boolean (default True)
            isolation_level: Transaction isolation level
        """
        path = config.get("path", ":memory:")
        timeout = config.get("timeout", 5.0)
        check_same_thread = config.get("check_same_thread", True)
        isolation_level = config.get("isolation_level")

        # Convert path to string
        if path and path != ":memory:":
            path = str(Path(path))
            log.debug(f"Connecting to SQLite: {path}")
        else:
            log.debug("Connecting to in-memory SQLite")

        # Create connection
        conn = sqlite3.connect(
            database=path,
            timeout=timeout,
            check_same_thread=check_same_thread,
            isolation_level=isolation_level
        )

        # Enable foreign keys (disabled by default in SQLite)
        enable_fk = config.get("enable_foreign_keys", True)
        if enable_fk:
            conn.execute("PRAGMA foreign_keys = ON;")

        # Set row factory for dict-like access
        conn.row_factory = sqlite3.Row

        # Execute initialization SQL if specified
        init_sql = config.get("init_sql", [])
        for sql in init_sql:
            try:
                conn.execute(sql)
                log.debug(f"  Executed init SQL: {sql[:50]}...")
            except Exception as e:
                log.warning(f"  Failed to execute init SQL: {e}")

        conn.commit()

        return conn

    def execute(self, connection: sqlite3.Connection, sql: str) -> sqlite3.Cursor:
        """Execute SQL and return cursor."""
        return connection.execute(sql)

    def close(self, connection: sqlite3.Connection) -> None:
        """Close SQLite connection."""
        try:
            connection.commit()
            connection.close()
            log.debug("SQLite connection closed")
        except Exception as e:
            log.warning(f"Error closing SQLite connection: {e}")

    def get_table_info(self, connection: sqlite3.Connection, schema: str, table: str) -> Dict[str, Any]:
        """Get table metadata."""
        try:
            # SQLite doesn't have schemas - use full table name with prefix
            full_table = self.format_table_name(schema, table)

            # Get row count
            cursor = connection.execute(f"SELECT COUNT(*) FROM {full_table}")
            row_count = cursor.fetchone()[0]

            # Get column info
            cursor = connection.execute(f"PRAGMA table_info({full_table})")
            columns_result = cursor.fetchall()

            columns = {row[1]: row[2] for row in columns_result}  # name: type

            return {
                "row_count": row_count,
                "columns": columns,
                "column_count": len(columns)
            }
        except Exception as e:
            log.warning(f"Failed to get table info for {table}: {e}")
            return {}

    def register_table(
        self,
        connection: sqlite3.Connection,
        table: Table,
        schema: str = "",
        replace: bool = True,
        as_table: bool = True
    ) -> None:
        """
        Register/stage a Table into SQLite.

        Args:
            connection: SQLite connection
            table: Table object (name + polars DataFrame)
            schema: Schema prefix (e.g., "staging" → "staging_tablename")
            replace: If True, replace existing table
            as_table: If True, create as TABLE; if False, create as VIEW

        Note: SQLite doesn't support schemas, so we use table prefixes.
        Example: schema="staging" + table="datasets" → "staging_datasets"
        """
        # Sanitize table name
        table_name = self._sanitize_name(table.name or "table")
        full_table = self.format_table_name(schema, table_name)

        # Convert polars → pandas
        from pipeline.common.polars_to_pandas import to_pandas
        pdf = to_pandas(table.df)

        row_count = len(pdf)
        col_count = len(pdf.columns)

        # Drop existing if replace
        if replace:
            connection.execute(f"DROP TABLE IF EXISTS {full_table}")
            # Note: SQLite doesn't support DROP VIEW IF EXISTS in older versions
            try:
                connection.execute(f"DROP VIEW IF EXISTS {full_table}")
            except:
                pass

        if as_table:
            # Use pandas to_sql for easy table creation
            pdf.to_sql(full_table, connection, if_exists='replace', index=False)
            log.debug(f"Created TABLE {full_table} ({row_count} rows, {col_count} cols)")
        else:
            # Create temporary table first, then create view
            temp_table = f"_temp_{full_table}"
            pdf.to_sql(temp_table, connection, if_exists='replace', index=False)

            # Create view from temp table
            columns = ", ".join(pdf.columns)
            connection.execute(f"CREATE VIEW {full_table} AS SELECT {columns} FROM {temp_table}")

            # Drop temp table
            connection.execute(f"DROP TABLE {temp_table}")

            log.debug(f"Created VIEW {full_table} ({row_count} rows, {col_count} cols)")

        connection.commit()

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
