"""
Python Export Runner - Execute Python/Polars exports in EXPORT stage

This runner allows complex data export operations using Python code and Polars DataFrames
during the export stage, complementing standard file writers (CSV, JSON, etc.).

Key features:
- Custom data transformations before export
- Multi-file exports with complex logic
- API uploads and external system integration
- Custom file format generation
- Complex aggregations and reporting

Use cases:
- Upload data to REST APIs
- Generate complex reports with multiple outputs
- Custom file format generation (non-standard formats)
- Split large datasets into multiple files
- Apply business logic before export
"""
from __future__ import annotations
from pathlib import Path
from typing import Any, Dict, List, Optional
import importlib.util
import sys

import polars as pl
import duckdb

from pipeline.plugins.api import Writer, Table
from pipeline.plugins.registry import register_writer
from pipeline.common.logger import get_logger

log = get_logger()


@register_writer
class PythonExportRunner(Writer):
    """
    Execute Python/Polars export during the export stage.

    Configuration:
        runner: python_export
        input:
            # Load data from DuckDB
            query: "SELECT * FROM analytics.customers WHERE tier = 'gold'"
            # OR specify table directly
            table: "analytics.customers"
            schema: "analytics"

        options:
            # Python export (inline or file)
            python_code: |
                # Inline Python code
                import polars as pl
                import json

                # df is available as the input DataFrame
                # Export to multiple files
                high_value = df.filter(pl.col("total_spent") > 1000)
                high_value.write_csv("out/high_value_customers.csv")

                # Upload to API
                data = df.to_dicts()
                response = requests.post("https://api.example.com/upload", json=data)

            # OR use external file
            python_file: "exports/python/custom_exporter.py"

            # Optional: Pass parameters to Python code
            params:
                api_url: "https://api.example.com/upload"
                api_key: "${API_KEY}"
                output_path: "{OUTPUT_DIR}/custom"

    Example Python export file:
        ```python
        # exports/python/custom_exporter.py
        import polars as pl
        import requests
        from pathlib import Path
        from typing import Dict, Any

        def export(df: pl.DataFrame, params: Dict[str, Any]) -> None:
            '''
            Export function receives the input DataFrame and optional parameters.

            Args:
                df: Input DataFrame from DuckDB query/table
                params: Parameters from configuration
            '''
            output_path = Path(params.get("output_path", "out"))
            output_path.mkdir(parents=True, exist_ok=True)

            # Split by tier and export
            for tier in df["tier"].unique():
                tier_df = df.filter(pl.col("tier") == tier)
                tier_df.write_csv(output_path / f"customers_{tier}.csv")

            # Upload summary to API
            summary = df.group_by("tier").agg([
                pl.count("customer_id").alias("count"),
                pl.sum("total_spent").alias("total_revenue")
            ])

            api_url = params.get("api_url")
            api_key = params.get("api_key")

            if api_url:
                response = requests.post(
                    api_url,
                    json=summary.to_dicts(),
                    headers={"Authorization": f"Bearer {api_key}"}
                )
                print(f"API response: {response.status_code}")

            # Generate metadata
            metadata = {
                "export_date": str(datetime.now()),
                "record_count": len(df),
                "tiers_exported": df["tier"].unique().to_list()
            }

            with open(output_path / "metadata.json", "w") as f:
                json.dump(metadata, f, indent=2)
        ```
    """
    name = "python_export"

    def can_handle(self, target: Dict[str, Any]) -> bool:
        return target.get("runner") == "python_export" or target.get("writer") == "python_export"

    def write(self, table: Table, target: Dict[str, Any], out_dir: Path) -> Path:
        """
        Execute Python export.

        Args:
            table: Table object with DataFrame to export
            target: Job configuration with options
            out_dir: Output directory

        Returns:
            Path to output directory (for consistency with other writers)
        """
        opts = target.get("options", {})
        df = table.df

        log.info(f"Executing Python export for table '{table.name}'")
        log.dev(f"  Input: {len(df)} rows × {len(df.columns)} columns")

        # Step 1: Get parameters
        params = opts.get("params", {})
        params["output_dir"] = str(out_dir)
        params["table_name"] = table.name

        # Step 2: Execute Python export
        python_code = opts.get("python_code")
        python_file = opts.get("python_file")

        if python_file:
            self._execute_python_file(python_file, df, params)
        elif python_code:
            self._execute_python_code(python_code, df, params)
        else:
            raise ValueError("Python export requires either 'python_code' or 'python_file'")

        log.info(f"[OK] Python export complete")

        return out_dir

    def _execute_python_file(
        self,
        python_file: str,
        df: pl.DataFrame,
        params: Dict[str, Any]
    ) -> None:
        """Execute Python export from external file."""
        python_path = Path(python_file)

        if not python_path.exists():
            raise FileNotFoundError(f"Python export file not found: {python_file}")

        log.dev(f"  Executing Python file: {python_path.name}")

        # Load the Python module
        spec = importlib.util.spec_from_file_location("export_module", python_path)
        if not spec or not spec.loader:
            raise ValueError(f"Cannot load Python file: {python_file}")

        module = importlib.util.module_from_spec(spec)
        sys.modules["export_module"] = module
        spec.loader.exec_module(module)

        # Look for an export function
        if not hasattr(module, "export"):
            raise ValueError(
                f"Python file must define an 'export' function. "
                f"Expected signature: export(df: pl.DataFrame, params: Dict[str, Any]) -> None"
            )

        export_func = module.export

        # Execute the export function
        try:
            export_func(df, params)
        except Exception as e:
            log.error(f"Python export failed: {e}")
            raise

    def _execute_python_code(
        self,
        python_code: str,
        df: pl.DataFrame,
        params: Dict[str, Any]
    ) -> None:
        """Execute inline Python export code."""
        log.dev(f"  Executing inline Python code ({len(python_code)} chars)")
        log.debug(f"Python code:\n{python_code}")

        # Create execution namespace
        namespace = {
            "pl": pl,
            "log": log,
            "df": df,
            "params": params,
        }

        # Execute the Python code
        try:
            exec(python_code, namespace)
        except Exception as e:
            log.error(f"Python code execution failed: {e}")
            raise


