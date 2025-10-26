from __future__ import annotations
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, Iterable, Mapping, Optional
import polars as pl


@dataclass
class Table:
    """A logical table produced by a reader."""
    name: str
    df: pl.DataFrame
    meta: Dict[str, Any] = field(default_factory=dict)


class Reader(ABC):
    """Reader plugins produce 1..N Tables from a 'source' spec."""
    name: str

    @abstractmethod
    def can_handle(self, source: Mapping[str, Any]) -> bool:
        ...

    @abstractmethod
    def read(self, source: Mapping[str, Any], base_dir: Path) -> Iterable[Table]:
        ...


class Processor(ABC):
    """Transforms a Table -> Table (pure function ideally)."""
    name: str
    order: int = 100

    @abstractmethod
    def applies_to(self, ctx: Mapping[str, Any]) -> bool:
        ...

    @abstractmethod
    def process(self, table: Table, ctx: Mapping[str, Any]) -> Table:
        ...


class Writer(ABC):
    """Per-table writer: writes a single Table to a destination."""
    name: str

    @abstractmethod
    def can_handle(self, target: Mapping[str, Any]) -> bool:
        ...

    @abstractmethod
    def write(self, table: Table, target: Mapping[str, Any], out_dir: Path) -> Path:
        ...


class Runner(ABC):
    """Task Runner: Executes tasks/transformations (e.g., DBT, custom workflows)."""
    name: str

    @abstractmethod
    def can_handle(self, target: Mapping[str, Any]) -> bool:
        ...

    @abstractmethod
    def run(self, table: Table, target: Mapping[str, Any], out_dir: Path) -> Path:
        ...


class DatabaseEngine(ABC):
    """Database Engine: Provides connection and query execution for a database system."""
    name: str
    supports_schemas: bool = True  # Override to False for SQLite

    @abstractmethod
    def can_handle(self, config: Mapping[str, Any]) -> bool:
        """Check if this engine can handle the given configuration."""
        ...

    @abstractmethod
    def connect(self, config: Mapping[str, Any]) -> Any:
        """
        Create and return a database connection.

        Args:
            config: Database configuration (path, connection string, options, etc.)

        Returns:
            Database connection object
        """
        ...

    @abstractmethod
    def execute(self, connection: Any, sql: str) -> Any:
        """
        Execute SQL statement and return result.

        Args:
            connection: Database connection from connect()
            sql: SQL statement to execute

        Returns:
            Query result (implementation-specific)
        """
        ...

    @abstractmethod
    def close(self, connection: Any) -> None:
        """Close the database connection gracefully."""
        ...

    def get_table_info(self, connection: Any, schema: str, table: str) -> Dict[str, Any]:
        """
        Get metadata about a table (optional, for enhanced reporting).

        Returns dict with keys: row_count, columns, etc.
        """
        return {}

    def format_table_name(self, schema: str, table: str) -> str:
        """
        Format table reference for this engine.

        Args:
            schema: Schema name (e.g., "staging", "landing")
            table: Table name (e.g., "datasets")

        Returns:
            Formatted table reference
            - DuckDB/PostgreSQL: "staging.datasets"
            - SQLite: "staging_datasets"
        """
        if self.supports_schemas and schema:
            return f"{schema}.{table}"
        elif schema:
            return f"{schema}_{table}"
        else:
            return table

    def create_schema(self, connection: Any, schema: str) -> None:
        """
        Create schema if engine supports it.

        Args:
            connection: Database connection
            schema: Schema name to create
        """
        if self.supports_schemas and schema:
            self.execute(connection, f"CREATE SCHEMA IF NOT EXISTS {schema}")

    @abstractmethod
    def register_table(
        self,
        connection: Any,
        table: Table,
        schema: str = "",
        replace: bool = True,
        as_table: bool = True
    ) -> None:
        """
        Register/stage a Table into the database.

        Args:
            connection: Database connection
            table: Table object (name + polars DataFrame)
            schema: Schema name (or prefix for SQLite)
            replace: If True, replace existing table
            as_table: If True, create as TABLE; if False, create as VIEW

        This is the key staging method that each engine must implement!
        """
        ...

    def register_tables(
        self,
        connection: Any,
        tables: Iterable[Table],
        schema: str = "",
        replace: bool = True,
        as_table: bool = True
    ) -> None:
        """
        Register multiple tables (convenience method).

        Args:
            connection: Database connection
            tables: Iterable of Table objects
            schema: Schema name (or prefix for SQLite)
            replace: If True, replace existing tables
            as_table: If True, create as TABLE; if False, create as VIEW
        """
        # Create schema once if needed
        self.create_schema(connection, schema)

        # Register each table
        for table in tables:
            self.register_table(connection, table, schema, replace, as_table)



class MultiWriter(ABC):
    """Multi-writer: can consume many/zero tables in one shot (e.g., XML templates)."""
    name: str

    @abstractmethod
    def can_handle(self, target: Mapping[str, Any]) -> bool:
        ...

    @abstractmethod
    def write_all(
        self,
        tables: Iterable[Table],
        target: Mapping[str, Any],
        out_dir: Path,
        ctx: Optional[Mapping[str, Any]] = None,
    ) -> Path:
        ...
