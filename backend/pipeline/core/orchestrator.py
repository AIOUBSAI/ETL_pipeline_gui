"""
Orchestrator: Stage-based pipeline execution with DAG dependency resolution
Inspired by GitLab CI/CD architecture
"""
from __future__ import annotations

import os
import re
import time
from pathlib import Path
from typing import Any, Dict, List, Mapping, Optional, Set
from collections import defaultdict, deque

import polars as pl

from pipeline.plugins.api import Table
from pipeline.plugins.registry import (
    bootstrap_discovery,
    READERS,
    PROCESSORS,
    WRITERS,
    get_reader,
)
# Legacy db/ imports removed - now using engine plugins from pipeline/engines/
from pipeline.proc._signals import SkipTable
from pipeline.common.utils import ts
from pipeline.common.logger import get_logger
from pipeline.common.data_quality import QualityValidator
from pipeline.common.lineage import LineageTracker

__all__ = ["orchestrator"]

# Get logger instance
log = get_logger()


# ============================================================================
# Variable Expansion
# ============================================================================

_DOLLAR = re.compile(r"\$\{([^}]+)\}")
_BRACES = re.compile(r"\{([A-Za-z0-9_]+)\}")


def _expand(obj: Any, env: Mapping[str, Any]) -> Any:
    """Recursively expand ${VAR} and {VAR} in strings."""
    if obj is None:
        return None
    if isinstance(obj, str):
        s = _DOLLAR.sub(lambda m: str(env.get(m.group(1), "")), obj)
        s = _BRACES.sub(lambda m: str(env.get(m.group(1), "")), s)
        return s
    if isinstance(obj, Mapping):
        return {k: _expand(v, env) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_expand(v, env) for v in obj]
    if isinstance(obj, tuple):
        return tuple(_expand(v, env) for v in obj)
    return obj


# ============================================================================
# Job & Stage Management
# ============================================================================

class Job:
    """Represents a single job in the pipeline"""
    def __init__(
        self,
        name: str,
        stage: str,
        config: Dict[str, Any],
        runner_config: Optional[Dict[str, Any]] = None
    ):
        self.name = name
        self.stage = stage
        self.config = config
        self.runner_config = runner_config or {}
        self.depends_on: List[str] = config.get("depends_on", [])
        self.status: str = "pending"  # pending | running | success | failed | skipped
        self.output_table: Optional[str] = None
        self.error: Optional[str] = None

        # Detailed execution metrics
        self.start_time: Optional[float] = None
        self.end_time: Optional[float] = None
        self.duration: float = 0.0
        self.metrics: Dict[str, Any] = {}  # Store detailed execution metrics
        self.files_processed: List[Dict[str, Any]] = []  # File-level details
        self.row_counts: Dict[str, int] = {}  # Before/after row counts
        self.sql_executed: List[str] = []  # SQL statements executed
        self.processors_applied: List[Dict[str, Any]] = []  # Processor details
        self.validation_results: Dict[str, Any] = {}  # Data validation results
        self.schema_info: Dict[str, Any] = {}  # Schema and data type information

    def __repr__(self) -> str:
        return f"Job(name={self.name}, stage={self.stage}, status={self.status})"


class JobDAG:
    """Directed Acyclic Graph for job dependencies"""
    def __init__(self, jobs: List[Job]):
        self.jobs = {job.name: job for job in jobs}
        self.graph: Dict[str, Set[str]] = defaultdict(set)
        self._build_graph()

    def _build_graph(self) -> None:
        """Build dependency graph"""
        for job in self.jobs.values():
            for dep in job.depends_on:
                if dep not in self.jobs:
                    raise ValueError(f"Job '{job.name}' depends on unknown job '{dep}'")
                self.graph[dep].add(job.name)

    def get_ready_jobs(self, stage: str, completed: Set[str]) -> List[Job]:
        """Get jobs in stage that are ready to run (all dependencies completed)"""
        ready = []
        for job in self.jobs.values():
            if job.stage != stage:
                continue
            if job.status != "pending":
                continue
            # Check if all dependencies are completed
            deps_ready = all(dep in completed for dep in job.depends_on)
            if deps_ready:
                ready.append(job)
        return ready

    def topological_sort_within_stage(self, stage: str) -> List[str]:
        """Return jobs in stage in topological order"""
        stage_jobs = [j.name for j in self.jobs.values() if j.stage == stage]

        # Build in-degree map for stage jobs
        in_degree = {job: 0 for job in stage_jobs}
        stage_graph = defaultdict(list)

        for job_name in stage_jobs:
            job = self.jobs[job_name]
            for dep in job.depends_on:
                if dep in stage_jobs:
                    stage_graph[dep].append(job_name)
                    in_degree[job_name] += 1

        # Kahn's algorithm
        queue = deque([j for j in stage_jobs if in_degree[j] == 0])
        result = []

        while queue:
            node = queue.popleft()
            result.append(node)
            for neighbor in stage_graph[node]:
                in_degree[neighbor] -= 1
                if in_degree[neighbor] == 0:
                    queue.append(neighbor)

        if len(result) != len(stage_jobs):
            raise ValueError(f"Circular dependency detected in stage '{stage}'")

        return result


