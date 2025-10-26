"""
Pydantic models for pipeline configuration validation

Provides type-safe, validated configuration models for:
- Pipeline metadata
- Database configurations
- Job definitions
- Runner definitions
- Execution policies
- Reporting settings
"""
from __future__ import annotations

from enum import Enum
from pathlib import Path
from typing import Any, Dict, List, Literal, Optional, Union

from pydantic import BaseModel, Field, field_validator, model_validator


# ============================================================================
# Enums
# ============================================================================

class DatabaseType(str, Enum):
    """Supported database engines"""
    DUCKDB = "duckdb"
    SQLITE = "sqlite"


class RunnerType(str, Enum):
    """Supported runner types"""
    READER = "reader"
    WRITER = "writer"
    STAGER = "stager"
    TRANSFORMER = "transformer"


class JobStatus(str, Enum):
    """Job execution statuses"""
    PENDING = "pending"
    RUNNING = "running"
    SUCCESS = "success"
    FAILED = "failed"
    SKIPPED = "skipped"


class ErrorPolicy(str, Enum):
    """Error handling policies"""
    STOP = "stop"
    SKIP = "skip"
    CONTINUE = "continue"


class IfExists(str, Enum):
    """Table existence handling"""
    REPLACE = "replace"
    APPEND = "append"
    FAIL = "fail"


# ============================================================================
# Database Configuration Models
# ============================================================================

class DuckDBConfig(BaseModel):
    """DuckDB-specific configuration"""
    threads: Optional[int] = Field(default=4, description="Number of threads")
    memory_limit: Optional[str] = Field(default="4GB", description="Memory limit")
    enable_object_cache: Optional[bool] = Field(default=True)
    preserve_insertion_order: Optional[bool] = Field(default=False)


class SQLiteConfig(BaseModel):
    """SQLite-specific configuration"""
    timeout: Optional[float] = Field(default=10.0, description="Connection timeout")
    check_same_thread: Optional[bool] = Field(default=False, description="Allow multi-threaded access")
    init_sql: Optional[List[str]] = Field(default_factory=list, description="Initialization SQL statements")


class DatabaseConfig(BaseModel):
    """Database configuration"""
    type: DatabaseType = Field(..., description="Database engine type")
    path: str = Field(..., description="Database file path")
    reset_on_start: bool = Field(default=False, description="Drop and recreate database on start")
    schemas: List[str] = Field(default_factory=list, description="Schemas to create")

    # Engine-specific configs
    config: Optional[Union[DuckDBConfig, Dict[str, Any]]] = Field(default=None, description="Engine-specific config")
    pragmas: Optional[Dict[str, Any]] = Field(default=None, description="Legacy pragma support")
    extensions: Optional[List[str]] = Field(default=None, description="DuckDB extensions to load")

    # SQLite-specific
    enable_foreign_keys: Optional[bool] = Field(default=None)
    timeout: Optional[float] = Field(default=None)
    check_same_thread: Optional[bool] = Field(default=None)
    init_sql: Optional[List[str]] = Field(default=None)

    @field_validator('path')
    @classmethod
    def validate_path(cls, v: str) -> str:
        """Validate database path format"""
        if v and v != ":memory:":
            # Allow relative paths
            return v
        return v


# ============================================================================
# Job Configuration Models
# ============================================================================

class ProcessorConfig(BaseModel):
    """Processor configuration in a job"""
    name: str = Field(..., description="Processor name")
    # Allow any additional fields for processor-specific options
    model_config = {"extra": "allow"}


class JobInputConfig(BaseModel):
    """Job input configuration"""
    path: Optional[str] = Field(default=None, description="Input file path or directory")
    files: Optional[str] = Field(default=None, description="File pattern (glob or specific)")
    sheets: Optional[List[str]] = Field(default=None, description="Excel sheets to read")
    recursive: Optional[bool] = Field(default=None, description="Recursive file search")
    tables: Optional[List[str]] = Field(default=None, description="Tables to process (for stagers)")

    # XML-specific
    row_xpath: Optional[str] = Field(default=None, description="XPath for row elements")
    namespaces: Optional[Dict[str, str]] = Field(default=None, description="XML namespaces")
    fields: Optional[Dict[str, str]] = Field(default=None, description="Field mappings")

    # Allow additional fields
    model_config = {"extra": "allow"}


