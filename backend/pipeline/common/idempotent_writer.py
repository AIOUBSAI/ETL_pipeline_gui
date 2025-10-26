"""
Idempotent writer with MERGE/UPSERT support

Handles retries, duplicates, and ensures exactly-once semantics
"""
from __future__ import annotations

import hashlib
from dataclasses import dataclass, field
from enum import Enum
from pathlib import Path
from typing import Any, Dict, List, Optional, Union

import polars as pl
import duckdb


class WriteMode(str, Enum):
    """Write modes for idempotent writer"""
    APPEND = "append"           # Simple append (no deduplication)
    OVERWRITE = "overwrite"     # Truncate and write
    MERGE = "merge"             # MERGE/UPSERT based on keys
    UPSERT = "upsert"           # Alias for MERGE
    INCREMENTAL = "incremental" # Append new rows only (based on hash/timestamp)


class MergeStrategy(str, Enum):
    """Strategy for handling matching keys in MERGE"""
    UPDATE = "update"           # UPDATE matched rows
    IGNORE = "ignore"           # Keep existing, ignore new
    DELETE_INSERT = "delete_insert"  # DELETE then INSERT (for complex updates)


@dataclass
class WriteConfig:
    """Configuration for idempotent write operation"""
    mode: WriteMode = WriteMode.APPEND
    primary_keys: List[str] = field(default_factory=list)  # Keys for MERGE/dedup
    merge_strategy: MergeStrategy = MergeStrategy.UPDATE
    dedupe_within_batch: bool = True  # Remove duplicates within new data
    create_table_if_missing: bool = True
    partition_by: Optional[List[str]] = None  # For incremental partitioning
    checksum_column: str = "_row_hash"  # Column name for row checksums