@register_writer
class PythonExportRunnerWithQuery(Writer):
    """
    Extended Python Export Runner that can execute DuckDB queries.

    This variant allows the export job to specify a query and access DuckDB directly
    within the Python code for more complex export scenarios.

    Configuration:
        runner: python_export_query
        input:
            query: "SELECT * FROM analytics.customers"

        options:
            python_code: |
                # Access duckdb connection directly
                result = duckdb_con.execute("SELECT tier, COUNT(*) FROM analytics.customers GROUP BY tier").pl()
                result.write_csv("out/tier_summary.csv")

            python_file: "exports/python/complex_export.py"

    Example Python file with DuckDB access:
        ```python
        # exports/python/complex_export.py
        import polars as pl
        import duckdb
        from typing import Dict, Any

        def export(df: pl.DataFrame, duckdb_con: duckdb.DuckDBPyConnection, params: Dict[str, Any]) -> None:
            '''
            Export with DuckDB access for complex queries.

            Args:
                df: Primary input DataFrame
                duckdb_con: DuckDB connection for additional queries
                params: Configuration parameters
            '''
            # Main data export
            df.write_csv(params["output_dir"] + "/main_data.csv")

            # Run additional aggregation queries
            summary = duckdb_con.execute('''
                SELECT
                    tier,
                    COUNT(*) as customer_count,
                    AVG(total_spent) as avg_spent
                FROM analytics.customers
                GROUP BY tier
            ''').pl()

            summary.write_csv(params["output_dir"] + "/summary.csv")

            # Export related data
            orders = duckdb_con.execute('''
                SELECT o.*
                FROM analytics.orders o
                JOIN analytics.customers c ON o.customer_id = c.customer_id
                WHERE c.tier = 'gold'
            ''').pl()

            orders.write_parquet(params["output_dir"] + "/gold_orders.parquet")
        ```
    """
    name = "python_export_query"

    def can_handle(self, target: Dict[str, Any]) -> bool:
        return target.get("runner") == "python_export_query"

    def write(self, table: Table, target: Dict[str, Any], out_dir: Path) -> Path:
        """Execute Python export with DuckDB access."""
        # This runner needs DuckDB connection from context
        # For now, we'll document it but the orchestrator would need to pass it
        log.warning(
            "python_export_query requires DuckDB connection in context. "
            "Use python_export for file-only exports without DuckDB access."
        )

        # Fallback to basic export
        basic_runner = PythonExportRunner()
        return basic_runner.write(table, target, out_dir)