class JobOutputConfig(BaseModel):
    """Job output configuration"""
    table: Optional[str] = Field(default=None, description="Output table name")
    path: Optional[str] = Field(default=None, description="Output file path")
    root_element: Optional[str] = Field(default=None, description="XML root element")
    row_element: Optional[str] = Field(default=None, description="XML row element")

    # Allow additional fields
    model_config = {"extra": "allow"}


class StagerOptions(BaseModel):
    """Options for stager jobs"""
    if_exists: IfExists = Field(default=IfExists.REPLACE, description="Table existence handling")
    as_table: bool = Field(default=True, description="Create as TABLE (true) or VIEW (false)")
    table_prefix: str = Field(default="", description="Prefix for staged table names")


class JobConfig(BaseModel):
    """Job definition"""
    stage: str = Field(..., description="Pipeline stage this job belongs to")
    runner: str = Field(..., description="Runner name to use")
    description: Optional[str] = Field(default=None, description="Job description")

    depends_on: List[str] = Field(default_factory=list, description="Job dependencies")

    input: Optional[JobInputConfig] = Field(default=None, description="Input configuration")
    output: Optional[JobOutputConfig] = Field(default=None, description="Output configuration")

    processors: Optional[List[Union[str, ProcessorConfig, Dict[str, Any]]]] = Field(
        default=None,
        description="Processors to apply"
    )

    options: Optional[Union[StagerOptions, Dict[str, Any]]] = Field(
        default=None,
        description="Job-specific options"
    )

    # Additional fields
    database: Optional[str] = Field(default=None, description="Database name to use")
    schema_name: Optional[str] = Field(default=None, alias="schema", description="Schema name")
    sql_file: Optional[str] = Field(default=None, description="SQL file path for transformations")

    # Allow additional fields for custom job types
    model_config = {"extra": "allow", "populate_by_name": True}


# ============================================================================
# Runner Configuration Models
# ============================================================================

class RunnerConfig(BaseModel):
    """Runner definition"""
    type: RunnerType = Field(..., description="Runner type")
    plugin: str = Field(..., description="Plugin name")
    options: Dict[str, Any] = Field(default_factory=dict, description="Runner-specific options")


# ============================================================================
# Execution & Reporting Models
# ============================================================================

class ExecutionPolicy(BaseModel):
    """Execution policy configuration"""
    on_error: ErrorPolicy = Field(default=ErrorPolicy.STOP, description="Error handling policy")
    parallel_jobs: bool = Field(default=False, description="Enable parallel job execution")
    max_parallel: int = Field(default=4, description="Max parallel jobs")
    cache_staging: bool = Field(default=True, description="Cache staging tables")
    clean_temp_on_success: bool = Field(default=False, description="Clean temporary files on success")


class ReportingConfig(BaseModel):
    """Reporting configuration"""
    enabled: bool = Field(default=True, description="Enable reporting")
    path: str = Field(default="reports/pipeline_report.html", description="Report output path")
    include_dbt_results: bool = Field(default=True, description="Include dbt results")
    include_detailed_logs: bool = Field(default=True, description="Include detailed logs")


# ============================================================================
# Main Pipeline Configuration Model
# ============================================================================

class PipelineMetadata(BaseModel):
    """Pipeline metadata"""
    name: str = Field(..., description="Pipeline name")
    version: str = Field(..., description="Pipeline version")
    description: Optional[str] = Field(default=None, description="Pipeline description")


