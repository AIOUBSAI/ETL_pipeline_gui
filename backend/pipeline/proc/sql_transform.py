from __future__ import annotations
from pathlib import Path
from typing import Any, Dict, Mapping
import os
import polars as pl
import duckdb

from pipeline.plugins.api import Processor
from pipeline.plugins.registry import register_processor
from pipeline.common.sql_template import SQLTemplateEngine

def _strip_bom_ws(s: str) -> str:
    return s.replace("\ufeff", "").strip()

def _short(s: str, n: int = 240) -> str:
    s = " ".join(s.split())
    return (s[: n - 1] + "…") if len(s) > n else s

@register_processor
class SQLTransform(Processor):
    """
    Run a SQL SELECT (or CTE + SELECT) against ctx['duckdb'].

    Options:
      - sql (str): inline SQL (may contain ${ENV} or {ENV})
      - sql_file (str): path to .sql file (read if sql is not provided)
      - input_view (str): name to expose input DF as (default: 'input')
      - params (mapping): extra expansion vars merged with OS env and ctx['params']
      - strict (bool): raise if SQL empty after interpolation (default True)
      - debug (bool): print expanded SQL snippet before execution (default False)

    Context:
      - ctx['duckdb']: duckdb.DuckDBPyConnection
      - ctx['params']: optional mapping
    """
    name = "sql_transform"
    order = 100

    def applies_to(self, ctx: Dict[str, Any]) -> bool:
        return True

    def process(self, df: pl.DataFrame, ctx: Dict[str, Any]) -> pl.DataFrame:
        con: duckdb.DuckDBPyConnection | None = ctx.get("duckdb")
        if con is None:
            return df

        opts: Mapping[str, Any] = ctx.get("processor_options", {})
        input_view = str(opts.get("input_view") or "input")
        strict = bool(opts.get("strict", True))
        debug = bool(opts.get("debug", False))
        use_jinja = bool(opts.get("use_jinja", True))  # Enable by default

        # Build template context
        template_ctx: Dict[str, Any] = {
            **os.environ,
            **(ctx.get("params") or {}),
            **(opts.get("params") or {}),
            "table_name": input_view,
        }

        # Initialize template engine
        engine = SQLTemplateEngine(strict=strict, strip_comments=False)

        # 1) source SQL (inline or file)
        raw_sql = str(opts.get("sql") or "").rstrip(";")
        if not raw_sql and opts.get("sql_file"):
            fp = Path(str(opts["sql_file"]))
            if not fp.is_absolute() and "project_dir" in template_ctx:
                fp = Path(str(template_ctx["project_dir"])) / fp
            raw_sql = fp.read_text(encoding="utf-8").rstrip(";")

        # 2) Render template (Jinja2 with legacy fallback)
        sql = _strip_bom_ws(engine.render(raw_sql, template_ctx)).strip()
        if debug:
            from pipeline.common.logger import get_logger
            log_instance = get_logger()
            log_instance.debug(f"[sql_transform] SQL (expanded): {_short(sql) or '<EMPTY>'}")

        if not sql:
            if strict:
                raise ValueError("sql_transform: SQL is empty after interpolation/comment stripping.")
            return df

        # Register input view
        rel = con.from_df(df.to_pandas())
        rel.create_view(input_view, replace=True)

        try:
            out = pl.read_database(sql, connection=con)
            return out
        finally:
            try:
                con.execute(f'DROP VIEW IF EXISTS "{input_view}";')
            except Exception:
                pass
