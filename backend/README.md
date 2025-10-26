# Stage-Based ETL Pipeline Framework

Python-based ETL framework with DuckDB/SQLite, Polars, and DBT integration. Supports Extract → Stage → Transform → Export workflows with SQL and Python transformations.

## Quick Start

```bash
# Install dependencies
pip install -r requirements.txt

# Run pipeline
python -m pipeline.cli --pipeline schema/pipeline.yaml

# Validate before running
python -m pipeline.cli --pipeline schema/pipeline.yaml --validate

# Dry run
python -m pipeline.cli --pipeline schema/pipeline.yaml --dry-run
```

## Architecture

### Execution Flow

```
EXTRACT → STAGE → TRANSFORM → EXPORT
   ↓         ↓         ↓          ↓
 Files   DuckDB    SQL/Py     Files
```

**Stages:**
- **Extract**: Read files (Excel, CSV, XML, JSON) into Polars DataFrames
- **Stage**: Load DataFrames into DuckDB with schema organization
- **Transform**: Apply SQL, Python, or DBT transformations
- **Export**: Write to files (CSV, JSON, XML, HTML, Excel)

**Key Features:**
- DAG-based job execution with dependency resolution
- Plugin architecture (readers, writers, processors, engines)
- Database engine abstraction (DuckDB, SQLite)
- Python transformations with Polars DataFrames
- DBT integration for SQL modeling
- HTML reporting with lineage visualization
- Comprehensive validation (Python syntax, SQL, schemas)

## Project Structure

```
pipeline/
├── core/
│   └── orchestrator.py          # DAG execution engine
├── plugins/
│   ├── api.py                   # Base classes (Reader, Writer, Processor)
│   └── registry.py              # Plugin discovery
├── engines/
│   ├── duckdb_engine.py         # DuckDB implementation
│   └── sqlite_engine.py         # SQLite implementation
├── io/
│   ├── readers/                 # Excel, CSV, XML, JSON readers
│   └── writers/                 # CSV, JSON, XML, HTML writers
├── proc/                        # Data processors
├── runners/
│   ├── dbt_runner.py            # DBT integration
│   ├── python_transform_runner.py  # Python/Polars transforms
│   └── sql_yaml_runner.py       # YAML SQL transforms
├── common/
│   ├── logger.py                # Structured logging (user/dev/debug)
│   ├── validators.py            # Pre-execution validation
│   ├── reporter.py              # HTML report generation
│   └── config_models.py         # Pydantic validation
└── cli.py                       # CLI entry point

schema/
├── pipeline.yaml                # Main pipeline configuration
└── transforms/
    ├── sql/                     # SQL transformation files
    └── python/                  # Python transformation files
```

## Configuration

### Pipeline YAML

```yaml
pipeline:
  name: "My ETL Pipeline"
  version: "1.0"

variables:
  DATA_DIR: "data"
  OUTPUT_DIR: "out/exports"

databases:
  warehouse:
    type: duckdb                 # or "sqlite"
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
  extract_data:
    stage: extract
    runner: csv_reader
    depends_on: []
    input:
      path: "{DATA_DIR}"
      files: "customers.csv"
    processors:
      - normalize_headers
      - drop_empty_rows
    output:
      table: customers

  stage_data:
    stage: stage
    runner: duckdb_stager
    depends_on: [extract_data]
    schema: staging              # IMPORTANT: schema at job level, not in output
    input:
      tables: [customers]        # List of table names (explicit list required)

  transform_sql:
    stage: transform
    runner: sql_transform
    depends_on: [stage_data]
    sql: |
      CREATE OR REPLACE TABLE analytics.clean_customers AS
      SELECT * FROM staging.customers WHERE customer_id IS NOT NULL;

  transform_python:
    stage: transform
    runner: python_transform
    depends_on: [transform_sql]
    options:
      input_tables:
        - schema: "analytics"
          table: "clean_customers"
          alias: "customers_df"
      python_file: "schema/transforms/python/enrich.py"
      output:
        - table: "enriched_customers"
          schema: "analytics"
          source_df: "result_df"
          mode: "replace"

  export_csv:
    stage: export
    runner: csv_writer
    depends_on: [transform_python]
    input:
      query: "SELECT * FROM analytics.enriched_customers"
    output:
      path: "{OUTPUT_DIR}"
      filename: "customers.csv"

runners:
  csv_reader:
    type: reader
    plugin: csv
  duckdb_stager:
    type: stager
    plugin: duckdb
  sql_transform:
    type: transformer
    plugin: sql
  python_transform:
    type: transformer
    plugin: python_transform
  csv_writer:
    type: writer
    plugin: csv
```