class PipelineConfig(BaseModel):
    """Complete pipeline configuration"""
    pipeline: PipelineMetadata = Field(..., description="Pipeline metadata")

    variables: Dict[str, str] = Field(default_factory=dict, description="Environment variables")

    databases: Dict[str, DatabaseConfig] = Field(..., description="Database configurations")

    execution: ExecutionPolicy = Field(default_factory=ExecutionPolicy, description="Execution policy")

    reporting: ReportingConfig = Field(default_factory=ReportingConfig, description="Reporting configuration")

    stages: List[str] = Field(..., description="Pipeline stages in execution order")

    jobs: Dict[str, JobConfig] = Field(..., description="Job definitions")

    runners: Dict[str, RunnerConfig] = Field(..., description="Runner definitions")

    @model_validator(mode='after')
    def validate_job_stages(self) -> 'PipelineConfig':
        """Validate that all job stages exist in the stages list"""
        defined_stages = set(self.stages)
        for job_name, job in self.jobs.items():
            if job.stage not in defined_stages:
                raise ValueError(
                    f"Job '{job_name}' references undefined stage '{job.stage}'. "
                    f"Available stages: {', '.join(defined_stages)}"
                )
        return self

    @model_validator(mode='after')
    def validate_job_dependencies(self) -> 'PipelineConfig':
        """Validate that all job dependencies exist"""
        job_names = set(self.jobs.keys())
        for job_name, job in self.jobs.items():
            for dep in job.depends_on:
                if dep not in job_names:
                    raise ValueError(
                        f"Job '{job_name}' depends on non-existent job '{dep}'. "
                        f"Available jobs: {', '.join(sorted(job_names))}"
                    )
        return self

    @model_validator(mode='after')
    def validate_job_runners(self) -> 'PipelineConfig':
        """Validate that all job runners are defined"""
        defined_runners = set(self.runners.keys())
        for job_name, job in self.jobs.items():
            if job.runner not in defined_runners:
                raise ValueError(
                    f"Job '{job_name}' uses undefined runner '{job.runner}'. "
                    f"Available runners: {', '.join(sorted(defined_runners))}"
                )
        return self

    @model_validator(mode='after')
    def validate_job_databases(self) -> 'PipelineConfig':
        """Validate that job database references exist"""
        defined_dbs = set(self.databases.keys())
        for job_name, job in self.jobs.items():
            if job.database and job.database not in defined_dbs:
                raise ValueError(
                    f"Job '{job_name}' references undefined database '{job.database}'. "
                    f"Available databases: {', '.join(sorted(defined_dbs))}"
                )
        return self


# ============================================================================
# Utility Functions
# ============================================================================

def load_and_validate_config(yaml_path: Path) -> PipelineConfig:
    """
    Load and validate pipeline configuration from YAML file

    Args:
        yaml_path: Path to YAML configuration file

    Returns:
        Validated PipelineConfig instance

    Raises:
        FileNotFoundError: If YAML file doesn't exist
        ValidationError: If configuration is invalid
    """
    import yaml

    if not yaml_path.exists():
        raise FileNotFoundError(f"Configuration file not found: {yaml_path}")

    with open(yaml_path, 'r', encoding='utf-8') as f:
        raw_config = yaml.safe_load(f)

    # Validate and return
    return PipelineConfig(**raw_config)


def config_to_dict(config: PipelineConfig) -> Dict[str, Any]:
    """Convert PipelineConfig back to dictionary (for backward compatibility)"""
    return config.model_dump(mode='python', exclude_none=True)


def get_validation_summary(config: PipelineConfig) -> Dict[str, Any]:
    """
    Extract validation summary for reporting

    Args:
        config: Validated PipelineConfig instance

    Returns:
        Dictionary with validation statistics for HTML report
    """
    # Count dependencies
    total_deps = sum(len(job.depends_on) for job in config.jobs.values())

    # Get unique runner types
    runner_types = list(set(r.type.value for r in config.runners.values()))

    # Get database types
    db_types = list(set(db.type.value for db in config.databases.values()))

    return {
        'status': 'VALID',
        'jobs_count': len(config.jobs),
        'stages_count': len(config.stages),
        'stages': config.stages,
        'databases_count': len(config.databases),
        'database_types': db_types,
        'runners_count': len(config.runners),
        'runner_types': runner_types,
        'dependencies_count': total_deps,
        'validation_checks': [
            '✓ All job stages reference valid pipeline stages',
            '✓ All job dependencies point to existing jobs',
            '✓ All job runners are properly defined',
            '✓ All database references are valid',
            '✓ Configuration schema is type-safe and validated'
        ]
    }
