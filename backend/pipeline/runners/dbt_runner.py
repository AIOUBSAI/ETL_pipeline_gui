from __future__ import annotations
from pathlib import Path
from typing import Any, Dict
import subprocess
import duckdb
import logging


from pipeline.plugins.api import Reader
from pipeline.plugins.registry import register_reader
from pipeline.common.logger import get_logger

log = get_logger()
current_log_level = log.level


@register_reader
class DBTRunner(Reader):
    """
    Run DBT transformations as a transform stage runner.

    This runner executes DBT commands and manages the DuckDB connection.
    """
    name = "dbt_runner"

    def can_handle(self, source: Dict[str, Any]) -> bool:
        return source.get("runner") == "dbt_runner"

    def read(self, source: Dict[str, Any], ctx: Dict[str, Any]) -> Dict[str, Any]:
        """
        Execute DBT run and optionally DBT test.

        Returns empty dict as DBT operates directly on the DuckDB database.
        """
        opts = source.get("options", {})
        params = ctx.get("params", {})

        # Get DBT directories
        project_dir = Path(opts.get("project_dir", "."))
        if not project_dir.is_absolute():
            base_dir = Path(params.get("project_dir", "."))
            project_dir = base_dir / project_dir

        profiles_dir = Path(opts.get("profiles_dir", "./dbt"))
        if not profiles_dir.is_absolute():
            base_dir = Path(params.get("project_dir", "."))
            profiles_dir = base_dir / profiles_dir

        # DBT options
        models = opts.get("models", "")
        full_refresh = opts.get("full_refresh", False)
        run_tests = opts.get("test", True)
        generate_docs = opts.get("generate_docs", False)
        serve_docs = opts.get("serve_docs", False)
        debug = opts.get("debug", False)
        show_output = opts.get("show_output", False)

        is_dev_or_debug = str(current_log_level) in ('LogLevel.DEV', 'LogLevel.DEBUG')
        # Determine verbosity based on log level
        if is_dev_or_debug:
            show_output = True
            debug = True

        # Build vars from context params and explicit vars
        dbt_vars = {
            **params,
            **(opts.get("vars") or {})
        }

        # Close DuckDB connection before DBT runs
        con: duckdb.DuckDBPyConnection | None = ctx.get("duckdb")
        if con:
            try:
                con.close()
            except Exception:
                pass

        log.dev(f"Running DBT transformations...")

        # Build DBT run command
        cmd = [
            "dbt", "run",
            "--project-dir", str(project_dir),
            "--profiles-dir", str(profiles_dir),
        ]

        # Only use --quiet for user level (not dev or debug)
        if not is_dev_or_debug:
            cmd.append("--quiet")

        if models:
            cmd.extend(["--models", models])

        if full_refresh:
            cmd.append("--full-refresh")

        if dbt_vars:
            # Don't pass all environment variables - too verbose
            cmd.extend(["--vars", "{}"])

        if debug:
            cmd.append("--debug")

        log.debug(f"DBT command: {' '.join(cmd)}")

        # Run DBT - don't capture output if dev/debug so it prints in real-time
        if is_dev_or_debug:
            log.dev("=" * 60)
            log.dev("DBT OUTPUT:")
            log.dev("=" * 60)
            result = subprocess.run(
                cmd,
                cwd=str(project_dir) if project_dir.exists() else None
            )
            log.dev("=" * 60)

            if result.returncode != 0:
                raise RuntimeError(f"DBT run failed with code {result.returncode}")
        else:
            # User level - capture and summarize
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                cwd=str(project_dir) if project_dir.exists() else None
            )

            if result.returncode != 0:
                log.error(f"DBT run failed")
                log.debug(f"STDOUT:\n{result.stdout}")
                log.debug(f"STDERR:\n{result.stderr}")
                raise RuntimeError(f"DBT run failed with code {result.returncode}")

            # Parse output for summary
            lines = result.stdout.split('\n')
            for line in lines:
                if 'PASS=' in line and 'TOTAL=' in line:
                    import re
                    match = re.search(r'PASS=(\d+).*?ERROR=(\d+).*?TOTAL=(\d+)', line)
                    if match:
                        passed, errors, total = match.groups()
                        log.dev(f"DBT models: {passed}/{total} created successfully")
                    break

        # Run tests if enabled
        if run_tests:
            test_cmd = [
                "dbt", "test",
                "--project-dir", str(project_dir),
                "--profiles-dir", str(profiles_dir),
            ]

            if not is_dev_or_debug:
                test_cmd.append("--quiet")

            if models:
                test_cmd.extend(["--models", models])

            if debug:
                test_cmd.append("--debug")

            log.dev(f"Running DBT data quality tests...")

            if is_dev_or_debug:
                log.dev("=" * 60)
                log.dev("DBT TEST OUTPUT:")
                log.dev("=" * 60)
                test_result = subprocess.run(
                    test_cmd,
                    cwd=str(project_dir) if project_dir.exists() else None
                )
                log.dev("=" * 60)
            else:
                test_result = subprocess.run(
                    test_cmd,
                    capture_output=True,
                    text=True,
                    cwd=str(project_dir) if project_dir.exists() else None
                )

                # Parse test results
                test_lines = test_result.stdout.split('\n')
                for line in test_lines:
                    if 'PASS=' in line and 'TOTAL=' in line:
                        import re
                        match = re.search(r'PASS=(\d+).*?ERROR=(\d+).*?TOTAL=(\d+)', line)
                        if match:
                            passed, errors, total = match.groups()
                            if int(errors) > 0:
                                log.warning(f"DBT tests: {passed}/{total} passed, {errors} failed")
                            else:
                                log.dev(f"DBT tests: All {total} tests passed")
                        break

        # Generate DBT documentation if enabled
        if generate_docs:
            log.dev(f"Generating DBT documentation...")

            docs_cmd = [
                "dbt", "docs", "generate",
                "--project-dir", str(project_dir),
                "--profiles-dir", str(profiles_dir),
            ]

            if not is_dev_or_debug:
                docs_cmd.append("--quiet")

            if is_dev_or_debug:
                log.dev("=" * 60)
                log.dev("DBT DOCS GENERATION:")
                log.dev("=" * 60)
                docs_result = subprocess.run(
                    docs_cmd,
                    cwd=str(project_dir) if project_dir.exists() else None
                )
                log.dev("=" * 60)
            else:
                docs_result = subprocess.run(
                    docs_cmd,
                    capture_output=True,
                    text=True,
                    cwd=str(project_dir) if project_dir.exists() else None
                )

            if docs_result.returncode == 0:
                docs_path = project_dir / "target"
                log.user(f"DBT documentation generated: {docs_path}")

                # Optionally serve docs
                if serve_docs:
                    log.user(f"Starting DBT docs server (Ctrl+C to stop)...")
                    serve_cmd = [
                        "dbt", "docs", "serve",
                        "--project-dir", str(project_dir),
                        "--profiles-dir", str(profiles_dir),
                    ]
                    subprocess.run(
                        serve_cmd,
                        cwd=str(project_dir) if project_dir.exists() else None
                    )
            else:
                log.warning(f"DBT docs generation failed")

        # Reopen DuckDB connection
        db_config = ctx.get("database_config", {})
        db_path = db_config.get("path", "out/db/warehouse.duckdb")

        new_con = duckdb.connect(str(db_path))
        ctx["duckdb"] = new_con

        log.dev(f"DBT transformations complete")

        # Return empty dict - transformations are in DuckDB
        return {}