### Python Transformations

**File: `schema/transforms/python/enrich.py`**

```python
import polars as pl
from typing import Dict

def transform(customers_df: pl.DataFrame) -> Dict[str, pl.DataFrame]:
    """
    Transform customers data.

    Args:
        customers_df: Input from DuckDB analytics.clean_customers

    Returns:
        Dictionary mapping output names to DataFrames
    """
    # Your transformation logic
    enriched = customers_df.with_columns([
        pl.col("revenue").cast(pl.Float64).alias("revenue_float")
    ])

    return {
        "result_df": enriched
    }
```

**Pipeline Configuration:**

```yaml
transform_python:
  stage: transform
  runner: python_transform
  options:
    input_tables:
      - schema: "staging"
        table: "customers"
        alias: "customers_df"      # Must match function parameter
    python_file: "schema/transforms/python/enrich.py"
    processors:                    # Optional: apply after transformation
      - normalize_headers
    output:
      - table: "customers_enriched"
        schema: "analytics"
        source_df: "result_df"     # Must match return dict key
        mode: "replace"
```

**When to use Python vs SQL:**

**Use Python for:**
- Complex conditional logic
- Statistical calculations
- Custom algorithms
- External library integration
- Time-series analysis

**Use SQL for:**
- Joins and aggregations
- Window functions
- Set operations
- Standard transformations

### SQL Transformations

**Inline SQL:**

```yaml
transform_clean:
  stage: transform
  runner: sql_transform
  sql: |
    CREATE OR REPLACE TABLE staging.customers AS
    SELECT * FROM input.raw_customers;
```

**YAML SQL (recommended for documentation):**

```yaml
metadata:
  name: "Customer Transformations"
  version: "1.0"

transformations:
  - name: "clean_customers"
    description: "Cleanse customer data"
    schema: "staging"
    tables_created: ["customers"]
    depends_on: ["input.raw_customers"]
    sql: |
      CREATE OR REPLACE TABLE staging.customers AS
      SELECT
        customer_id,
        TRIM(customer_name) as name
      FROM input.raw_customers;
```

### Processors

```yaml
processors:
  - normalize_headers                    # Clean column names
  - name: fill_merged_cells
    columns: ["category"]
    direction: down
  - name: require_columns
    required:
      "Customer ID": customer_id
      "Name": customer_name
    mode: error                          # error | skip_table
  - drop_empty_rows
```

### DBT Integration

```yaml
transform_dbt:
  stage: transform
  runner: dbt_runner
  depends_on: [stage_data]
  options:
    project_dir: "."
    profiles_dir: "./dbt"
    models: ""                           # Empty = run all
    test: true
    generate_docs: false
```

## Database Engines

**DuckDB (supports schemas):**
```yaml
databases:
  warehouse:
    type: duckdb
    path: out/db/warehouse.duckdb
    schemas:
      - staging
      - analytics
```

Tables: `staging.customers`, `analytics.results`

**SQLite (uses prefixes):**
```yaml
databases:
  warehouse:
    type: sqlite
    path: out/db/warehouse.db
    schemas:
      - staging
      - analytics
```

Tables: `staging_customers`, `analytics_results`

## Validation

Run comprehensive validation before execution:

```bash
python -m pipeline.cli --pipeline schema/pipeline.yaml --validate
```

**Validates:**
- ✅ Python syntax and function signatures
- ✅ SQL basic syntax
- ✅ Schema definitions
- ✅ Import availability (warnings)
- ✅ Job dependencies
- ✅ Configuration structure