# ============================================================================
# Job Executors
# ============================================================================

class JobExecutor:
    """Execute different types of jobs"""

    def __init__(
        self,
        env: Dict[str, Any],
        duckdb_con: Optional[Any],
        out_dir: Path,
        in_memory_tables: Dict[str, Table],
        params: Optional[Dict[str, Any]] = None,
        database_config: Optional[Dict[str, Any]] = None,
        db_engine: Optional[Any] = None
    ):
        self.env = env
        self.duckdb_con = duckdb_con
        self.db_engine = db_engine  # Database engine plugin
        self.out_dir = out_dir
        self.in_memory_tables = in_memory_tables  # Store tables from extract stage
        self.params = params or {}
        self.database_config = database_config or {}

    def execute_extract_job(self, job: Job) -> None:
        """Execute an extract job (read from source)"""
        job.status = "running"
        job.start_time = time.perf_counter()

        try:
            # Get reader based on runner type
            runner_name = job.config.get("runner", "")
            runner_cfg = job.runner_config
            plugin_type = runner_cfg.get("plugin", "")

            input_cfg = job.config.get("input", {})
            description = job.config.get("description", "")

            # Log extract start with full config
            log.extract_start(
                job.name,
                plugin_type,
                input_cfg.get("path", ""),
                input_cfg.get("files", "")
            )

            # Show full input config in debug
            log.debug(f"  Full input config (after variable expansion):")
            for key, value in input_cfg.items():
                if isinstance(value, (str, int, float, bool)):
                    log.debug(f"    {key}: {value}")
                elif isinstance(value, (list, dict)):
                    log.debug(f"    {key}: {value}")

            # Build source config for reader
            # Merge runner options (like cache_workbooks) into source config
            # Runner options go first, input_cfg overrides them (preserves job-specific settings)
            runner_options = runner_cfg.get("options", {})
            source_config = {
                "name": job.name,
                "type": plugin_type,
                **runner_options,  # Add runner options first (e.g., cache_workbooks, cache_duration)
                **input_cfg,       # Input config takes precedence
                "processors": job.config.get("processors", []),
            }

            log.dev(f"  Getting reader for type: {plugin_type}")
            reader = get_reader(source_config)
            log.dev(f"  Reader class: {reader.__class__.__name__}")

            log.dev(f"  Reading files from source...")
            tables = list(reader.read(source_config, Path(".")))
            log.dev(f"  Reader returned {len(tables)} table(s)")

            if not tables:
                log.extract_no_data(job.name, "No files matched or all rows filtered")
                job.status = "success"
                return

            # Process tables with processors
            kept_tables = []
            total_rows = 0
            processors_cfg = job.config.get("processors", [])
            log.dev(f"  Applying {len(processors_cfg)} processor(s)")

            for table in tables:
                file_path = table.meta.get("file", "unknown")
                initial_rows = len(table.df)
                initial_cols = list(table.df.columns)

                log.extract_file(Path(file_path), len(table.df))
                log.debug(f"    Columns: {list(table.df.columns)}")

                processed = self._apply_processors(table, processors_cfg, job.name)
                if processed:
                    kept_tables.append(processed)
                    final_rows = len(processed.df)
                    final_cols = list(processed.df.columns)
                    total_rows += final_rows

                    # Get schema info from final dataframe
                    schema_details = {col: str(processed.df[col].dtype) for col in processed.df.columns}
                    sample_data = processed.df.head(3).to_dicts() if final_rows > 0 else []

                    # Track file-level details
                    job.files_processed.append({
                        "file": Path(file_path).name,
                        "path": str(file_path),
                        "initial_rows": initial_rows,
                        "initial_columns": len(initial_cols),
                        "initial_column_names": initial_cols,
                        "final_rows": final_rows,
                        "final_columns": len(final_cols),
                        "final_column_names": final_cols,
                        "rows_removed": initial_rows - final_rows,
                        "columns": final_cols,
                        "schema": schema_details,
                        "sample_data": sample_data
                    })

                    log.dev(f"    After processing: {len(processed.df)} rows, {list(processed.df.columns)[:5]}...")
                else:
                    job.files_processed.append({
                        "file": Path(file_path).name,
                        "path": str(file_path),
                        "initial_rows": initial_rows,
                        "initial_columns": len(initial_cols),
                        "final_rows": 0,
                        "final_columns": 0,
                        "rows_removed": initial_rows,
                        "skipped": True
                    })
                    log.dev(f"    Table skipped by processors")

            if not kept_tables:
                log.extract_no_data(job.name, "All rows filtered by processors")
                job.status = "success"
                return

            # Store in memory with output table name
            output_table_name = job.config.get("output", {}).get("table")
            if output_table_name and kept_tables:
                # For now, take first table (extend later for multi-table support)
                self.in_memory_tables[output_table_name] = kept_tables[0]
                job.output_table = output_table_name
                job.row_counts = {
                    "total_rows": total_rows,
                    "files_processed": len(kept_tables)
                }
                # Store processor details
                for proc_desc in processors_cfg:
                    proc_name, proc_opts = self._normalize_processor(proc_desc)
                    job.processors_applied.append({
                        "name": proc_name,
                        "options": proc_opts
                    })

                job.metrics = {
                    "runner": runner_name,
                    "plugin_type": plugin_type,
                    "reader_type": plugin_type,
                    "input_path": input_cfg.get("path", ""),
                    "files_pattern": input_cfg.get("files", ""),
                    "sheets": input_cfg.get("sheets", []),
                    "xpath": input_cfg.get("row_xpath", ""),
                    "recursive": input_cfg.get("recursive", False),
                    "encoding": input_cfg.get("encoding", "utf-8"),
                    "processors_count": len(processors_cfg)
                }

                # Store schema info
                if kept_tables:
                    job.schema_info = {
                        "output_table": output_table_name,
                        "column_types": {col: str(kept_tables[0].df[col].dtype) for col in kept_tables[0].df.columns},
                        "column_count": len(kept_tables[0].df.columns),
                        "nullable_columns": [col for col in kept_tables[0].df.columns if kept_tables[0].df[col].null_count() > 0]
                    }
                log.extract_success(job.name, output_table_name, len(kept_tables[0].df), len(kept_tables))

            job.status = "success"
            job.end_time = time.perf_counter()
            job.duration = job.end_time - job.start_time

        except Exception as e:
            job.status = "failed"
            job.error = str(e)
            job.end_time = time.perf_counter()
            job.duration = job.end_time - job.start_time if job.start_time else 0
            log.job_failed(job.stage, job.name, str(e))
            raise

    def execute_stage_job(self, job: Job) -> None:
        """Execute a stage job (load tables into DuckDB)"""
        job.status = "running"
        job.start_time = time.perf_counter()

        try:
            schema = job.config.get("schema", "staging")
            input_tables = job.config.get("input", {}).get("tables", [])
            options = job.config.get("options", {})
            table_prefix = options.get("table_prefix", "")
            table_mapping = options.get("table_mapping", {})  # NEW: explicit name mapping
            as_table = options.get("as_table", True)  # Default to TABLE, not VIEW
            if_exists = options.get("if_exists", "replace")

            log.stage_start(job.name, schema, len(input_tables))
            log.dev(f"  Storage type: {'TABLE' if as_table else 'VIEW'}")
            log.dev(f"  If exists: {if_exists}")
            if table_mapping:
                log.dev(f"  Table mapping: {table_mapping}")

            # Get tables from memory
            tables_to_stage = []
            for table_name in input_tables:
                if table_name in self.in_memory_tables:
                    table = self.in_memory_tables[table_name]
                    original_name = table.name

                    # Option 1: Use explicit mapping if provided
                    if table_name in table_mapping:
                        new_name = table_mapping[table_name]
                        table = Table(name=new_name, df=table.df, meta=table.meta)
                        log.dev(f"    Mapping: {original_name} -> {table.name}")
                    # Option 2: Apply table prefix if specified (legacy behavior)
                    elif table_prefix:
                        # Use the table_name from config (not sheet name) as base
                        new_name = table_prefix + table_name
                        table = Table(name=new_name, df=table.df, meta=table.meta)
                        log.dev(f"    Prefixing: {original_name} -> {table.name}")
                    # Option 3: Use table_name from config as-is
                    else:
                        # Rename to the config table name
                        table = Table(name=table_name, df=table.df, meta=table.meta)
                        if original_name != table_name:
                            log.dev(f"    Renaming: {original_name} -> {table.name}")

                    log.stage_table(table.name, len(table.df))
                    log.debug(f"      Will create: {schema}.{table.name} as {'TABLE' if as_table else 'VIEW'}")
                    tables_to_stage.append(table)

                    # Get schema info
                    table_schema = {col: str(table.df[col].dtype) for col in table.df.columns}

                    # Get sample data
                    sample_data = table.df.head(3).to_dicts() if len(table.df) > 0 else []

                    # Track staging details
                    job.files_processed.append({
                        "table": table.name,
                        "original_name": original_name,
                        "rows": len(table.df),
                        "columns": len(table.df.columns),
                        "column_names": list(table.df.columns),
                        "schema": table_schema,
                        "sample_data": sample_data
                    })

            if not tables_to_stage:
                log.job_skipped(job.stage, job.name, "No tables available in memory")
                job.status = "success"
                return

            # Register in database using engine plugin
            if self.duckdb_con and self.db_engine:
                replace = if_exists == "replace"
                # Use engine's staging method
                self.db_engine.register_tables(
                    self.duckdb_con,
                    tables_to_stage,
                    schema=schema,
                    replace=replace,
                    as_table=as_table
                )
                log.stage_success(job.name, schema, len(tables_to_stage))

            job.metrics = {
                "schema": schema,
                "database": "warehouse",
                "storage_type": "TABLE" if as_table else "VIEW",
                "if_exists_policy": if_exists,
                "table_prefix": table_prefix,
                "table_mapping": table_mapping
            }
            job.row_counts = {
                "tables_staged": len(tables_to_stage),
                "total_rows": sum(len(t.df) for t in tables_to_stage)
            }
            job.schema_info = {
                "target_schema": schema,
                "tables": {t.name: {"rows": len(t.df), "columns": list(t.df.columns)} for t in tables_to_stage}
            }
            job.status = "success"
            job.end_time = time.perf_counter()
            job.duration = job.end_time - job.start_time

        except Exception as e:
            job.status = "failed"
            job.error = str(e)
            job.end_time = time.perf_counter()
            job.duration = job.end_time - job.start_time if job.start_time else 0
            log.job_failed(job.stage, job.name, str(e))
            raise

    def execute_transform_job(self, job: Job) -> None:
        """Execute a transform job (run SQL or use runner like dbt_runner)"""
        job.status = "running"
        job.start_time = time.perf_counter()

        try:
            if not self.duckdb_con:
                raise ValueError("Transform job requires DuckDB connection")

            # Check if this is a runner-based transform (e.g., dbt_runner)
            runner_name = job.config.get("runner", "")
            if runner_name and runner_name != "sql_transform":
                # Use runner-based approach (like extract/stage)
                from pipeline.plugins.registry import get_reader

                ctx = {
                    "duckdb": self.duckdb_con,
                    "params": self.params,
                    "database_config": self.database_config,
                }

                source_cfg = {
                    "runner": runner_name,
                    "options": job.config.get("options", {}),
                }

                reader = get_reader(source_cfg)
                reader.read(source_cfg, ctx)

                # Update connection in case runner reopened it
                self.duckdb_con = ctx.get("duckdb", self.duckdb_con)

                log.transform_success(job.name, f"runner:{runner_name}")
                job.status = "success"
                return

            # Traditional SQL-based transform
            # Get SQL from inline or file
            sql = job.config.get("sql")
            sql_file = job.config.get("sql_file")

            sql_source = "inline"
            yaml_transform_results = None

            # Check if it's a YAML transformation file
            if sql_file and sql_file.endswith('.yaml'):
                from pipeline.runners.sql_yaml_runner import YamlSqlTransform

                sql_path = Path(sql_file)
                if not sql_path.exists():
                    raise FileNotFoundError(f"Transformation file not found: {sql_file}")

                log.transform_start(job.name, sql_file)

                # Load and execute YAML transformations
                yaml_transform = YamlSqlTransform(sql_path)
                yaml_transform_results = yaml_transform.execute_all(self.duckdb_con, job.name)

                # Store metadata for reporting
                job.metrics = {
                    "sql_source": sql_file,
                    "transformation_type": "YAML",
                    "runner": runner_name or "sql_transform",
                    "yaml_metadata": yaml_transform_results['metadata'],
                    "total_transformations": yaml_transform_results['total_count'],
                    "successful_transformations": yaml_transform_results['success_count'],
                    "failed_transformations": yaml_transform_results['failed_count'],
                }

                # Store individual transformations for detailed report
                job.validation_results = {
                    'transformations': yaml_transform_results['transformations']
                }

                # Extract all SQL statements for the SQL tab
                for t in yaml_transform_results['transformations']:
                    if t.get('sql'):
                        job.sql_executed.append(t['sql'])

                # Get tables created
                all_tables = []
                for t in yaml_transform_results['transformations']:
                    all_tables.extend(t.get('tables_created', []))
                if all_tables:
                    job.output_table = ', '.join(all_tables[:3])  # Show first 3 tables

                log.transform_success(job.name, f"{yaml_transform_results['success_count']} transformations")

            elif sql_file:
                # Traditional .sql file
                sql_path = Path(sql_file)
                if not sql_path.exists():
                    raise FileNotFoundError(f"SQL file not found: {sql_file}")
                sql = sql_path.read_text(encoding="utf-8")
                sql_source = sql_file

                log.transform_start(job.name, sql_source)
                log.transform_sql(sql)

                # Store SQL for report
                job.sql_executed.append(sql)

                # Execute SQL
                self.duckdb_con.execute(sql)

                # Try to extract table name from CREATE TABLE statement
                table_created = ""
                if "CREATE" in sql.upper() and "TABLE" in sql.upper():
                    import re
                    match = re.search(r'CREATE\s+(?:OR\s+REPLACE\s+)?TABLE\s+([^\s(]+)', sql, re.IGNORECASE)
                    if match:
                        table_created = match.group(1)
                        job.output_table = table_created

                        # Get detailed table info
                        try:
                            row_count = self.duckdb_con.execute(f"SELECT COUNT(*) FROM {table_created}").fetchone()[0]
                            job.row_counts = {"rows_created": row_count}

                            # Get schema
                            schema_query = f"PRAGMA table_info('{table_created}')"
                            schema_result = self.duckdb_con.execute(schema_query).fetchall()
                            job.schema_info = {
                                "table": table_created,
                                "columns": {row[1]: {"type": row[2], "nullable": not row[3]} for row in schema_result},
                                "row_count": row_count
                            }
                        except Exception:
                            pass

                job.metrics = {
                    "sql_source": sql_source,
                    "sql_length": len(sql),
                    "sql_lines": len(sql.split('\n')),
                    "table_created": table_created,
                    "transformation_type": "SQL",
                    "runner": runner_name or "sql_transform"
                }

                log.transform_success(job.name, table_created)

            elif sql:
                # Inline SQL
                log.transform_start(job.name, "inline")
                log.transform_sql(sql)

                # Store SQL for report
                job.sql_executed.append(sql)

                # Execute SQL
                self.duckdb_con.execute(sql)

                job.metrics = {
                    "sql_source": "inline",
                    "sql_length": len(sql),
                    "sql_lines": len(sql.split('\n')),
                    "transformation_type": "SQL",
                    "runner": runner_name or "sql_transform"
                }

                log.transform_success(job.name, "inline SQL")

            else:
                raise ValueError(f"Job '{job.name}' has no SQL to execute")

            job.status = "success"
            job.end_time = time.perf_counter()
            job.duration = job.end_time - job.start_time

        except Exception as e:
            job.status = "failed"
            job.error = str(e)
            job.end_time = time.perf_counter()
            job.duration = job.end_time - job.start_time if job.start_time else 0
            log.job_failed(job.stage, job.name, str(e))
            raise

    def execute_load_job(self, job: Job) -> None:
        """Execute a load job (write to file)"""
        job.status = "running"
        job.start_time = time.perf_counter()

        try:
            runner_name = job.config.get("runner", "")
            runner_cfg = job.runner_config
            # Use runner_name as plugin type (e.g., json_writer, xml_writer)
            plugin_type = runner_cfg.get("plugin", "") or runner_name

            # Get data from DuckDB
            input_config = job.config.get("input", {})
            table_name = input_config.get("table")
            query = input_config.get("query")
            output_path = job.config.get("output", {}).get("path", "")

            log.load_start(job.name, plugin_type, output_path)

            if not self.duckdb_con:
                raise ValueError("Load job requires database connection")

            # Execute query and convert to Polars DataFrame
            if query:
                log.load_query(query)
                result = self.db_engine.execute(self.duckdb_con, query)
            elif table_name:
                result = self.db_engine.execute(self.duckdb_con, f"SELECT * FROM {table_name}")
            else:
                raise ValueError(f"Job '{job.name}' has no table or query specified")

            # Convert result to Polars DataFrame
            # For DuckDB, result has .pl() method
            # For SQLite, we need to fetch and convert manually
            if hasattr(result, 'pl'):
                # DuckDB
                df = result.pl()
            else:
                # SQLite or other - fetch all and convert
                import polars as pl
                rows = result.fetchall()
                if rows:
                    columns = [desc[0] for desc in result.description]
                    df = pl.DataFrame({col: [row[i] for row in rows] for i, col in enumerate(columns)})
                else:
                    df = pl.DataFrame()

            # Get writer
            writer_cls = WRITERS.get(plugin_type)
            if not writer_cls:
                raise ValueError(f"Unknown writer plugin: {plugin_type}")

            writer = writer_cls()
            table = Table(name=job.name, df=df, meta={})

            # Build target config
            target = {
                "writer": plugin_type,
                **job.config.get("output", {})
            }

            # Write
            writer.write(table=table, target=target, out_dir=self.out_dir)

            # Track metrics
            file_size = Path(output_path).stat().st_size if Path(output_path).exists() else 0
            job.metrics = {
                "writer": plugin_type,
                "writer_type": plugin_type,
                "output_path": output_path,
                "output_format": target.get("format", "default"),
                "output_extension": Path(output_path).suffix,
                "source_table": table_name or "query",
                "file_size_kb": round(file_size / 1024, 2),
                "indent": target.get("indent", ""),
                "root_element": target.get("root_element", ""),
                "row_element": target.get("row_element", ""),
                "runner": runner_name
            }
            job.row_counts = {
                "rows_exported": len(df),
                "columns_exported": len(df.columns)
            }
            job.schema_info = {
                "columns": list(df.columns),
                "column_types": {col: str(df[col].dtype) for col in df.columns}
            }
            # Store SQL if query was used
            if query:
                job.sql_executed.append(query)

            # Get sample data from exported dataframe
            sample_data = df.head(3).to_dicts() if len(df) > 0 else []

            job.files_processed.append({
                "file": Path(output_path).name,
                "path": output_path,
                "rows": len(df),
                "columns": len(df.columns),
                "column_names": list(df.columns),
                "size_bytes": file_size,
                "size_kb": round(file_size / 1024, 2),
                "schema": {col: str(df[col].dtype) for col in df.columns},
                "sample_data": sample_data
            })

            log.load_success(job.name, output_path, len(df))
            job.status = "success"
            job.end_time = time.perf_counter()
            job.duration = job.end_time - job.start_time

        except Exception as e:
            job.status = "failed"
            job.error = str(e)
            job.end_time = time.perf_counter()
            job.duration = job.end_time - job.start_time if job.start_time else 0
            log.job_failed(job.stage, job.name, str(e))
            raise

    def _apply_processors(self, table: Table, processors_config: List[Any], job_name: str = "") -> Optional[Table]:
        """Apply processors to a table"""
        df = table.df
        initial_rows = len(df)
        initial_cols = list(df.columns)

        log.debug(f"    Starting processors: {initial_rows} rows, {len(initial_cols)} columns")

        for i, proc_desc in enumerate(processors_config, 1):
            proc_name, proc_opts = self._normalize_processor(proc_desc)
            if not proc_name:
                continue

            rows_before = len(df)
            cols_before = list(df.columns)

            proc_cls = PROCESSORS.get(proc_name)
            if not proc_cls:
                raise ValueError(f"Unknown processor: {proc_name}")

            processor = proc_cls()
            ctx = {"processor_options": proc_opts, "duckdb": self.duckdb_con}

            log.dev(f"    Processor {i}/{len(processors_config)}: {proc_name}")
            if proc_opts:
                log.debug(f"      Options: {proc_opts}")

            try:
                df = processor.process(df, ctx)
            except SkipTable as e:
                log.dev(f"      -> Table skipped by {proc_name}")
                return None
            except Exception as e:
                log.error(f"      -> Processor {proc_name} failed: {e}")
                raise

            if not isinstance(df, pl.DataFrame):
                raise TypeError(f"Processor '{proc_name}' must return polars.DataFrame")

            rows_after = len(df)
            cols_after = list(df.columns)

            # Log changes
            if rows_after != rows_before:
                log.dev(f"      -> Rows: {rows_before} -> {rows_after} ({rows_after - rows_before:+d})")
            if cols_after != cols_before:
                added = set(cols_after) - set(cols_before)
                removed = set(cols_before) - set(cols_after)
                if added:
                    log.debug(f"      -> Added columns: {added}")
                if removed:
                    log.debug(f"      -> Removed columns: {removed}")
                log.dev(f"      -> Columns: {len(cols_before)} -> {len(cols_after)}")

        final_rows = len(df)
        final_cols = len(df.columns)
        log.dev(f"    Processors complete: {initial_rows} -> {final_rows} rows, {len(initial_cols)} -> {final_cols} columns")

        return Table(name=table.name, df=df, meta=table.meta)

    @staticmethod
    def _normalize_processor(pdesc: Any) -> tuple[str, Dict[str, Any]]:
        """Parse processor config - extracts name and all other keys as options"""
        if isinstance(pdesc, str):
            return pdesc, {}
        if isinstance(pdesc, dict):
            name = str(pdesc.get("name", ""))
            # If explicit "options" key exists, use it
            if "options" in pdesc:
                return name, pdesc.get("options") or {}
            # Otherwise, all keys except "name" are treated as options
            options = {k: v for k, v in pdesc.items() if k != "name"}
            return name, options
        return "", {}


