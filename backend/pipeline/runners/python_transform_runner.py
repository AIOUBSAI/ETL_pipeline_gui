"""
Python Transform Runner - Execute Python/Polars transformations in TRANSFORM stage

This runner allows complex data processing using Python code and Polars DataFrames
during the transform stage, complementing SQL transformations.

Key features:
- Load tables from DuckDB into Polars DataFrames
- Apply complex Python/Polars transformations
- Write results back to DuckDB
- Support both inline Python and external .py files
- Access to the full processor library for reusable operations
"""
from __future__ import annotations
from pathlib import Path
from typing import Any, Dict, List, Optional
import importlib.util
import sys

import polars as pl
import duckdb

from pipeline.plugins.api import Reader, Table, Processor
from pipeline.plugins.registry import register_reader, PROCESSORS
from pipeline.common.logger import get_logger

log = get_logger()


@register_reader
class PythonTransformRunner(Reader):
    """
    Execute Python/Polars transformations during the transform stage.

    Configuration:
        runner: python_transform
        options:
            # Input tables from DuckDB
            input_tables:
                - schema: "staging"
                  table: "customers"
                  alias: "customers_df"  # Variable name in Python

            # Python transformation (inline or file)
            python_code: |
                # Inline Python code
                result_df = customers_df.filter(pl.col("status") == "active")

            # OR use external file
            python_file: "transforms/python/custom_logic.py"

            # Output configuration
            output:
                - table: "active_customers"  # Table name in DuckDB
                  schema: "landing"
                  source_df: "result_df"  # Variable name from Python
                  mode: "replace"  # replace | append

            # Optional: Apply processors to DataFrames
            processors:
                - normalize_headers
                - name: type_cast
                  type_cast:
                    age: "int"
                    price: "float"

    Example Python transformation file:
        ```python
        # transforms/python/custom_logic.py
        import polars as pl
        from datetime import datetime

        def transform(customers_df: pl.DataFrame, orders_df: pl.DataFrame) -> Dict[str, pl.DataFrame]:
            # Complex logic that's hard to express in SQL

            # Calculate customer lifetime value with custom logic
            customer_stats = orders_df.groupby("customer_id").agg([
                pl.sum("amount").alias("total_spent"),
                pl.count("order_id").alias("order_count"),
                pl.max("order_date").alias("last_order_date")
            ])

            # Custom scoring algorithm
            enriched = customers_df.join(customer_stats, on="customer_id", how="left")
            enriched = enriched.with_columns([
                # Complex Python logic
                pl.when(pl.col("total_spent") > 1000).then(pl.lit("gold"))
                .when(pl.col("total_spent") > 500).then(pl.lit("silver"))
                .otherwise(pl.lit("bronze"))
                .alias("tier")
            ])

            return {
                "enriched_customers": enriched,
                "high_value": enriched.filter(pl.col("tier") == "gold")
            }
        ```
    """
    name = "python_transform"

    def can_handle(self, source: Dict[str, Any]) -> bool:
        return source.get("runner") == "python_transform"

    def read(self, source: Dict[str, Any], ctx: Dict[str, Any]) -> Dict[str, Any]:
        """
        Execute Python transformations.

        Args:
            source: Job configuration with options
            ctx: Context with duckdb connection and params

        Returns:
            Empty dict (results are written to DuckDB)
        """
        opts = source.get("options", {})
        duckdb_con: duckdb.DuckDBPyConnection = ctx.get("duckdb")

        if not duckdb_con:
            raise ValueError("Python transform requires DuckDB connection")

        log.info(f"Executing Python transformation")

        # Step 1: Load input tables from DuckDB into Polars DataFrames
        input_tables = opts.get("input_tables", [])
        dataframes = self._load_input_tables(duckdb_con, input_tables)

        log.dev(f"  Loaded {len(dataframes)} input table(s)")
        for alias, df in dataframes.items():
            log.debug(f"    {alias}: {len(df)} rows × {len(df.columns)} columns")

        # Step 2: Execute Python transformation
        python_code = opts.get("python_code")
        python_file = opts.get("python_file")

        if python_file:
            result_dfs = self._execute_python_file(python_file, dataframes, ctx)
        elif python_code:
            result_dfs = self._execute_python_code(python_code, dataframes, ctx)
        else:
            raise ValueError("Python transform requires either 'python_code' or 'python_file'")

        log.dev(f"  Python execution complete: {len(result_dfs)} result DataFrame(s)")

        # Step 3: Apply processors if specified
        processors_cfg = opts.get("processors", [])
        if processors_cfg:
            result_dfs = self._apply_processors(result_dfs, processors_cfg, ctx)

        # Step 4: Write results back to DuckDB
        output_configs = opts.get("output", [])
        self._write_output_tables(duckdb_con, result_dfs, output_configs)

        log.info(f"[OK] Python transformation complete")

        return {}

    def _load_input_tables(
        self,
        duckdb_con: duckdb.DuckDBPyConnection,
        input_configs: List[Dict[str, str]]
    ) -> Dict[str, pl.DataFrame]:
        """Load tables from DuckDB into Polars DataFrames."""
        dataframes = {}

        for config in input_configs:
            schema = config.get("schema", "")
            table = config.get("table", "")
            alias = config.get("alias", table)  # Default alias is table name

            if not table:
                raise ValueError(f"Input table configuration missing 'table' field")

            # Build fully qualified table name
            full_table = f"{schema}.{table}" if schema else table

            log.debug(f"    Loading {full_table} as '{alias}'")

            # Load from DuckDB to Polars
            query = f"SELECT * FROM {full_table}"
            df = duckdb_con.execute(query).pl()

            dataframes[alias] = df

        return dataframes

    def _execute_python_file(
        self,
        python_file: str,
        dataframes: Dict[str, pl.DataFrame],
        ctx: Dict[str, Any]
    ) -> Dict[str, pl.DataFrame]:
        """Execute Python transformation from external file."""
        python_path = Path(python_file)

        if not python_path.exists():
            raise FileNotFoundError(f"Python transformation file not found: {python_file}")

        log.dev(f"  Executing Python file: {python_path.name}")

        # Load the Python module
        spec = importlib.util.spec_from_file_location("transform_module", python_path)
        if not spec or not spec.loader:
            raise ValueError(f"Cannot load Python file: {python_file}")

        module = importlib.util.module_from_spec(spec)
        sys.modules["transform_module"] = module
        spec.loader.exec_module(module)

        # Look for a transform function
        if not hasattr(module, "transform"):
            raise ValueError(
                f"Python file must define a 'transform' function. "
                f"Expected signature: transform(**dataframes) -> Dict[str, pl.DataFrame]"
            )

        transform_func = module.transform

        # Execute the transform function with input dataframes
        try:
            result = transform_func(**dataframes)

            if not isinstance(result, dict):
                raise ValueError(
                    f"Transform function must return Dict[str, pl.DataFrame], got {type(result)}"
                )

            # Validate all values are DataFrames
            for key, value in result.items():
                if not isinstance(value, pl.DataFrame):
                    raise ValueError(
                        f"Transform result '{key}' is not a Polars DataFrame: {type(value)}"
                    )

            return result

        except Exception as e:
            log.error(f"Python transformation failed: {e}")
            raise

    def _execute_python_code(
        self,
        python_code: str,
        dataframes: Dict[str, pl.DataFrame],
        ctx: Dict[str, Any]
    ) -> Dict[str, pl.DataFrame]:
        """Execute inline Python transformation code."""
        log.dev(f"  Executing inline Python code ({len(python_code)} chars)")
        log.debug(f"Python code:\n{python_code}")

        # Create execution namespace with input dataframes
        namespace = {
            "pl": pl,
            "log": log,
            **dataframes  # Inject all input DataFrames
        }

        # Execute the Python code
        try:
            exec(python_code, namespace)
        except Exception as e:
            log.error(f"Python code execution failed: {e}")
            raise

        # Extract result DataFrames (any pl.DataFrame variables created)
        result_dfs = {}
        for key, value in namespace.items():
            if isinstance(value, pl.DataFrame) and key not in dataframes:
                result_dfs[key] = value
                log.debug(f"    Found result DataFrame: {key}")

        if not result_dfs:
            log.warning("No result DataFrames found. Ensure your code creates pl.DataFrame variables.")

        return result_dfs

    def _apply_processors(
        self,
        dataframes: Dict[str, pl.DataFrame],
        processors_cfg: List[Any],
        ctx: Dict[str, Any]
    ) -> Dict[str, pl.DataFrame]:
        """Apply processors to DataFrames."""
        log.dev(f"  Applying {len(processors_cfg)} processor(s)")

        result = {}
        for df_name, df in dataframes.items():
            log.debug(f"    Processing '{df_name}'")

            # Apply each processor to the DataFrame
            processed_df = df
            for proc_desc in processors_cfg:
                proc_name, proc_opts = self._normalize_processor(proc_desc)

                # Find processor
                processor = self._get_processor(proc_name)
                if not processor:
                    log.warning(f"      Processor '{proc_name}' not found, skipping")
                    continue

                # Build context
                proc_ctx = {
                    **ctx,
                    "processor_options": proc_opts,
                    "table_name": df_name,
                }

                # Check if processor applies
                if not processor.applies_to(proc_ctx):
                    log.debug(f"      Processor '{proc_name}' does not apply, skipping")
                    continue

                # Apply processor (processors work with DataFrames directly)
                log.debug(f"      Applying: {proc_name}")
                try:
                    processed_df = processor.process(processed_df, proc_ctx)
                except Exception as e:
                    log.error(f"      Processor '{proc_name}' failed: {e}")
                    raise

            result[df_name] = processed_df

        return result

    def _normalize_processor(self, proc_desc: Any) -> tuple[str, Dict[str, Any]]:
        """Normalize processor description to (name, options)."""
        if isinstance(proc_desc, str):
            return proc_desc, {}
        elif isinstance(proc_desc, dict):
            name = proc_desc.get("name", "")
            if not name:
                # If no 'name' key, treat the whole dict as options for the first key
                name = list(proc_desc.keys())[0]
                return name, proc_desc
            else:
                opts = {k: v for k, v in proc_desc.items() if k != "name"}
                return name, opts
        else:
            raise ValueError(f"Invalid processor descriptor: {proc_desc}")

    def _get_processor(self, name: str) -> Optional[Processor]:
        """Get processor by name from registry."""
        if name in PROCESSORS:
            return PROCESSORS[name]()  # Instantiate the processor class
        return None

    def _write_output_tables(
        self,
        duckdb_con: duckdb.DuckDBPyConnection,
        dataframes: Dict[str, pl.DataFrame],
        output_configs: List[Dict[str, str]]
    ) -> None:
        """Write result DataFrames back to DuckDB."""
        if not output_configs:
            raise ValueError("Python transform requires 'output' configuration")

        log.dev(f"  Writing {len(output_configs)} output table(s)")

        for config in output_configs:
            table_name = config.get("table", "")
            schema = config.get("schema", "")
            source_df_name = config.get("source_df", "")
            mode = config.get("mode", "replace")  # replace | append

            if not table_name:
                raise ValueError("Output configuration missing 'table' field")

            if not source_df_name:
                # If not specified, try to find a DataFrame with matching name
                if table_name in dataframes:
                    source_df_name = table_name
                else:
                    raise ValueError(
                        f"Output 'source_df' not specified and no DataFrame named '{table_name}' found"
                    )

            if source_df_name not in dataframes:
                raise ValueError(
                    f"Source DataFrame '{source_df_name}' not found. "
                    f"Available: {list(dataframes.keys())}"
                )

            df = dataframes[source_df_name]

            # Build fully qualified table name
            full_table = f"{schema}.{table_name}" if schema else table_name

            log.dev(f"    Writing '{source_df_name}' → {full_table} ({len(df)} rows)")

            # Register DataFrame with DuckDB
            duckdb_con.register("__temp_df", df)

            # Create or replace table
            if mode == "replace":
                sql = f"CREATE OR REPLACE TABLE {full_table} AS SELECT * FROM __temp_df"
            elif mode == "append":
                sql = f"INSERT INTO {full_table} SELECT * FROM __temp_df"
            else:
                raise ValueError(f"Invalid output mode: {mode}. Use 'replace' or 'append'")

            log.debug(f"      SQL: {sql}")
            duckdb_con.execute(sql)

            # Unregister temp DataFrame
            duckdb_con.unregister("__temp_df")

            # Get row count
            row_count = duckdb_con.execute(f"SELECT COUNT(*) FROM {full_table}").fetchone()[0]
            log.debug(f"      Result: {full_table} has {row_count:,} rows")