**Output:**
```
[OK] Stages: 4
[OK] Jobs: 12
[OK] Dependencies validated

[ERROR] 2 error(s):
  - Job 'transform_py': Syntax error at line 55: invalid syntax
  - Job 'stage_data': references undefined schema: invalid_schema

[WARN] 1 warning(s):
  - Job 'transform_py': Missing imports: ['numpy']
```

## Logging

Three log levels:

```bash
# Clean output for end users
python -m pipeline.cli --pipeline config.yaml --log-level user

# Detailed for developers (file paths, row counts)
python -m pipeline.cli --pipeline config.yaml --log-level dev

# Verbose debugging (SQL, column names)
python -m pipeline.cli --pipeline config.yaml --log-level debug

# JSON format (for GUI integration)
python -m pipeline.cli --pipeline config.yaml --json
```

## Commands

```bash
# Basic execution
python -m pipeline.cli --pipeline config/pipeline.yaml

# With environment file
python -m pipeline.cli --pipeline config/pipeline.yaml --dotenv .env

# Override config values
python -m pipeline.cli --pipeline config.yaml --set execution.on_error=continue

# Validate only (no execution)
python -m pipeline.cli --pipeline config.yaml --validate

# Dry run (validate + show plan)
python -m pipeline.cli --pipeline config.yaml --dry-run
```

## Reporting

Enable HTML reports:

```yaml
reporting:
  enabled: true
  path: "reports/pipeline_report.html"
  include_dbt_results: true
  include_detailed_logs: true
  include_lineage: true
```

Reports include:
- Pipeline summary and timeline
- Job metrics (rows, files, SQL executed)
- DBT model results
- Data lineage visualization
- Detailed logs

## Extending the Pipeline

### Custom Reader

```python
from pipeline.plugins.api import Reader, Table
from pipeline.plugins.registry import register_reader

@register_reader
class MyReader(Reader):
    name = "my_reader"

    def can_handle(self, source: Dict[str, Any]) -> bool:
        return source.get("type") == "my_format"

    def read(self, source: Dict[str, Any], base_path: Path):
        # Return iterable of Table objects
        yield Table(name="data", df=my_polars_df, meta={})
```

### Custom Processor

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

## Troubleshooting

**DuckDB Inspection:**
```bash
duckdb out/db/warehouse.duckdb
D> SHOW TABLES;
D> SHOW TABLES FROM staging;
D> SELECT * FROM staging.customers LIMIT 10;
```

**Common Issues:**

- **"Table not found"**: Check `depends_on` - ensure dependent jobs completed
- **Schema errors**: Verify schemas in `databases.warehouse.schemas`
- **Processor skips tables**: Check processor `mode: skip_table` vs `mode: error`
- **DBT failures**: Check DBT logs, ensure connection is closed before DBT runs

**Debug logging:**
```bash
python -m pipeline.cli --pipeline config.yaml --log-level debug
```

### Configuration Issues and Solutions

#### 1. DuckDB/SQLite Reader Configuration

**❌ WRONG** - Using plural `tables`:
```yaml
extract_duckdb:
  runner: duckdb_reader
  input:
    path: "data/source.duckdb"
    tables: ["customers", "orders"]  # ❌ Not supported
```

**✅ CORRECT** - Use singular `table` or `sql`:
```yaml
extract_duckdb_customers:
  runner: duckdb_reader
  input:
    path: "data/source.duckdb"
    table: "customers"              # ✅ Extract single table

extract_duckdb_query:
  runner: duckdb_reader
  input:
    path: "data/source.duckdb"
    sql: "SELECT * FROM customers WHERE active = true"  # ✅ Or use SQL query
```

**Note:** To extract multiple tables, create separate jobs for each table.

#### 2. Stage Job Schema Configuration

**❌ WRONG** - Schema in output section:
```yaml
stage_all:
  stage: stage
  runner: duckdb_stager
  input:
    tables: "*"                     # ❌ Wildcard not supported
  output:
    schema: "landing"               # ❌ Wrong location
```

