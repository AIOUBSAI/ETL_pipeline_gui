"""
Pipeline execution reporter - generates HTML reports with DBT integration
"""
from __future__ import annotations
from pathlib import Path
from typing import Any, Dict, List
from datetime import datetime
import json

from pipeline.common.logger import get_logger

log = get_logger()


def _load_dbt_results(dbt_dir: Path) -> Dict[str, Any]:
    """Load DBT run results and manifest"""
    results = {}

    # Load run_results.json
    run_results_path = dbt_dir / "target" / "run_results.json"
    if run_results_path.exists():
        try:
            with open(run_results_path, 'r', encoding='utf-8') as f:
                results['run_results'] = json.load(f)
        except Exception:
            pass

    # Load manifest.json (metadata about models)
    manifest_path = dbt_dir / "target" / "manifest.json"
    if manifest_path.exists():
        try:
            with open(manifest_path, 'r', encoding='utf-8') as f:
                manifest = json.load(f)
                # Extract models, tests, sources, and documentation
                results['models'] = {
                    k: v for k, v in manifest.get('nodes', {}).items()
                    if v.get('resource_type') in ['model', 'test', 'snapshot']
                }
                results['sources'] = manifest.get('sources', {})
                results['docs'] = manifest.get('docs', {})
                results['macros'] = {
                    k: v for k, v in manifest.get('macros', {}).items()
                    if not k.startswith('macro.dbt.')  # Exclude dbt built-in macros
                }
        except Exception:
            pass

    return results


def _parse_dbt_logs(log_path: Path) -> Dict[str, Any]:
    """Parse DBT logs for detailed model information"""
    if not log_path.exists():
        return {}

    model_details = []
    current_run = {}

    try:
        with open(log_path, 'r', encoding='utf-8') as f:
            for line in f:
                # Extract model execution info
                if 'OK created' in line or 'ERROR creating' in line:
                    import re
                    # Pattern: "1 of 2 OK created sql table model landing.sgt_mbs_variables ............ [OK] in 0.07s"
                    match = re.search(r'(\d+) of (\d+) (OK|ERROR) created? (\w+) (\w+) model ([\w.]+)', line)
                    if match:
                        status = match.group(3)
                        model_type = match.group(4)  # sql
                        object_type = match.group(5)  # table/view
                        model_name = match.group(6)  # landing.sgt_mbs_variables

                        # Extract timing
                        time_match = re.search(r'in ([\d.]+)s', line)
                        exec_time = float(time_match.group(1)) if time_match else 0.0

                        # Extract timestamp
                        ts_match = re.match(r'\[0m([\d:\.]+)', line)
                        timestamp = ts_match.group(1) if ts_match else ''

                        model_details.append({
                            'model_name': model_name.split('.')[-1],
                            'full_path': model_name,
                            'status': status.lower(),
                            'model_type': model_type,
                            'object_type': object_type,
                            'execution_time': exec_time,
                            'timestamp': timestamp
                        })

                # Extract compilation info
                elif 'Compiling model' in line:
                    match = re.search(r'Compiling model ([\w.]+)', line)
                    if match:
                        current_run['compiling'] = match.group(1)

    except Exception:
        pass

    return {'model_details': model_details}


def _load_pipeline_logs(log_path: Path) -> List[str]:
    """Load recent pipeline logs"""
    if not log_path.exists():
        return []

    try:
        with open(log_path, 'r', encoding='utf-8') as f:
            # Get last 200 lines
            lines = f.readlines()
            return lines[-200:] if len(lines) > 200 else lines
    except Exception:
        return []