# ============================================================================
# Main Orchestrator
# ============================================================================

def orchestrator(
    pipeline_config: Mapping[str, Any],
    out_dir: Path,
    ctx: Optional[Mapping[str, Any]] = None,
) -> None:
    """
    Execute pipeline using stage-based architecture with job dependencies.

    Pipeline structure:
      - stages: [extract, stage, transform, load]
      - jobs: {job_name: {stage, runner, input, output, depends_on}}
      - runners: {runner_name: {type, plugin, options}}
      - databases: {db_name: {type, path, schemas}}
    """
    # Log pipeline start
    pipeline_meta = pipeline_config.get('pipeline', {})
    log.pipeline_start(
        pipeline_meta.get('name', 'Unnamed'),
        pipeline_meta.get('version', '')
    )

    bootstrap_discovery()

    # Build environment from OS env and pipeline variables
    pipeline_vars = pipeline_config.get("variables") or {}

    # First, expand variables in the variables section itself (for nested references)
    env: Dict[str, Any] = dict(os.environ)

    # Expand pipeline variables (they may reference each other or OS env)
    for key, value in pipeline_vars.items():
        if isinstance(value, str):
            # Expand using current env state
            expanded = _expand(value, env)
            env[key] = expanded
        else:
            env[key] = value

    log.dev(f"Environment variables after expansion:")
    for key in sorted(pipeline_vars.keys()):
        log.debug(f"  {key} = {env[key]}")

    # Expand variables in config
    log.dev("Expanding variables in configuration...")
    config = _expand(pipeline_config, env)
    log.dev("Variable expansion complete")

    # Open database using plugin system
    databases = config.get("databases", {})
    warehouse_cfg = databases.get("warehouse", {})
    duckdb_con = None
    db_engine = None

    if warehouse_cfg:
        from pipeline.plugins.registry import get_database_engine

        db_type = warehouse_cfg.get("type", "duckdb")
        db_path = warehouse_cfg.get("path")
        reset = warehouse_cfg.get("reset_on_start", False)

        # Handle reset (for file-based databases)
        if reset and db_path and db_path != ":memory:":
            db_path_obj = Path(db_path)
            if db_path_obj.exists():
                log.db_reset(str(db_path))
                db_path_obj.unlink()

        # Get appropriate database engine plugin
        db_engine = get_database_engine(warehouse_cfg)
        log.dev(f"Using database engine: {db_engine.name}")

        # Connect using plugin
        duckdb_con = db_engine.connect(warehouse_cfg)

        # Create schemas
        for schema in warehouse_cfg.get("schemas", []):
            try:
                duckdb_con.execute(f"CREATE SCHEMA IF NOT EXISTS {schema}")
                log.db_schema_created(schema)
            except Exception as e:
                log.warning(f"Failed to create schema {schema}: {e}")

        log.db_connect(db_engine.name.upper(), str(db_path) if db_path else "in-memory")

    try:
        # Parse jobs and runners
        jobs_config = config.get("jobs", {})
        runners_config = config.get("runners", {})
        stages_list = config.get("stages", [])

        if not jobs_config:
            log.warning("No jobs defined in pipeline")
            return

        # Create Job objects
        jobs = []
        for job_name, job_cfg in jobs_config.items():
            stage = job_cfg.get("stage")
            runner_name = job_cfg.get("runner", "")
            runner_cfg = runners_config.get(runner_name, {})

            job = Job(name=job_name, stage=stage, config=job_cfg, runner_config=runner_cfg)
            jobs.append(job)

        # Build DAG
        dag = JobDAG(jobs)

        # In-memory table storage
        in_memory_tables: Dict[str, Table] = {}

        # Initialize quality and lineage tracking
        quality_results = []
        lineage_tracker = LineageTracker()

        # Execute stages in order
        completed_jobs: Set[str] = set()
        executor = JobExecutor(
            env=env,
            duckdb_con=duckdb_con,
            out_dir=out_dir,
            in_memory_tables=in_memory_tables,
            params=env,
            db_engine=db_engine,
            database_config=warehouse_cfg
        )

        # Track start time
        import time
        t0 = time.perf_counter()

        for stage in stages_list:
            log.stage(stage)

            # Get jobs for this stage
            stage_jobs = [j for j in jobs if j.stage == stage]
            if not stage_jobs:
                log.dev(f"No jobs in stage '{stage}'")
                continue

            # Execute jobs respecting dependencies
            while True:
                ready_jobs = dag.get_ready_jobs(stage, completed_jobs)
                if not ready_jobs:
                    break

                # Execute ready jobs (could parallelize here)
                for job in ready_jobs:
                    try:
                        # Determine job type by runner type
                        runner_name = job.config.get("runner", "")
                        runner_cfg = job.runner_config
                        runner_type = runner_cfg.get("type", "") if runner_cfg else ""

                        # Route to appropriate executor based on runner type
                        if runner_type == "reader":
                            executor.execute_extract_job(job)
                        elif runner_type == "stager":
                            executor.execute_stage_job(job)
                        elif runner_type == "transformer":
                            executor.execute_transform_job(job)
                        elif runner_type == "writer":
                            executor.execute_load_job(job)
                        else:
                            # Fallback: try to guess by stage name prefix
                            stage_lower = stage.lower()
                            if "extract" in stage_lower:
                                executor.execute_extract_job(job)
                            elif "stage" in stage_lower or "stag" in stage_lower:
                                executor.execute_stage_job(job)
                            elif "transform" in stage_lower:
                                executor.execute_transform_job(job)
                            elif "load" in stage_lower or "export" in stage_lower:
                                # Support both "load" (legacy) and "export" (new naming)
                                executor.execute_load_job(job)
                            else:
                                raise ValueError(f"Cannot determine job type for stage '{stage}'. Runner '{runner_name}' has no 'type' field")

                        completed_jobs.add(job.name)

                    except Exception as e:
                        execution_policy = config.get("execution", {})
                        on_error = execution_policy.get("on_error", "stop")

                        if on_error == "stop":
                            raise
                        elif on_error == "continue":
                            log.warning(f"Job '{job.name}' failed, continuing: {e}")
                            job.status = "failed"
                            completed_jobs.add(job.name)  # Mark as completed to unblock dependents
                        else:
                            raise

        # Summary
        elapsed = time.perf_counter() - t0
        success = sum(1 for j in jobs if j.status == "success")
        failed = sum(1 for j in jobs if j.status == "failed")
        skipped = sum(1 for j in jobs if j.status == "pending")

        log.pipeline_summary(len(jobs), success, failed, skipped, elapsed)

        if failed > 0:
            failed_jobs = [(j.name, j.error or "Unknown error") for j in jobs if j.status == "failed"]
            log.pipeline_failed_jobs(failed_jobs)

        # Generate pipeline report if enabled
        report_config = config.get("reporting", {})
        if report_config.get("enabled", False):
            try:
                from pipeline.common.reporter import generate_pipeline_report
                from pipeline.common.config_models import PipelineConfig, get_validation_summary

                pipeline_name = pipeline_meta.get('name', 'Unnamed')
                report_path = out_dir / report_config.get("path", "report.html")

                # Validate config and extract summary for report
                config_validation_info = None
                try:
                    validated_config = PipelineConfig(**config)
                    config_validation_info = get_validation_summary(validated_config)
                    log.dev("Configuration validated successfully for reporting")
                except Exception as e:
                    log.warning(f"Config validation for report failed: {e}")

                log.dev(f"Generating pipeline report: {report_path}")
                generate_pipeline_report(
                    pipeline_name=pipeline_name,
                    jobs=jobs,
                    output_path=report_path,
                    duckdb_con=duckdb_con,
                    report_config=report_config,
                    config_validation_info=config_validation_info,
                    quality_results=quality_results,
                    lineage_tracker=lineage_tracker
                )
                log.info(f"Pipeline report generated: {report_path}")
            except Exception as e:
                log.warning(f"Failed to generate pipeline report: {e}")

    finally:
        # Close database using engine plugin or fallback to legacy method
        if db_engine and duckdb_con:
            db_engine.close(duckdb_con)
        elif duckdb_con:
            close_quietly(duckdb_con)