**✅ CORRECT** - Schema at job level with explicit table list:
```yaml
stage_all:
  stage: stage
  runner: duckdb_stager
  schema: "landing"                 # ✅ Schema at job root level
  input:
    tables:                         # ✅ Explicit list (no wildcards)
      - "raw_csv_data"
      - "python_inline_data"
      - "raw_xml_data"
```

#### 3. Python Extract Configuration

**❌ WRONG** - Nested output sections:
```yaml
extract_python:
  runner: python_extract
  input:
    python_code: |
      import polars as pl
      df = pl.DataFrame({"id": [1, 2, 3]})
    output:                         # ❌ Inside input
      - source_df: "df"
        table: "data"
  output:                           # ❌ Duplicate
    table: "data"
```

**✅ CORRECT** - Single output configuration:
```yaml
extract_python:
  runner: python_extract
  input:
    python_code: |
      import polars as pl
      df = pl.DataFrame({"id": [1, 2, 3]})
    output:                         # ✅ Only in input section
      - source_df: "df"
        table: "data"
    processors:                     # ✅ Processors in input section
      - normalize_headers
  output:
    table: "data"                   # ✅ Final output table name
```

#### 4. Polars Window Functions

**❌ WRONG** - Using `order_by` parameter in `.over()`:
```python
result = df.with_columns([
    pl.col("value").cum_sum()
    .over("category", order_by="id")  # ❌ Not supported in this context
    .alias("cumulative")
])
```

**✅ CORRECT** - Sort first, then use window function:
```python
result = df.sort("category", "id").with_columns([
    pl.col("value").cum_sum()
    .over("category")                 # ✅ Sorted beforehand
    .alias("cumulative")
])
```

#### 5. JSON/YAML Export with Decimal Types

**Issue:** DuckDB returns Decimal types which aren't JSON serializable by default.

**Workaround Options:**

1. **Use CSV/Parquet instead** (recommended for numeric data)
2. **Cast decimals in SQL:**
   ```yaml
   export_json:
     input:
       query: |
         SELECT
           id,
           CAST(price AS DOUBLE) as price,  -- Convert Decimal to Float
           name
         FROM analytics.products
   ```

3. **Use Python export with custom serialization:**
   ```python
   import json
   from decimal import Decimal

   def decimal_default(obj):
       if isinstance(obj, Decimal):
           return float(obj)
       raise TypeError

   json.dumps(data, default=decimal_default)
   ```

#### 6. Excel Multi-Sheet Workbook

The `excel_workbook_writer` requires special handling. For now, use multiple single-sheet exports:

```yaml
export_sheet1:
  runner: excel_writer
  input:
    table: "analytics.summary"
  output:
    filename: "report_summary.xlsx"
  options:
    sheet_name: "Summary"

export_sheet2:
  runner: excel_writer
  input:
    table: "analytics.details"
  output:
    filename: "report_details.xlsx"
  options:
    sheet_name: "Details"
```

## Advanced Features

### Variable Expansion

Use `{VAR}` or `${VAR}` in paths:

```yaml
variables:
  PROJECT_DIR: "/home/user/project"
  OUTPUT_DIR: "${PROJECT_DIR}/out"

jobs:
  extract:
    input:
      path: "{PROJECT_DIR}/data"
```

### Table Naming

**Stage jobs support:**
1. **Explicit mapping** (preferred):
   ```yaml
   table_mapping:
     raw_customers: in_customers
   ```

2. **Prefix** (legacy):
   ```yaml
   table_prefix: "in_"
   ```

### External Plugins

**In `setup.cfg` or `pyproject.toml`:**

```ini
[options.entry_points]
v3pipeline.readers =
    myreader = my_package.readers:MyReader
v3pipeline.processors =
    myprocessor = my_package.processors:MyProcessor
```

The system auto-discovers these on startup.

## Examples

See `schema/pipeline.yaml` for a complete reference with all supported configurations.

### Supported Formats

