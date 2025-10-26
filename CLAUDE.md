# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is an **ETL Pipeline GUI** - a desktop application that combines a Python-based ETL framework with an Electron GUI for visual pipeline management. The project has two main components:

1. **Backend**: Stage-based ETL pipeline framework (Python/DuckDB/Polars)
2. **Frontend**: Electron-based project launcher and pipeline management interface

## Development Commands

### Backend (Python ETL Pipeline)

```bash
# Install dependencies
pip install -r backend/requirements.txt

# Run pipeline
python -m pipeline.cli --pipeline schema/pipeline.yaml

# Validate pipeline configuration
python -m pipeline.cli --pipeline schema/pipeline.yaml --validate

# Dry run (validate + show execution plan)
python -m pipeline.cli --pipeline schema/pipeline.yaml --dry-run

# Run with different log levels
python -m pipeline.cli --pipeline schema/pipeline.yaml --log-level dev
python -m pipeline.cli --pipeline schema/pipeline.yaml --log-level debug

# Run with JSON output (for GUI integration)
python -m pipeline.cli --pipeline schema/pipeline.yaml --json

# Override configuration values
python -m pipeline.cli --pipeline config.yaml --set execution.on_error=continue
```

### Frontend (Electron GUI)

```bash
cd frontend

# Start the application
npm start

# Development mode with console logging
npm run dev

# Build/package the application
npm run package
```

## Architecture

### Backend: ETL Pipeline Framework

**Execution Flow**: EXTRACT → STAGE → TRANSFORM → EXPORT

```
Files/DBs → Polars DataFrames → DuckDB/SQLite → SQL/Python/DBT → Output Files
```

**Core Components**:

- **Orchestrator** ([backend/pipeline/core/orchestrator.py](backend/pipeline/core/orchestrator.py)): DAG-based execution engine with dependency resolution
- **Plugin Registry** ([backend/pipeline/plugins/registry.py](backend/pipeline/plugins/registry.py)): Auto-discovery system for readers, writers, and processors
- **Database Engines** ([backend/pipeline/engines/](backend/pipeline/engines/)): Abstraction layer supporting DuckDB and SQLite
- **Runners** ([backend/pipeline/runners/](backend/pipeline/runners/)): Execute SQL, Python, and DBT transformations

**Plugin Architecture**:
- **Readers** ([backend/pipeline/io/readers/](backend/pipeline/io/readers/)): CSV, Excel, XML, JSON, JSONL, Parquet, DuckDB, SQLite, YAML, HTML
- **Writers** ([backend/pipeline/io/writers/](backend/pipeline/io/writers/)): CSV, Excel, XML, JSON, JSONL, Parquet, DuckDB, SQLite, HTML
- **Processors** ([backend/pipeline/proc/](backend/pipeline/proc/)): Data transformation plugins (normalize headers, fill merged cells, etc.)

**Key Features**:
- DAG-based job execution with stage-based organization
- Schema-based data organization (input/staging/analytics)
- Python transformations using Polars DataFrames
- DBT integration for SQL modeling
- HTML reporting with data lineage visualization
- Comprehensive validation (Python syntax, SQL, schemas, dependencies)

### Frontend: Electron GUI

**Architecture**: Multi-process Electron application with security-first design

1. **Main Process** ([frontend/src/main/](frontend/src/main/)): Node.js backend handling OS operations, file system, and Python process execution
2. **Renderer Process** ([frontend/src/renderer/](frontend/src/renderer/)): Browser-based UI with no direct Node.js access
3. **Preload Script** ([frontend/src/preload/index.js](frontend/src/preload/index.js)): Security bridge using `contextBridge` for IPC

**IPC Communication**:
- All main-renderer communication through `window.electronAPI`
- Key IPC handlers in [frontend/src/main/ipc/](frontend/src/main/ipc/):
  - `projects.js`: Project scanning, Python script execution, process management
  - `settings.js`: Settings persistence
  - `window.js`: Window controls

**State Management**: Centralized reactive state in [frontend/src/renderer/core/state.js](frontend/src/renderer/core/state.js) using pub/sub pattern

**Component System**: Standalone modules in [frontend/src/renderer/components/](frontend/src/renderer/components/), each with `init()` function

## Pipeline Configuration

### Pipeline YAML Structure

Main configuration file: [backend/schema/pipeline.yaml](backend/schema/pipeline.yaml)

