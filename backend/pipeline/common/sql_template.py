"""
Jinja2-based SQL templating utility

Replaces regex-based ${VAR} and {VAR} interpolation with proper Jinja2 templating
"""
from __future__ import annotations

import os
import re
from functools import lru_cache
from pathlib import Path
from typing import Any, Dict, Mapping, Optional

from jinja2 import Environment, StrictUndefined, Template, TemplateSyntaxError, FileSystemLoader
from jinja2.ext import Extension

# Regex patterns for legacy support
_DOLLAR = re.compile(r"\$\{([^}]+)\}")
_BRACES = re.compile(r"\{([A-Za-z0-9_]+)\}")
_SINGLELINE_COMMENTS = re.compile(r"--[^\n]*")
_MULTILINE_COMMENTS = re.compile(r"/\*[\s\S]*?\*/", flags=re.MULTILINE)


def strip_sql_comments(sql: str) -> str:
    """Strip SQL comments from string"""
    sql = _MULTILINE_COMMENTS.sub("", sql)
    sql = _SINGLELINE_COMMENTS.sub("", sql)
    return sql


# ============================================================================
# Jinja2 Custom Filters for SQL
# ============================================================================

def filter_quote_sql(value: Any) -> str:
    """SQL single-quote a value, escaping internal quotes"""
    if value is None:
        return "NULL"
    s = str(value).replace("'", "''")
    return f"'{s}'"


def filter_identifier(value: Any) -> str:
    """Quote SQL identifier (table/column name) with double quotes"""
    if value is None:
        return '""'
    s = str(value).replace('"', '""')
    return f'"{s}"'


def filter_join_sql(values: list, sep: str = ", ") -> str:
    """Join list items with separator (default comma)"""
    return sep.join(str(v) for v in values)


def filter_in_list(values: list) -> str:
    """Format list for SQL IN clause: ['a','b'] -> ('a','b')"""
    quoted = [filter_quote_sql(v) for v in values]
    return f"({', '.join(quoted)})"


def filter_snake_case(value: str) -> str:
    """Convert string to snake_case"""
    s = re.sub(r'([A-Z]+)([A-Z][a-z])', r'\1_\2', value)
    s = re.sub(r'([a-z\d])([A-Z])', r'\1_\2', s)
    return s.lower().replace('-', '_').replace(' ', '_')


def filter_upper(value: str) -> str:
    """Convert to uppercase"""
    return str(value).upper()


def filter_lower(value: str) -> str:
    """Convert to lowercase"""
    return str(value).lower()


@lru_cache(maxsize=256)
def _compile_template_cached(sql: str, strict: bool, template_paths_tuple: Optional[tuple] = None) -> Template:
    """
    Compile and cache Jinja2 template

    Args:
        sql: SQL template string
        strict: Strict mode flag
        template_paths_tuple: Tuple of template paths (hashable for cache)

    Returns:
        Compiled Jinja2 Template object
    """
    template_paths = [Path(p) for p in template_paths_tuple] if template_paths_tuple else None
    env = _create_sql_environment_uncached(strict, template_paths)
    return env.from_string(sql)


def _create_sql_environment_uncached(
    strict: bool = False,
    template_paths: Optional[list[Path]] = None
) -> Environment:
    """
    Create Jinja2 environment configured for SQL templating

    Args:
        strict: If True, raise on undefined variables
        template_paths: List of directories to search for {% include %} templates

    Returns:
        Configured Jinja2 Environment
    """
    loader = None
    if template_paths:
        loader = FileSystemLoader([str(p) for p in template_paths])

    env = Environment(
        loader=loader,
        undefined=StrictUndefined if strict else StrictUndefined.__bases__[0],
        trim_blocks=True,
        lstrip_blocks=True,
        keep_trailing_newline=True,
        auto_reload=False,  # Disable auto-reload for cached templates
        cache_size=400      # Internal AST cache size
    )

    # Register SQL filters
    env.filters['quote'] = filter_quote_sql
    env.filters['identifier'] = filter_identifier
    env.filters['join_sql'] = filter_join_sql
    env.filters['in_list'] = filter_in_list
    env.filters['snake_case'] = filter_snake_case
    env.filters['upper'] = filter_upper
    env.filters['lower'] = filter_lower

    # Register custom tests
    env.tests['defined'] = lambda x: x is not None
    env.tests['undefined'] = lambda x: x is None

    return env


def create_sql_environment(
    strict: bool = False,
    template_paths: Optional[list[Path]] = None
) -> Environment:
    """Public API wrapper for creating SQL environment"""
    return _create_sql_environment_uncached(strict, template_paths)