**Readers (Extract):**
- ✅ CSV - Delimiter, encoding, header options
- ✅ Excel - Multi-sheet, engine selection (calamine/openpyxl)
- ✅ XML - XPath-based field extraction
- ✅ JSON - Array of objects or line-delimited
- ✅ JSONL - JSON Lines format
- ✅ Parquet - Columnar format
- ✅ DuckDB - Single table or SQL query
- ✅ SQLite - Single table or SQL query
- ✅ YAML - YAML files
- ✅ HTML - Table extraction
- ✅ Python Extract - Inline code or external file

**Writers (Export):**
- ✅ CSV - Configurable delimiter, quoting
- ✅ XML - Custom root/row tags
- ✅ Parquet - Compression options (snappy/gzip/zstd)
- ✅ Excel - Single sheet
- ✅ HTML - Table with styling
- ⚠️ JSON/JSONL - Limited (Decimal type issues)
- ⚠️ YAML - Limited (Decimal type issues)
- ⚠️ Excel Workbook - Requires special handling
- ⚠️ SQLite/DuckDB - Directory creation issues

**Transformers:**
- ✅ SQL (Inline) - Raw SQL statements
- ✅ SQL (File) - External .sql files
- ✅ SQL (YAML) - Documented SQL transformations
- ✅ Python - Polars DataFrame transformations
- ⚠️ DBT - Requires DBT project setup

### Working Example

The reference pipeline successfully runs with:
- **Extract**: CSV (customers), XML (products), Python inline (synthetic data)
- **Stage**: 3 tables → landing schema
- **Transform**: SQL inline, SQL file, SQL YAML, Python inline
- **Export**: CSV, XML, Parquet, Excel, HTML

**Execution time**: ~4 seconds for 118 rows across all stages

## Best Practices

### Configuration

1. **Always validate before running**:
   ```bash
   python -m pipeline.cli --pipeline config.yaml --validate
   ```

2. **Use explicit table lists** instead of wildcards:
   ```yaml
   # ✅ Good
   input:
     tables: ["customers", "orders", "products"]

   # ❌ Avoid
   input:
     tables: "*"
   ```

3. **Place schema at correct level** for stage jobs:
   ```yaml
   stage_data:
     schema: "landing"    # At job root
     input:
       tables: [...]
   ```

4. **Test with small data first**:
   ```yaml
   input:
     query: "SELECT * FROM large_table LIMIT 1000"  # Test first
   ```

### Data Types

1. **Avoid JSON/YAML exports** for numeric data with decimals - use CSV or Parquet instead

2. **Cast decimals explicitly** if JSON export is required:
   ```sql
   SELECT
     id,
     CAST(price AS DOUBLE) as price
   FROM products
   ```

3. **Use appropriate file formats**:
   - **CSV**: Human-readable, universal compatibility
   - **Parquet**: Large datasets, columnar analytics
   - **Excel**: Business reporting, single sheets
   - **XML**: Legacy systems, hierarchical data

### Performance

1. **Stage only required tables**:
   ```yaml
   stage_subset:
     input:
       tables: ["customers", "orders"]  # Not everything
   ```

2. **Use SQL for aggregations**, Python for complex logic:
   ```yaml
   # ✅ Good - Use SQL for aggregation
   sql: |
     SELECT category, SUM(amount) as total
     FROM sales GROUP BY category

   # ❌ Avoid - Complex aggregations in Python are slower
   ```

3. **Filter early in pipeline**:
   ```yaml
   extract_recent:
     input:
       query: |
         SELECT * FROM transactions
         WHERE date >= '2024-01-01'  # Filter at source
   ```

### Debugging

1. **Use appropriate log levels**:
   - `--log-level user` - Production runs
   - `--log-level dev` - Development/troubleshooting
   - `--log-level debug` - Deep investigation

2. **Check DuckDB state** when transforms fail:
   ```bash
   duckdb out/db/warehouse.duckdb
   D> SHOW TABLES FROM landing;
   D> SELECT COUNT(*) FROM landing.raw_csv_data;
   ```

3. **Validate dependencies**:
   ```yaml
   transform_step:
     depends_on:
       - stage_data        # Ensure this completed successfully
   ```

## Requirements

- Python 3.11+
- DuckDB
- Polars
- PyYAML
- Pydantic
- (Optional) DBT for SQL modeling

## License

See LICENSE file.
