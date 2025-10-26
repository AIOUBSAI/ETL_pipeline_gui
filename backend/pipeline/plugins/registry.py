from __future__ import annotations
from importlib import import_module
from importlib.metadata import entry_points
from typing import Any, Dict, Mapping, Optional, Type

from .api import Reader, Writer, MultiWriter, Processor, Runner, DatabaseEngine

# Registries
READERS: Dict[str, Type[Reader]] = {}
WRITERS: Dict[str, Type[Writer]] = {}
RUNNERS: Dict[str, Type[Runner]] = {}
DATABASE_ENGINES: Dict[str, Type[DatabaseEngine]] = {}
MULTI_WRITERS: Dict[str, Type[MultiWriter]] = {}
PROCESSORS: Dict[str, Type[Processor]] = {}


# ---------------- Registration decorators ----------------
def register_reader(cls: Type[Reader]):
    """Decorator used by built-in and external readers to self-register."""
    READERS[cls.name] = cls
    return cls


def register_writer(cls: Type[Writer]):
    """Decorator for per-table writers (CSV/Parquet/Excel/XML, etc.)."""
    WRITERS[cls.name] = cls
    return cls

def register_runner(cls: Type[Runner]):
    """Decorator for task runners (DBT, workflows, etc.)."""
    RUNNERS[cls.name] = cls
    return cls


def register_database_engine(cls: Type[DatabaseEngine]):
    """Decorator for database engines (DuckDB, SQLite, PostgreSQL, etc.)."""
    DATABASE_ENGINES[cls.name] = cls
    return cls

def register_multi_writer(cls: Type[MultiWriter]):
    """Decorator for writers that handle many/no tables at once (e.g., XML templates)."""
    MULTI_WRITERS[cls.name] = cls
    return cls


def register_processor(cls: Type[Processor]):
    """Decorator for processors to self-register."""
    PROCESSORS[cls.name] = cls
    return cls


# ---------------- Entry point discovery ----------------
def _discover_entrypoints(group: str):
    """Allow third-party packages to register plugins via setuptools entry points."""
    try:
        eps = entry_points().select(group=group)
    except Exception:
        return
    for ep in eps:
        ep.load()  # importing usually triggers @register_* in module import


# ---------------- Bootstrap built-ins + third-party ----------------
def bootstrap_discovery() -> None:
    """Import built-ins and discover external plugins."""
    builtin_modules = [
        # Readers
        "pipeline.io.readers.html_table_reader",
        "pipeline.io.readers.parquet_reader",
        "pipeline.io.readers.sqlite_reader",
        "pipeline.io.readers.duckdb_reader",
        "pipeline.io.readers.excel_reader",
        "pipeline.io.readers.jsonl_reader",
        "pipeline.io.readers.json_reader",
        "pipeline.io.readers.yaml_reader",
        "pipeline.io.readers.noop_reader",
        "pipeline.io.readers.csv_reader",
        "pipeline.io.readers.xml_reader",
        # Task Runners
        "pipeline.runners.dbt_runner",
        "pipeline.runners.python_transform_runner",
        "pipeline.runners.python_extract_runner",
        "pipeline.runners.python_export_runner",
        # Database Engines
        "pipeline.engines.duckdb_engine",
        "pipeline.engines.sqlite_engine",
        # Writers (per-table)
        "pipeline.io.writers.html_table_writer",
        "pipeline.io.writers.parquet_writer",
        "pipeline.io.writers.sqlite_writer",
        "pipeline.io.writers.duckdb_writer",
        "pipeline.io.writers.jsonl_writer",
        "pipeline.io.writers.excel_writer",
        "pipeline.io.writers.jsonl_writer",
        "pipeline.io.writers.json_writer",
        "pipeline.io.writers.yaml_writer",
        "pipeline.io.writers.csv_writer",
        "pipeline.io.writers.xml_writer",
        # Writers (multi)
        "pipeline.io.writers.excel_workbook_writer",
        "pipeline.io.writers.xml_template_writer",
        "pipeline.io.writers.sql_pipeline",
        # Processors
        "pipeline.proc.normalize_headers",
        "pipeline.proc.fill_merged_cells",
        "pipeline.proc.drop_empty_rows",
        "pipeline.proc.sql_transform",
        "pipeline.proc.dbt_transform",
        "pipeline.proc.type_cast",
        "pipeline.proc.add_constants",
        "pipeline.proc.require_columns",
        "pipeline.proc.sql_executor",
        "pipeline.proc.filter",
    ]
    for mod in builtin_modules:
        try:
            import_module(mod)
        except Exception:
            # Keep discovery resilient — a failing plugin shouldn't crash bootstrap.
            pass

    # Third-party via setuptools/pyproject entry points
    _discover_entrypoints("v3pipeline.multi_writers")
    _discover_entrypoints("v3pipeline.processors")
    _discover_entrypoints("v3pipeline.readers")
    _discover_entrypoints("v3pipeline.writers")
    _discover_entrypoints("v3pipeline.runners")
    _discover_entrypoints("v3pipeline.database_engines")