def generate_pipeline_report(
    pipeline_name: str,
    jobs: List[Any],
    output_path: Path,
    duckdb_con: Any = None,
    report_config: Dict[str, Any] = None,
    config_validation_info: Dict[str, Any] = None,
    quality_results: List[Any] = None,
    lineage_tracker: Any = None
) -> None:
    """
    Generate an HTML report of pipeline execution.

    Args:
        pipeline_name: Name of the pipeline
        jobs: List of Job objects from orchestrator
        output_path: Where to save the HTML report
        duckdb_con: Optional DuckDB connection for data stats
        report_config: Optional reporting configuration
        config_validation_info: Optional Pydantic config validation results
        quality_results: Optional list of QualityResult objects
        lineage_tracker: Optional LineageTracker instance
    """
    from jinja2 import Template

    report_config = report_config or {}
    include_dbt = report_config.get("include_dbt_results", True)
    include_logs = report_config.get("include_detailed_logs", True)

    # Default config validation info if not provided
    config_validation_info = config_validation_info or {}

    # Collect job statistics
    total_jobs = len(jobs)
    succeeded = sum(1 for j in jobs if j.status == "success")
    failed = sum(1 for j in jobs if j.status == "failed")
    skipped = sum(1 for j in jobs if j.status == "pending")

    # Group jobs by stage
    jobs_by_stage: Dict[str, List[Any]] = {}
    for job in jobs:
        if job.stage not in jobs_by_stage:
            jobs_by_stage[job.stage] = []
        jobs_by_stage[job.stage].append(job)

    # Get table statistics from DuckDB if available
    table_stats = []
    schema_stats = {}
    if duckdb_con:
        try:
            # Get all tables from all schemas
            schemas_query = """
                SELECT DISTINCT table_schema
                FROM information_schema.tables
                WHERE table_schema NOT IN ('information_schema', 'pg_catalog')
            """
            schemas = duckdb_con.execute(schemas_query).fetchall()

            for (schema_name,) in schemas:
                tables = duckdb_con.execute(
                    f"SELECT table_name FROM information_schema.tables WHERE table_schema = '{schema_name}'"
                ).fetchall()

                schema_tables = []
                for (table_name,) in tables:
                    try:
                        count = duckdb_con.execute(
                            f"SELECT COUNT(*) FROM {schema_name}.{table_name}"
                        ).fetchone()[0]

                        # Get column count
                        cols = duckdb_con.execute(
                            f"SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = '{schema_name}' AND table_name = '{table_name}'"
                        ).fetchone()[0]

                        schema_tables.append({
                            "table": table_name,
                            "rows": count,
                            "columns": cols
                        })
                        table_stats.append({
                            "schema": schema_name,
                            "table": table_name,
                            "rows": count,
                            "columns": cols
                        })
                    except Exception:
                        pass

                if schema_tables:
                    schema_stats[schema_name] = schema_tables

        except Exception:
            pass

    # Load DBT results if enabled
    dbt_results = {}
    dbt_summary = {}
    dbt_log_details = {}
    if include_dbt:
        dbt_dir = output_path.parent.parent / "dbt"
        log_dir = output_path.parent.parent / "logs"

        # Parse DBT logs for execution details
        dbt_log_path = log_dir / "dbt.log"
        if dbt_log_path.exists():
            dbt_log_details = _parse_dbt_logs(dbt_log_path)

        if dbt_dir.exists():
            dbt_results = _load_dbt_results(dbt_dir)

            # Build DBT summary
            if 'run_results' in dbt_results:
                run_res = dbt_results['run_results']
                results_list = run_res.get('results', [])

                # Enrich results with model details from manifest and logs
                enriched_results = []
                log_models = {m['full_path']: m for m in dbt_log_details.get('model_details', [])}

                for result in results_list:
                    unique_id = result.get('unique_id', '')
                    enriched = result.copy()

                    # Get model details from manifest
                    if unique_id in dbt_results.get('models', {}):
                        model_info = dbt_results['models'][unique_id]
                        enriched['model_name'] = model_info.get('name', '')
                        enriched['description'] = model_info.get('description', '')
                        enriched['schema'] = model_info.get('schema', '')
                        enriched['database'] = model_info.get('database', '')
                        enriched['columns'] = model_info.get('columns', {})
                        enriched['depends_on'] = model_info.get('depends_on', {})
                        enriched['tags'] = model_info.get('tags', [])
                        enriched['raw_sql'] = model_info.get('raw_sql', '')
                        enriched['compiled_sql'] = model_info.get('compiled_sql', '')
                        enriched['materialization'] = model_info.get('config', {}).get('materialized', 'view')

                        # Add log details if available
                        full_path = f"{enriched.get('schema', '')}.{enriched.get('model_name', '')}"
                        if full_path in log_models:
                            log_info = log_models[full_path]
                            enriched['object_type'] = log_info.get('object_type', '')
                            enriched['model_type'] = log_info.get('model_type', '')

                    enriched_results.append(enriched)

                dbt_summary = {
                    'elapsed_time': run_res.get('elapsed_time', 0),
                    'success': sum(1 for r in results_list if r.get('status') == 'success'),
                    'error': sum(1 for r in results_list if r.get('status') == 'error'),
                    'skipped': sum(1 for r in results_list if r.get('status') == 'skipped'),
                    'results': enriched_results,
                    'sources_count': len(dbt_results.get('sources', {})),
                    'macros_count': len(dbt_results.get('macros', {})),
                    'log_details': dbt_log_details.get('model_details', [])
                }

    # Process quality results
    quality_summary = {}
    quality_results = quality_results or []
    if quality_results:
        total_checks = len(quality_results)
        passed_checks = sum(1 for r in quality_results if r.passed)
        failed_checks = total_checks - passed_checks

        quality_summary = {
            "total_checks": total_checks,
            "passed": passed_checks,
            "failed": failed_checks,
            "pass_rate": (passed_checks / total_checks * 100) if total_checks > 0 else 0.0,
            "results": [
                {
                    "name": r.expectation_name,
                    "type": r.expectation_type.value,
                    "passed": r.passed,
                    "rows_evaluated": r.rows_evaluated,
                    "rows_failed": r.rows_failed,
                    "failure_pct": r.failure_pct,
                    "message": r.message
                }
                for r in quality_results
            ]
        }

    # Process lineage data
    lineage_data = {}
    if lineage_tracker:
        lineage_data = lineage_tracker.to_dict()
        # Also get graph for visualization
        lineage_data["graph"] = lineage_tracker.get_lineage_graph()

    # Load logs if enabled
    log_lines = []
    if include_logs:
        log_path = output_path.parent.parent / "logs" / "dbt.log"
        log_lines = _load_pipeline_logs(log_path)

    # Build report HTML
    template_path = Path(__file__).parent.parent.parent / "templates" / "report.html.j2"

    if not template_path.exists():
        # Create enhanced template
        template_content = """<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{{ pipeline_name }} - Execution Report</title>
    <style>
        * { box-sizing: border-box; }
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            margin: 0;
            padding: 20px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            line-height: 1.6;
        }
        .container {
            max-width: 1400px;
            margin: 0 auto;
            background-color: white;
            padding: 30px;
            border-radius: 12px;
            box-shadow: 0 10px 40px rgba(0,0,0,0.2);
        }
        h1 {
            color: #2c3e50;
            border-bottom: 3px solid #3498db;
            padding-bottom: 10px;
            margin-top: 0;
        }
        h2 {
            color: #34495e;
            margin-top: 30px;
            border-bottom: 2px solid #ecf0f1;
            padding-bottom: 8px;
        }
        h3 {
            color: #34495e;
            margin-top: 20px;
        }
        .stats {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 20px;
            margin: 20px 0;
        }
        .stat-card {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 20px;
            border-radius: 8px;
            text-align: center;
            box-shadow: 0 4px 6px rgba(0,0,0,0.1);
        }
        .stat-card.success { background: linear-gradient(135deg, #11998e 0%, #38ef7d 100%); }
        .stat-card.failed { background: linear-gradient(135deg, #eb3349 0%, #f45c43 100%); }
        .stat-card.skipped { background: linear-gradient(135deg, #bdc3c7 0%, #95a5a6 100%); }
        .stat-card h3 {
            margin: 0;
            font-size: 14px;
            opacity: 0.9;
            color: white;
        }
        .stat-card .value {
            font-size: 42px;
            font-weight: bold;
            margin: 10px 0;
        }
        .stage {
            margin: 30px 0;
            border-left: 4px solid #3498db;
            padding-left: 20px;
        }
        .stage h2 {
            color: #34495e;
            margin-top: 0;
        }
        .job {
            background: #f8f9fa;
            padding: 15px;
            margin: 10px 0;
            border-radius: 6px;
            border-left: 4px solid #95a5a6;
            transition: transform 0.2s;
        }
        .job:hover {
            transform: translateX(5px);
        }
        .job.success { border-left-color: #27ae60; }
        .job.failed { border-left-color: #e74c3c; }
        .job.skipped { border-left-color: #95a5a6; }
        .job-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        .job-name {
            font-weight: bold;
            color: #2c3e50;
            font-size: 16px;
        }
        .job-status {
            padding: 4px 12px;
            border-radius: 12px;
            font-size: 12px;
            font-weight: bold;
            text-transform: uppercase;
        }
        .job-status.success { background: #27ae60; color: white; }
        .job-status.failed { background: #e74c3c; color: white; }
        .job-status.skipped { background: #95a5a6; color: white; }
        .job-description {
            color: #7f8c8d;
            font-size: 14px;
            margin-top: 5px;
        }
        .job-error {
            color: #e74c3c;
            margin-top: 10px;
            font-family: 'Courier New', monospace;
            font-size: 12px;
            background: #fee;
            padding: 10px;
            border-radius: 4px;
            border-left: 3px solid #e74c3c;
        }
        table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 20px;
            font-size: 14px;
        }
        th {
            background-color: #3498db;
            color: white;
            padding: 12px;
            text-align: left;
            font-weight: 600;
        }
        td {
            padding: 10px 12px;
            border-bottom: 1px solid #ddd;
        }
        tr:hover { background-color: #f5f5f5; }
        .schema-section {
            margin: 20px 0;
            padding: 15px;
            background: #f8f9fa;
            border-radius: 6px;
        }
        .schema-section h3 {
            margin-top: 0;
            color: #2c3e50;
        }
        .log-container {
            background: #2c3e50;
            color: #ecf0f1;
            padding: 15px;
            border-radius: 6px;
            max-height: 400px;
            overflow-y: auto;
            font-family: 'Courier New', monospace;
            font-size: 12px;
            line-height: 1.4;
        }
        .log-line {
            margin: 2px 0;
            white-space: pre-wrap;
            word-wrap: break-word;
        }
        .dbt-result {
            background: #f8f9fa;
            padding: 10px;
            margin: 8px 0;
            border-radius: 4px;
            border-left: 4px solid #95a5a6;
        }
        .dbt-result.success { border-left-color: #27ae60; }
        .dbt-result.error { border-left-color: #e74c3c; }
        .dbt-result.skipped { border-left-color: #95a5a6; }
        .dbt-result-header {
            font-weight: bold;
            color: #2c3e50;
        }
        .dbt-result-time {
            color: #7f8c8d;
            font-size: 12px;
        }
        .footer {
            margin-top: 40px;
            text-align: center;
            color: #7f8c8d;
            font-size: 12px;
            border-top: 1px solid #ecf0f1;
            padding-top: 20px;
        }
        .timestamp {
            color: #95a5a6;
            font-style: italic;
            font-size: 14px;
        }
        .badge {
            display: inline-block;
            padding: 2px 8px;
            border-radius: 10px;
            font-size: 11px;
            font-weight: bold;
            margin-left: 8px;
        }
        .badge.info { background: #3498db; color: white; }
        .badge.success { background: #27ae60; color: white; }
        .badge.warning { background: #f39c12; color: white; }
    </style>
</head>
<body>
    <div class="container">
        <h1>📊 {{ pipeline_name }}</h1>
        <p class="timestamp">Generated: {{ timestamp }}</p>

        <div class="stats">
            <div class="stat-card">
                <h3>Total Jobs</h3>
                <div class="value">{{ total_jobs }}</div>
            </div>
            <div class="stat-card success">
                <h3>Succeeded</h3>
                <div class="value">{{ succeeded }}</div>
            </div>
            <div class="stat-card failed">
                <h3>Failed</h3>
                <div class="value">{{ failed }}</div>
            </div>
            <div class="stat-card skipped">
                <h3>Skipped</h3>
                <div class="value">{{ skipped }}</div>
            </div>
        </div>

        <h2>📋 Pipeline Execution</h2>
        {% for stage, stage_jobs in jobs_by_stage.items() %}
        <div class="stage">
            <h2>{{ stage|upper }} <span class="badge info">{{ stage_jobs|length }} jobs</span></h2>
            {% for job in stage_jobs %}
            <div class="job {{ job.status }}">
                <div class="job-header">
                    <span class="job-name">{{ job.name }}</span>
                    <span class="job-status {{ job.status }}">{{ job.status }}</span>
                </div>
                {% if job.config.get('description') %}
                <div class="job-description">{{ job.config.get('description') }}</div>
                {% endif %}
                {% if job.error %}
                <div class="job-error">
                    <strong>Error:</strong> {{ job.error }}
                </div>
                {% endif %}
            </div>
            {% endfor %}
        </div>
        {% endfor %}

        {% if dbt_summary %}
        <h2>🔧 DBT Transformation Summary</h2>
        <div class="stats">
            <div class="stat-card success">
                <h3>DBT Models Success</h3>
                <div class="value">{{ dbt_summary.success }}</div>
            </div>
            {% if dbt_summary.error > 0 %}
            <div class="stat-card failed">
                <h3>DBT Errors</h3>
                <div class="value">{{ dbt_summary.error }}</div>
            </div>
            {% endif %}
            <div class="stat-card">
                <h3>Elapsed Time</h3>
                <div class="value">{{ "%.2f"|format(dbt_summary.elapsed_time) }}s</div>
            </div>
        </div>

        {% if dbt_summary.results %}
        <h3>DBT Run Results</h3>
        {% for result in dbt_summary.results %}
        <div class="dbt-result {{ result.status }}">
            <div class="dbt-result-header">
                {{ result.unique_id.split('.')[-1] }}
                <span class="badge {{ 'success' if result.status == 'success' else 'warning' }}">{{ result.status }}</span>
            </div>
            <div class="dbt-result-time">Execution time: {{ "%.3f"|format(result.execution_time) }}s</div>
            {% if result.message %}
            <div style="font-size: 12px; color: #7f8c8d; margin-top: 5px;">{{ result.message }}</div>
            {% endif %}
        </div>
        {% endfor %}
        {% endif %}
        {% endif %}

        {% if schema_stats %}
        <h2>📊 Data Warehouse Statistics</h2>
        {% for schema, tables in schema_stats.items() %}
        <div class="schema-section">
            <h3>Schema: {{ schema }} <span class="badge info">{{ tables|length }} tables</span></h3>
            <table>
                <thead>
                    <tr>
                        <th>Table</th>
                        <th>Rows</th>
                        <th>Columns</th>
                    </tr>
                </thead>
                <tbody>
                    {% for stat in tables %}
                    <tr>
                        <td><strong>{{ stat.table }}</strong></td>
                        <td>{{ "{:,}".format(stat.rows) }}</td>
                        <td>{{ stat.columns }}</td>
                    </tr>
                    {% endfor %}
                </tbody>
            </table>
        </div>
        {% endfor %}
        {% endif %}

        {% if quality_summary %}
        <h2>🎯 Data Quality</h2>
        <div class="schema-section">
            <div class="stats">
                <div class="stat-card {% if quality_summary.pass_rate == 100 %}success{% elif quality_summary.pass_rate >= 80 %}warning{% else %}error{% endif %}">
                    <h3>Pass Rate</h3>
                    <div class="value">{{ "%.1f"|format(quality_summary.pass_rate) }}%</div>
                </div>
                <div class="stat-card">
                    <h3>Total Checks</h3>
                    <div class="value">{{ quality_summary.total_checks }}</div>
                </div>
                <div class="stat-card success">
                    <h3>Passed</h3>
                    <div class="value">{{ quality_summary.passed }}</div>
                </div>
                <div class="stat-card error">
                    <h3>Failed</h3>
                    <div class="value">{{ quality_summary.failed }}</div>
                </div>
            </div>

            <table>
                <thead>
                    <tr>
                        <th>Check Name</th>
                        <th>Type</th>
                        <th>Status</th>
                        <th>Rows Failed</th>
                        <th>Failure %</th>
                        <th>Message</th>
                    </tr>
                </thead>
                <tbody>
                    {% for result in quality_summary.results %}
                    <tr class="{% if result.passed %}success{% else %}error{% endif %}">
                        <td><strong>{{ result.name }}</strong></td>
                        <td>{{ result.type }}</td>
                        <td>{% if result.passed %}PASS{% else %}FAIL{% endif %}</td>
                        <td>{{ "{:,}".format(result.rows_failed) }} / {{ "{:,}".format(result.rows_evaluated) }}</td>
                        <td>{{ "%.2f"|format(result.failure_pct) }}%</td>
                        <td>{{ result.message }}</td>
                    </tr>
                    {% endfor %}
                </tbody>
            </table>
        </div>
        {% endif %}

        {% if lineage_data and lineage_data.graph %}
        <h2>🔗 Data Lineage</h2>
        <div class="schema-section">
            <p><strong>Run ID:</strong> {{ lineage_data.run_id or 'N/A' }}</p>
            <p><strong>Datasets:</strong> {{ lineage_data.datasets|length }}</p>

            <h3>Lineage Graph</h3>
            <table>
                <thead>
                    <tr>
                        <th>Dataset</th>
                        <th>Columns</th>
                        <th>Type</th>
                        <th>Upstream Datasets</th>
                    </tr>
                </thead>
                <tbody>
                    {% for ds_name, ds_info in lineage_data.datasets.items() %}
                    <tr>
                        <td><strong>{{ ds_name }}</strong></td>
                        <td>{{ ds_info.columns|length }}</td>
                        <td>{{ ds_info.node_type }}</td>
                        <td>{{ ds_info.upstream_datasets|join(', ') or 'None' }}</td>
                    </tr>
                    {% endfor %}
                </tbody>
            </table>
        </div>
        {% endif %}

        {% if config_validation %}
        <h2>✅ Configuration Validation</h2>
        <div class="schema-section">
            <div class="stats">
                <div class="stat-card success">
                    <h3>Status</h3>
                    <div class="value">{{ config_validation.status }}</div>
                </div>
                <div class="stat-card">
                    <h3>Jobs Defined</h3>
                    <div class="value">{{ config_validation.jobs_count }}</div>
                </div>
                <div class="stat-card">
                    <h3>Stages</h3>
                    <div class="value">{{ config_validation.stages_count }}</div>
                </div>
                <div class="stat-card">
                    <h3>Databases</h3>
                    <div class="value">{{ config_validation.databases_count }}</div>
                </div>
            </div>

            <h3>Validated Configuration Elements</h3>
            <table>
                <thead>
                    <tr>
                        <th>Element</th>
                        <th>Count</th>
                        <th>Details</th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td><strong>Pipeline Stages</strong></td>
                        <td>{{ config_validation.stages_count }}</td>
                        <td>{{ config_validation.stages|join(', ') if config_validation.stages else 'N/A' }}</td>
                    </tr>
                    <tr>
                        <td><strong>Defined Jobs</strong></td>
                        <td>{{ config_validation.jobs_count }}</td>
                        <td>All job references validated</td>
                    </tr>
                    <tr>
                        <td><strong>Runners</strong></td>
                        <td>{{ config_validation.runners_count }}</td>
                        <td>{{ config_validation.runner_types|join(', ') if config_validation.runner_types else 'N/A' }}</td>
                    </tr>
                    <tr>
                        <td><strong>Databases</strong></td>
                        <td>{{ config_validation.databases_count }}</td>
                        <td>{{ config_validation.database_types|join(', ') if config_validation.database_types else 'N/A' }}</td>
                    </tr>
                    <tr>
                        <td><strong>Dependencies</strong></td>
                        <td>{{ config_validation.dependencies_count }}</td>
                        <td>All job dependencies validated</td>
                    </tr>
                </tbody>
            </table>

            {% if config_validation.validation_checks %}
            <h3>Validation Checks Performed</h3>
            <ul style="color: #27ae60; font-weight: 500;">
                {% for check in config_validation.validation_checks %}
                <li>{{ check }}</li>
                {% endfor %}
            </ul>
            {% endif %}
        </div>
        {% endif %}

        {% if log_lines %}
        <h2>📝 Pipeline Logs (Last 200 lines)</h2>
        <div class="log-container">
            {% for line in log_lines %}
            <div class="log-line">{{ line|trim }}</div>
            {% endfor %}
        </div>
        {% endif %}

        <div class="footer">
            <p><strong>V6 ETL Pipeline</strong> • DuckDB Data Warehouse • DBT Transformations • Pydantic Config Validation</p>
            <p>Generated by pipeline reporter v2.1</p>
        </div>
    </div>
</body>
</html>
"""
        template = Template(template_content)
    else:
        template = Template(template_path.read_text(encoding='utf-8'))

    # Render the template
    html = template.render(
        pipeline_name=pipeline_name,
        timestamp=datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        total_jobs=total_jobs,
        succeeded=succeeded,
        failed=failed,
        skipped=skipped,
        jobs_by_stage=jobs_by_stage,
        table_stats=table_stats,
        schema_stats=schema_stats,
        dbt_summary=dbt_summary,
        dbt_results=dbt_results,
        log_lines=log_lines,
        config_validation=config_validation_info,
        quality_summary=quality_summary,
        lineage_data=lineage_data
    )

    # Write to file
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(html, encoding='utf-8')

    log.info(f"HTML report generated: {output_path}")