```yaml
pipeline:
  name: "Pipeline Name"
  version: "1.0"

variables:
  DATA_DIR: "data"
  OUTPUT_DIR: "out/exports"

databases:
  warehouse:
    type: duckdb  # or "sqlite"
    path: out/db/warehouse.duckdb
    reset_on_start: true
    schemas:
      - input
      - staging
      - analytics

stages:
  - extract
  - stage
  - transform
  - export

jobs:
  job_name:
    stage: extract
    runner: csv_reader
    depends_on: []
    input:
      path: "{DATA_DIR}"
      files: "data.csv"
    output:
      table: my_table
```

### Critical Configuration Rules

**1. Stage Job Schema Placement**:
```yaml
stage_data:
  schema: "landing"  # ✅ At job root level
  input:
    tables: ["table1", "table2"]  # ✅ Explicit list, no wildcards
```

**2. Database Reader Configuration**:
```yaml
# ❌ WRONG - plural "tables" not supported
extract_duckdb:
  input:
    tables: ["customers", "orders"]

# ✅ CORRECT - use singular "table" or "sql"
extract_duckdb:
  input:
    table: "customers"  # OR
    sql: "SELECT * FROM customers WHERE active = true"
```

**3. Python Transformation Function Signature**:
```python
def transform(input_df: pl.DataFrame) -> Dict[str, pl.DataFrame]:
    """
    Args:
        input_df: DataFrame from DuckDB (alias matches pipeline config)

    Returns:
        Dictionary mapping output names to DataFrames
    """
    result = input_df.with_columns([...])
    return {"result_df": result}
```

The function parameter name must match the `alias` in the pipeline config, and return dict keys must match `source_df` values.

### Polars Patterns

**Window Functions** - Always sort before applying:
```python
# ✅ CORRECT
result = df.sort("category", "id").with_columns([
    pl.col("value").cum_sum().over("category")
])

# ❌ WRONG - order_by parameter not supported in this context
result = df.with_columns([
    pl.col("value").cum_sum().over("category", order_by="id")
])
```

## Common Development Patterns

### Adding a New Reader

1. Create file in [backend/pipeline/io/readers/](backend/pipeline/io/readers/)
2. Import and register in [backend/pipeline/io/readers/__init__.py](backend/pipeline/io/readers/__init__.py)
3. Extend `Reader` base class from [backend/pipeline/plugins/api.py](backend/pipeline/plugins/api.py)
4. Implement `can_handle()` and `read()` methods returning `Table` objects

```python
from pipeline.plugins.api import Reader, Table
from pipeline.plugins.registry import register_reader

@register_reader
class MyReader(Reader):
    name = "my_reader"

    def can_handle(self, source: Dict[str, Any]) -> bool:
        return source.get("type") == "my_format"

    def read(self, source: Dict[str, Any], base_path: Path):
        yield Table(name="data", df=polars_df, meta={})
```

### Adding a New Processor

1. Create file in [backend/pipeline/proc/](backend/pipeline/proc/)
2. Extend `Processor` base class
3. Implement `applies_to()` and `process()` methods

```python
from pipeline.plugins.api import Processor
from pipeline.plugins.registry import register_processor

@register_processor
class MyProcessor(Processor):
    name = "my_processor"

    def applies_to(self, ctx: Dict[str, Any]) -> bool:
        return True

    def process(self, df: pl.DataFrame, ctx: Dict[str, Any]) -> pl.DataFrame:
        return df.with_columns([...])
```

### Adding Frontend IPC Channel

1. Define handler in [frontend/src/main/ipc/](frontend/src/main/ipc/) (or create new file)
2. Register in [frontend/src/main/index.js](frontend/src/main/index.js) via `ipcMain.handle()` or `ipcMain.on()`
3. Expose in [frontend/src/preload/index.js](frontend/src/preload/index.js) via `contextBridge.exposeInMainWorld()`
4. Call from renderer via `window.electronAPI.yourMethod()`

## Debugging and Troubleshooting

### Pipeline Validation

Always validate before running:
```bash
python -m pipeline.cli --pipeline schema/pipeline.yaml --validate
```

Validation checks:
- Python syntax and function signatures
- SQL basic syntax
- Schema definitions
- Job dependencies
- Import availability (warnings)
- Configuration structure

### Inspecting DuckDB State

```bash
duckdb out/db/warehouse.duckdb
D> SHOW TABLES;
D> SHOW TABLES FROM staging;
D> SELECT * FROM staging.customers LIMIT 10;
```

### Log Levels

- `--log-level user`: Clean output for end users (default)
- `--log-level dev`: Detailed for developers (file paths, row counts)
- `--log-level debug`: Verbose debugging (SQL statements, column names)
- `--json`: JSON-Lines format for GUI integration