class IdempotentWriter:
    """
    Idempotent writer for DuckDB with MERGE/UPSERT support

    Examples:
        >>> # Simple append
        >>> writer = IdempotentWriter(Path("data.db"))
        >>> writer.write(df, "users", WriteConfig(mode=WriteMode.APPEND))

        >>> # MERGE/UPSERT on primary key
        >>> config = WriteConfig(
        ...     mode=WriteMode.MERGE,
        ...     primary_keys=["user_id"],
        ...     merge_strategy=MergeStrategy.UPDATE
        ... )
        >>> writer.write(df, "users", config)

        >>> # Incremental load with deduplication
        >>> config = WriteConfig(
        ...     mode=WriteMode.INCREMENTAL,
        ...     primary_keys=["id"],
        ...     partition_by=["date"]
        ... )
        >>> writer.write(df, "events", config)
    """

    def __init__(self, db_path: Union[Path, str, duckdb.DuckDBPyConnection]):
        """
        Args:
            db_path: Path to DuckDB database file, or existing connection
        """
        if isinstance(db_path, duckdb.DuckDBPyConnection):
            self.conn = db_path
            self.owns_connection = False
        else:
            self.db_path = Path(db_path)
            self.conn = duckdb.connect(str(self.db_path))
            self.owns_connection = True

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        if self.owns_connection:
            self.conn.close()

    def write(
        self,
        df: pl.DataFrame,
        table_name: str,
        config: WriteConfig,
        schema: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Write DataFrame to table idempotently

        Args:
            df: DataFrame to write
            table_name: Target table name
            config: Write configuration
            schema: Optional schema name

        Returns:
            Write statistics (rows_inserted, rows_updated, rows_deleted, etc.)
        """
        full_table = f"{schema}.{table_name}" if schema else table_name

        # Deduplicate within batch if requested
        if config.dedupe_within_batch and config.primary_keys:
            df = self._dedupe_dataframe(df, config.primary_keys)

        # Route to appropriate write method
        if config.mode == WriteMode.APPEND:
            return self._write_append(df, full_table, config)
        elif config.mode == WriteMode.OVERWRITE:
            return self._write_overwrite(df, full_table, config)
        elif config.mode in (WriteMode.MERGE, WriteMode.UPSERT):
            return self._write_merge(df, full_table, config)
        elif config.mode == WriteMode.INCREMENTAL:
            return self._write_incremental(df, full_table, config)
        else:
            raise ValueError(f"Unknown write mode: {config.mode}")

    def _write_append(
        self, df: pl.DataFrame, table_name: str, config: WriteConfig
    ) -> Dict[str, Any]:
        """Simple append without deduplication"""
        if not self._table_exists(table_name) and config.create_table_if_missing:
            self._create_table_from_dataframe(df, table_name)

        # Register DataFrame and insert
        self.conn.register("_temp_df", df)
        result = self.conn.execute(f"INSERT INTO {table_name} SELECT * FROM _temp_df")
        self.conn.unregister("_temp_df")

        return {
            "mode": "append",
            "rows_inserted": len(df),
            "rows_updated": 0,
            "rows_deleted": 0
        }

    def _write_overwrite(
        self, df: pl.DataFrame, table_name: str, config: WriteConfig
    ) -> Dict[str, Any]:
        """Truncate and write"""
        if self._table_exists(table_name):
            self.conn.execute(f"DELETE FROM {table_name}")
        elif config.create_table_if_missing:
            self._create_table_from_dataframe(df, table_name)

        self.conn.register("_temp_df", df)
        self.conn.execute(f"INSERT INTO {table_name} SELECT * FROM _temp_df")
        self.conn.unregister("_temp_df")

        return {
            "mode": "overwrite",
            "rows_inserted": len(df),
            "rows_updated": 0,
            "rows_deleted": 0
        }

    def _write_merge(
        self, df: pl.DataFrame, table_name: str, config: WriteConfig
    ) -> Dict[str, Any]:
        """
        MERGE/UPSERT using primary keys

        Handles INSERT for new rows, UPDATE for existing rows
        """
        if not config.primary_keys:
            raise ValueError("MERGE mode requires primary_keys to be specified")

        # Create table if missing
        if not self._table_exists(table_name):
            if config.create_table_if_missing:
                self._create_table_from_dataframe(df, table_name)
                return self._write_append(df, table_name, config)
            else:
                raise ValueError(f"Table {table_name} does not exist")

        # Register new data
        self.conn.register("_new_data", df)

        # Build MERGE statement
        join_conditions = " AND ".join(
            f"target.{key} = source.{key}" for key in config.primary_keys
        )

        if config.merge_strategy == MergeStrategy.UPDATE:
            # Get all columns except primary keys for UPDATE
            all_cols = df.columns
            update_cols = [col for col in all_cols if col not in config.primary_keys]

            if update_cols:
                update_clause = ", ".join(f"{col} = source.{col}" for col in update_cols)
                matched_action = f"WHEN MATCHED THEN UPDATE SET {update_clause}"
            else:
                # No columns to update, just ignore matches
                matched_action = ""

            insert_cols = ", ".join(all_cols)
            insert_vals = ", ".join(f"source.{col}" for col in all_cols)

            merge_sql = f"""
                INSERT INTO {table_name}
                SELECT * FROM _new_data source
                WHERE NOT EXISTS (
                    SELECT 1 FROM {table_name} target
                    WHERE {join_conditions}
                )
            """

            # First, update existing rows
            if update_cols:
                update_sql = f"""
                    UPDATE {table_name} AS target
                    SET {update_clause}
                    FROM _new_data AS source
                    WHERE {join_conditions}
                """
                rows_updated = self.conn.execute(update_sql).fetchone()
                if rows_updated and len(rows_updated) > 0:
                    rows_updated = rows_updated[0] if isinstance(rows_updated[0], int) else 0
                else:
                    rows_updated = 0
            else:
                rows_updated = 0

            # Then, insert new rows
            rows_inserted = self.conn.execute(merge_sql).fetchone()
            if rows_inserted and len(rows_inserted) > 0:
                rows_inserted = rows_inserted[0] if isinstance(rows_inserted[0], int) else len(df)
            else:
                # Count manually
                count_sql = f"""
                    SELECT COUNT(*) FROM _new_data source
                    WHERE NOT EXISTS (
                        SELECT 1 FROM {table_name} target
                        WHERE {join_conditions}
                    )
                """
                rows_inserted = self.conn.execute(count_sql).fetchone()[0]

        elif config.merge_strategy == MergeStrategy.IGNORE:
            # Only insert new rows, ignore existing
            insert_cols = ", ".join(df.columns)
            merge_sql = f"""
                INSERT INTO {table_name}
                SELECT * FROM _new_data source
                WHERE NOT EXISTS (
                    SELECT 1 FROM {table_name} target
                    WHERE {join_conditions}
                )
            """
            self.conn.execute(merge_sql)
            rows_inserted = len(df)  # Approximate
            rows_updated = 0

        elif config.merge_strategy == MergeStrategy.DELETE_INSERT:
            # Delete matching rows, then insert all new rows
            delete_sql = f"""
                DELETE FROM {table_name}
                WHERE ({", ".join(config.primary_keys)}) IN (
                    SELECT {", ".join(config.primary_keys)} FROM _new_data
                )
            """
            self.conn.execute(delete_sql)

            insert_sql = f"INSERT INTO {table_name} SELECT * FROM _new_data"
            self.conn.execute(insert_sql)
            rows_inserted = len(df)
            rows_updated = 0

        self.conn.unregister("_new_data")

        return {
            "mode": "merge",
            "rows_inserted": rows_inserted,
            "rows_updated": rows_updated,
            "rows_deleted": 0
        }

    def _write_incremental(
        self, df: pl.DataFrame, table_name: str, config: WriteConfig
    ) -> Dict[str, Any]:
        """
        Incremental load: only append rows not already in table

        Uses row hash for deduplication
        """
        if not self._table_exists(table_name):
            if config.create_table_if_missing:
                # Add checksum column
                df_with_hash = self._add_row_hash(df, config.checksum_column)
                self._create_table_from_dataframe(df_with_hash, table_name)
                self.conn.register("_temp_df", df_with_hash)
                self.conn.execute(f"INSERT INTO {table_name} SELECT * FROM _temp_df")
                self.conn.unregister("_temp_df")
                return {
                    "mode": "incremental",
                    "rows_inserted": len(df),
                    "rows_updated": 0,
                    "rows_deleted": 0
                }
            else:
                raise ValueError(f"Table {table_name} does not exist")

        # Add hash to new data
        df_with_hash = self._add_row_hash(df, config.checksum_column)

        # Find rows not already in table
        self.conn.register("_new_data", df_with_hash)

        # Check if checksum column exists in target
        existing_cols = self.conn.execute(
            f"SELECT column_name FROM information_schema.columns WHERE table_name = '{table_name}'"
        ).fetchall()
        existing_col_names = [col[0] for col in existing_cols]

        if config.checksum_column not in existing_col_names:
            # Add checksum column to existing table
            self.conn.execute(f"ALTER TABLE {table_name} ADD COLUMN {config.checksum_column} VARCHAR")
            # Compute hashes for existing rows
            update_sql = f"""
                UPDATE {table_name}
                SET {config.checksum_column} = md5(CAST(ROW(*) AS VARCHAR))
            """
            self.conn.execute(update_sql)

        # Insert only new rows (hash not in existing table)
        insert_sql = f"""
            INSERT INTO {table_name}
            SELECT * FROM _new_data
            WHERE {config.checksum_column} NOT IN (
                SELECT {config.checksum_column} FROM {table_name}
            )
        """
        result = self.conn.execute(insert_sql)
        self.conn.unregister("_new_data")

        # Count inserted
        count_sql = f"""
            SELECT COUNT(*) FROM (
                SELECT * FROM _new_data
                WHERE {config.checksum_column} NOT IN (
                    SELECT {config.checksum_column} FROM {table_name}
                )
            )
        """
        self.conn.register("_new_data", df_with_hash)
        rows_inserted = self.conn.execute(count_sql).fetchone()[0]
        self.conn.unregister("_new_data")

        return {
            "mode": "incremental",
            "rows_inserted": rows_inserted,
            "rows_updated": 0,
            "rows_deleted": 0
        }

    def _dedupe_dataframe(self, df: pl.DataFrame, keys: List[str]) -> pl.DataFrame:
        """Remove duplicates within DataFrame based on keys"""
        return df.unique(subset=keys, keep="last")

    def _add_row_hash(self, df: pl.DataFrame, hash_column: str) -> pl.DataFrame:
        """Add row hash column for deduplication"""
        # Compute hash of all columns
        hash_expr = pl.concat_str([pl.col(c).cast(pl.Utf8) for c in df.columns], separator="|")
        return df.with_columns(
            hash_expr.map_elements(
                lambda x: hashlib.md5(x.encode()).hexdigest(), return_dtype=pl.Utf8
            ).alias(hash_column)
        )

    def _table_exists(self, table_name: str) -> bool:
        """Check if table exists"""
        try:
            self.conn.execute(f"SELECT 1 FROM {table_name} LIMIT 1")
            return True
        except:
            return False

    def _create_table_from_dataframe(self, df: pl.DataFrame, table_name: str):
        """Create table with schema inferred from DataFrame"""
        self.conn.register("_temp_schema", df.head(0))
        self.conn.execute(f"CREATE TABLE {table_name} AS SELECT * FROM _temp_schema")
        self.conn.unregister("_temp_schema")


def write_idempotent(
    df: pl.DataFrame,
    table_name: str,
    db_path: Union[Path, str, duckdb.DuckDBPyConnection],
    mode: WriteMode = WriteMode.APPEND,
    primary_keys: Optional[List[str]] = None,
    merge_strategy: MergeStrategy = MergeStrategy.UPDATE,
    **kwargs
) -> Dict[str, Any]:
    """
    Convenience function for idempotent writes

    Args:
        df: DataFrame to write
        table_name: Target table name
        db_path: Database path or connection
        mode: Write mode
        primary_keys: Primary keys for MERGE/dedup
        merge_strategy: Strategy for handling matched rows
        **kwargs: Additional WriteConfig parameters

    Returns:
        Write statistics

    Examples:
        >>> # Simple UPSERT
        >>> stats = write_idempotent(
        ...     df, "users", "data.db",
        ...     mode=WriteMode.MERGE,
        ...     primary_keys=["user_id"]
        ... )
    """
    config = WriteConfig(
        mode=mode,
        primary_keys=primary_keys or [],
        merge_strategy=merge_strategy,
        **kwargs
    )

    with IdempotentWriter(db_path) as writer:
        return writer.write(df, table_name, config)