# ---------------- Plugin pickers ----------------
def get_reader(source: Mapping[str, Any]) -> Reader:
    """Pick a reader by explicit 'reader', then 'type', then first can_handle()."""
    explicit = source.get("reader")
    if explicit and explicit in READERS:
        return READERS[explicit]()  # type: ignore[call-arg]

    rtype = (source.get("type") or "").strip().lower()
    if rtype in READERS:
        return READERS[rtype]()  # type: ignore[call-arg]

    for cls in READERS.values():
        inst = cls()
        try:
            if inst.can_handle(source):
                return inst
        except Exception:
            continue
    raise ValueError(f"No reader plugin found for source: {source!r}")


def get_writer(target: Mapping[str, Any]) -> Writer:
    """Pick a per-table writer by 'writer'/'format' name or first can_handle()."""
    name = (str(target.get("writer") or target.get("format") or "")).strip().lower()
    if name in WRITERS:
        return WRITERS[name]()  # type: ignore[call-arg]
    for cls in WRITERS.values():
        inst = cls()
        try:
            if inst.can_handle(target):
                return inst
        except Exception:
            continue
    raise ValueError(f"No writer plugin found for target: {target!r}")


def get_runner(config: Mapping[str, Any]) -> Runner:
    """Pick a task runner by 'runner' name or first can_handle()."""
    name = (str(config.get("runner") or "")).strip().lower()
    if name in RUNNERS:
        return RUNNERS[name]()  # type: ignore[call-arg]
    for cls in RUNNERS.values():
        inst = cls()
        try:
            if inst.can_handle(config):
                return inst
        except Exception:
            continue
    raise ValueError(f"No runner plugin found for config: {config!r}")


def get_database_engine(config: Mapping[str, Any]) -> DatabaseEngine:
    """Pick a database engine by 'type' name or first can_handle()."""
    db_type = (str(config.get("type") or "duckdb")).strip().lower()
    if db_type in DATABASE_ENGINES:
        return DATABASE_ENGINES[db_type]()  # type: ignore[call-arg]
    for cls in DATABASE_ENGINES.values():
        inst = cls()
        try:
            if inst.can_handle(config):
                return inst
        except Exception:
            continue
    # Default to DuckDB if available
    if "duckdb" in DATABASE_ENGINES:
        return DATABASE_ENGINES["duckdb"]()  # type: ignore[call-arg]
    raise ValueError(f"No database engine found for config: {config!r}")



def get_multi_writer(target: Mapping[str, Any]) -> Optional[MultiWriter]:
    """Return a multi-writer if one matches, else None."""
    name = (str(target.get("writer") or target.get("format") or "")).strip().lower()
    if name in MULTI_WRITERS:
        return MULTI_WRITERS[name]()  # type: ignore[call-arg]
    for cls in MULTI_WRITERS.values():
        inst = cls()
        try:
            if inst.can_handle(target):
                return inst
        except Exception:
            continue
    return None


def get_applicable_processors(ctx: Mapping[str, Any]):
    """Return instantiated processors that apply to this context, ordered by .order."""
    procs = []
    for cls in PROCESSORS.values():
        p = cls()
        try:
            if p.applies_to(ctx):
                procs.append(p)
        except Exception:
            continue
    return sorted(procs, key=lambda p: getattr(p, "order", 100))