def render_sql_template(
    sql: str,
    context: Mapping[str, Any],
    strict: bool = False,
    strip_comments: bool = False,
    template_paths: Optional[list[Path]] = None
) -> str:
    """
    Render SQL template using Jinja2

    Args:
        sql: SQL template string (supports {% macro %}, {% include %}, {% if %}, {% for %})
        context: Variables for template rendering
        strict: If True, raise on undefined variables (default: False, treats as empty string)
        strip_comments: Strip SQL comments before rendering
        template_paths: Directories to search for {% include %} files

    Returns:
        Rendered SQL string

    Examples:
        >>> render_sql_template("SELECT * FROM {{ table }}", {"table": "users"})
        'SELECT * FROM users'

        >>> render_sql_template("SELECT {{ col|quote }} FROM t", {"col": "O'Brien"})
        "SELECT 'O''Brien' FROM t"

        >>> sql = '''
        ... {% macro select_cols(cols) %}
        ... SELECT {% for c in cols %}{{ c }}{% if not loop.last %}, {% endif %}{% endfor %}
        ... {% endmacro %}
        ... {{ select_cols(['id', 'name']) }} FROM users
        ... '''
        >>> render_sql_template(sql, {})
        'SELECT id, name FROM users'
    """
    if strip_comments:
        sql = strip_sql_comments(sql)

    # Convert template_paths to tuple for caching (must be hashable)
    template_paths_tuple = tuple(str(p) for p in template_paths) if template_paths else None

    try:
        # Use cached template compilation
        template = _compile_template_cached(sql, strict, template_paths_tuple)
        return template.render(**context)
    except TemplateSyntaxError as e:
        # Enhanced error reporting with context
        lines = sql.split('\n')
        error_line = lines[e.lineno - 1] if e.lineno <= len(lines) else ""
        context_msg = f"\n  Line {e.lineno}: {error_line.strip()}\n  Error: {e.message}"
        raise ValueError(f"SQL template syntax error:{context_msg}") from e
    except Exception as e:
        # Handle runtime errors (undefined variables in strict mode, etc.)
        raise ValueError(f"SQL template render error: {str(e)}") from e


def render_sql_file(
    file_path: Path,
    context: Mapping[str, Any],
    strict: bool = False,
    strip_comments: bool = False
) -> str:
    """
    Load and render SQL template from file

    Args:
        file_path: Path to .sql file
        context: Variables for template rendering
        strict: If True, raise on undefined variables
        strip_comments: Strip SQL comments before rendering

    Returns:
        Rendered SQL string
    """
    if not file_path.exists():
        raise FileNotFoundError(f"SQL file not found: {file_path}")

    sql = file_path.read_text(encoding="utf-8")
    return render_sql_template(sql, context, strict, strip_comments)


def legacy_expand_placeholders(s: str, env: Mapping[str, Any]) -> str:
    """
    Legacy regex-based placeholder expansion (${VAR} and {VAR})

    DEPRECATED: Use render_sql_template() instead

    Args:
        s: String with placeholders
        env: Environment variables

    Returns:
        Expanded string
    """
    if not s:
        return s
    s = _DOLLAR.sub(lambda m: str(env.get(m.group(1), "")), s)
    s = _BRACES.sub(lambda m: str(env.get(m.group(1), "")), s)
    return s


class SQLTemplateEngine:
    """
    SQL template engine with automatic legacy fallback

    Attempts Jinja2 first, falls back to regex if no Jinja2 syntax detected
    """

    def __init__(self, strict: bool = False, strip_comments: bool = False):
        self.strict = strict
        self.strip_comments = strip_comments

    def render(self, sql: str, context: Mapping[str, Any]) -> str:
        """
        Render SQL template with automatic format detection

        Tries Jinja2 if {{ }} syntax found, otherwise uses legacy regex
        """
        # Detect Jinja2 syntax
        has_jinja = "{{" in sql or "{%" in sql or "{#" in sql

        if has_jinja:
            # Use Jinja2
            return render_sql_template(sql, context, self.strict, self.strip_comments)
        else:
            # Use legacy regex for backward compatibility
            if self.strip_comments:
                sql = strip_sql_comments(sql)
            return legacy_expand_placeholders(sql, context)

    def render_file(self, file_path: Path, context: Mapping[str, Any]) -> str:
        """Render SQL file with automatic format detection"""
        sql = file_path.read_text(encoding="utf-8")
        return self.render(sql, context)
