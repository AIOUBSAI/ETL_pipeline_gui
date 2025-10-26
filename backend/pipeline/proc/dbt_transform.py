from __future__ import annotations
from pathlib import Path
from typing import Any, Dict
import subprocess
import os
import polars as pl
import duckdb

from pipeline.plugins.api import Processor
from pipeline.plugins.registry import register_processor
from pipeline.common.logger import get_logger

log = get_logger()


@register_processor
class DBTTransform(Processor):
    """
    Run DBT models for transformations.

    Options:
      - project_dir (str): Path to DBT project root (default: './dbt' or from ctx)
      - profiles_dir (str): Path to DBT profiles directory (default: './dbt')
      - models (str): DBT model selector (default: all models)
      - full_refresh (bool): Run with --full-refresh flag (default: False)
      - test (bool): Run dbt test after models (default: True)
      - vars (dict): DBT vars to pass via --vars
      - debug (bool): Enable DBT debug output (default: False)

    Context:
      - ctx['duckdb']: duckdb.DuckDBPyConnection (connection will be closed/reopened)
      - ctx['params']: optional mapping merged with vars
    """
    name = "dbt_transform"
    order = 100

    def applies_to(self, ctx: Dict[str, Any]) -> bool:
        return True

    def process(self, df: pl.DataFrame, ctx: Dict[str, Any]) -> pl.DataFrame:
        opts: Dict[str, Any] = ctx.get("processor_options", {})

        # Get DBT directories
        project_dir = Path(opts.get("project_dir", "dbt"))
        if not project_dir.is_absolute():
            base_dir = Path(ctx.get("params", {}).get("project_dir", "."))
            project_dir = base_dir / project_dir

        profiles_dir = Path(opts.get("profiles_dir", "dbt"))
        if not profiles_dir.is_absolute():
            base_dir = Path(ctx.get("params", {}).get("project_dir", "."))
            profiles_dir = base_dir / profiles_dir

        # DBT options
        models = opts.get("models", "")
        full_refresh = opts.get("full_refresh", False)
        run_tests = opts.get("test", True)
        debug = opts.get("debug", False)

        # Build vars from context params and explicit vars
        dbt_vars = {
            **(ctx.get("params") or {}),
            **(opts.get("vars") or {})
        }

        # Close DuckDB connection before DBT runs (DBT will open its own)
        con: duckdb.DuckDBPyConnection | None = ctx.get("duckdb")
        if con:
            try:
                con.close()
            except Exception:
                pass

        # Build DBT run command
        cmd = [
            "dbt", "run",
            "--project-dir", str(project_dir),
            "--profiles-dir", str(profiles_dir)
        ]

        if models:
            cmd.extend(["--models", models])

        if full_refresh:
            cmd.append("--full-refresh")

        if dbt_vars:
            import json
            cmd.extend(["--vars", json.dumps(dbt_vars)])

        if debug:
            cmd.append("--debug")

        log.dev(f"[dbt_transform] Running: {' '.join(cmd)}")

        # Run DBT
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            cwd=str(project_dir.parent) if project_dir.parent.exists() else None
        )

        if result.returncode != 0:
            log.error(f"[dbt_transform] STDOUT:\n{result.stdout}")
            log.error(f"[dbt_transform] STDERR:\n{result.stderr}")
            raise RuntimeError(f"DBT run failed with code {result.returncode}")

        if debug or opts.get("show_output", False):
            log.debug(f"[dbt_transform] Output:\n{result.stdout}")

        # Run tests if enabled
        if run_tests:
            test_cmd = [
                "dbt", "test",
                "--project-dir", str(project_dir),
                "--profiles-dir", str(profiles_dir)
            ]

            if models:
                test_cmd.extend(["--models", models])

            log.dev("[dbt_transform] Running tests...")
            test_result = subprocess.run(
                test_cmd,
                capture_output=True,
                text=True,
                cwd=str(project_dir.parent) if project_dir.parent.exists() else None
            )

            if test_result.returncode != 0:
                log.error(f"[dbt_transform] Test STDOUT:\n{test_result.stdout}")
                log.error(f"[dbt_transform] Test STDERR:\n{test_result.stderr}")
                log.warning("[dbt_transform] WARNING: Some DBT tests failed")
            elif debug:
                log.debug(f"[dbt_transform] Tests passed:\n{test_result.stdout}")

        # Reopen DuckDB connection
        db_path = Path(opts.get("db_path", "out/db/warehouse.duckdb"))
        if not db_path.is_absolute():
            base_dir = Path(ctx.get("params", {}).get("project_dir", "."))
            db_path = base_dir / db_path

        new_con = duckdb.connect(str(db_path))
        ctx["duckdb"] = new_con

        log.dev("[dbt_transform] DBT transformation complete")

        # Return the input dataframe (transformations are in DuckDB)
        return df