### Common Issues

**"Table not found"**: Check `depends_on` to ensure dependent jobs completed successfully

**Schema errors**: Verify schemas listed in `databases.warehouse.schemas` section

**Processor skips tables**: Check processor `mode: skip_table` vs `mode: error` in config

**DBT failures**: Check DBT logs in `dbt/target/`, ensure database connection closed before DBT runs

**JSON/YAML export with Decimals**: DuckDB returns Decimal types which aren't JSON serializable. Use CSV/Parquet instead or cast to DOUBLE in SQL:
```sql
SELECT id, CAST(price AS DOUBLE) as price FROM products
```

## Database Engine Differences

**DuckDB** (supports true schemas):
- Tables: `staging.customers`, `analytics.results`
- Recommended for most use cases

**SQLite** (uses prefixes):
- Tables: `staging_customers`, `analytics_results`
- Schema names become table prefixes

## DBT Integration

DBT project configured in [backend/dbt_project.yml](backend/dbt_project.yml)

```yaml
transform_dbt:
  stage: transform
  runner: dbt_runner
  depends_on: [stage_data]
  options:
    project_dir: "."
    profiles_dir: "./dbt"
    models: ""  # Empty = run all models
    test: true
    generate_docs: false
```

DBT models in [backend/dbt/models/](backend/dbt/models/)

## External Plugin Registration

Register external plugins via [backend/setup.cfg](backend/setup.cfg):

```ini
[options.entry_points]
v3pipeline.readers =
    myreader = my_pkg.readers:MyReader
v3pipeline.processors =
    myprocessor = my_pkg.processors:MyProcessor
v3pipeline.writers =
    mywriter = my_pkg.writers:MyWriter
```

The plugin registry auto-discovers these on startup.

## Project Structure

```
.
├── backend/
│   ├── pipeline/
│   │   ├── cli.py                    # CLI entry point
│   │   ├── core/
│   │   │   └── orchestrator.py       # DAG execution engine
│   │   ├── plugins/
│   │   │   ├── api.py                # Base classes (Reader, Writer, Processor)
│   │   │   └── registry.py           # Plugin auto-discovery
│   │   ├── engines/
│   │   │   ├── duckdb_engine.py      # DuckDB implementation
│   │   │   └── sqlite_engine.py      # SQLite implementation
│   │   ├── io/
│   │   │   ├── readers/              # File format readers
│   │   │   └── writers/              # File format writers
│   │   ├── proc/                     # Data processors
│   │   ├── runners/                  # SQL, Python, DBT runners
│   │   └── common/
│   │       ├── logger.py             # Structured logging
│   │       ├── validators.py         # Pre-execution validation
│   │       ├── reporter.py           # HTML report generation
│   │       └── config_models.py      # Pydantic validation
│   ├── schema/
│   │   ├── pipeline.yaml             # Main pipeline configuration
│   │   ├── transforms/sql/           # SQL transformation files
│   │   └── transforms/python/        # Python transformation files
│   ├── dbt/                          # DBT project
│   └── requirements.txt
│
└── frontend/
    ├── src/
    │   ├── main/
    │   │   ├── index.js              # Main process entry
    │   │   └── ipc/                  # IPC handlers
    │   ├── renderer/
    │   │   ├── index.js              # Renderer process entry
    │   │   ├── components/           # UI components
    │   │   ├── views/                # Page-level components
    │   │   ├── core/
    │   │   │   ├── state.js          # State management
    │   │   │   └── theme.js          # Theme system
    │   │   └── styles/themes/        # 13 built-in themes
    │   └── preload/index.js          # Security bridge
    └── package.json
```

## Important Architectural Constraints

### Backend
- All jobs must specify explicit dependencies via `depends_on`
- Stage jobs require `schema` at job root level
- Database readers only support single table or SQL query per job
- Polars window functions require pre-sorting
- JSON/YAML writers have limitations with Decimal types

### Frontend
- Context isolation enabled, no `nodeIntegration` in renderer
- Never expose raw Node.js APIs to renderer—use specific IPC channels
- Track child processes to avoid orphaned Python processes on app close
- Always use `setState()` for reactive updates
- Load theme CSS before rendering to prevent flash of unstyled content

## Requirements

### Backend
- Python 3.11+
- DuckDB >= 1.0.0
- Polars >= 1.5.0
- PyYAML, Pydantic, openpyxl, pyarrow
- (Optional) DBT for SQL modeling

### Frontend
- Node.js (version specified in package.json)
- Electron 38+
