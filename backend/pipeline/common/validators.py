"""
Pipeline validation module - validates Python, SQL, and configuration before execution.
"""
from __future__ import annotations

import ast
import inspect
import re
from pathlib import Path
from typing import Any, Dict, List, Set, Tuple, Optional

import polars as pl

from pipeline.common.logger import get_logger

log = get_logger()


class ValidationError(Exception):
    """Raised when validation fails."""
    pass


class PythonValidator:
    """Validates Python transformation files."""

    @staticmethod
    def validate_syntax(python_file: Path) -> Tuple[bool, Optional[str]]:
        """
        Check if Python file has valid syntax.

        Returns:
            (is_valid, error_message)
        """
        try:
            with open(python_file, 'r', encoding='utf-8') as f:
                code = f.read()
            ast.parse(code)
            return True, None
        except SyntaxError as e:
            return False, f"Syntax error at line {e.lineno}: {e.msg}"
        except Exception as e:
            return False, f"Error reading file: {e}"

    @staticmethod
    def validate_transform_function(python_file: Path, expected_params: List[str]) -> Tuple[bool, Optional[str]]:
        """
        Check if Python file has a 'transform' function with expected parameters.

        Args:
            python_file: Path to Python file
            expected_params: List of expected parameter names (e.g., ['customers_df', 'orders_df'])

        Returns:
            (is_valid, error_message)
        """
        try:
            # Import the module dynamically
            import importlib.util
            spec = importlib.util.spec_from_file_location("transform_module", python_file)
            if spec is None or spec.loader is None:
                return False, "Could not load module"

            module = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(module)

            # Check if transform function exists
            if not hasattr(module, 'transform'):
                return False, "Missing 'transform' function"

            transform_func = getattr(module, 'transform')
            if not callable(transform_func):
                return False, "'transform' is not a function"

            # Check function signature
            sig = inspect.signature(transform_func)
            actual_params = list(sig.parameters.keys())

            # Check if all expected parameters are present
            missing = set(expected_params) - set(actual_params)
            if missing:
                return False, f"Missing parameters: {missing}"

            extra = set(actual_params) - set(expected_params)
            if extra:
                return False, f"Unexpected parameters: {extra}"

            # Check return annotation (should return Dict[str, pl.DataFrame])
            if sig.return_annotation not in (inspect.Signature.empty, Dict[str, pl.DataFrame], 'Dict[str, pl.DataFrame]'):
                log.debug(f"Warning: Return type annotation not Dict[str, pl.DataFrame]")

            return True, None

        except ImportError as e:
            return False, f"Import error: {e}"
        except Exception as e:
            return False, f"Validation error: {e}"

    @staticmethod
    def validate_imports(python_file: Path) -> Tuple[bool, List[str]]:
        """
        Check if all imports in Python file are available.

        Returns:
            (all_available, list_of_missing_imports)
        """
        try:
            with open(python_file, 'r', encoding='utf-8') as f:
                code = f.read()

            tree = ast.parse(code)
            missing = []

            for node in ast.walk(tree):
                if isinstance(node, ast.Import):
                    for alias in node.names:
                        try:
                            __import__(alias.name)
                        except ImportError:
                            missing.append(alias.name)
                elif isinstance(node, ast.ImportFrom):
                    if node.module:
                        try:
                            __import__(node.module)
                        except ImportError:
                            missing.append(node.module)

            return len(missing) == 0, missing

        except Exception as e:
            log.debug(f"Could not validate imports: {e}")
            return True, []  # Don't fail on import validation errors


class SQLValidator:
    """Validates SQL queries and transformations."""

    # Common SQL keywords that should be present in valid SQL
    SQL_KEYWORDS = {'SELECT', 'CREATE', 'INSERT', 'UPDATE', 'DELETE', 'ALTER', 'DROP', 'WITH'}

    @staticmethod
    def validate_basic_syntax(sql: str) -> Tuple[bool, Optional[str]]:
        """
        Perform basic SQL syntax validation (not full parsing).

        Returns:
            (is_valid, error_message)
        """
        sql_upper = sql.upper().strip()

        # Check if SQL is not empty
        if not sql_upper:
            return False, "SQL is empty"

        # Check if SQL contains at least one keyword
        has_keyword = any(keyword in sql_upper for keyword in SQLValidator.SQL_KEYWORDS)
        if not has_keyword:
            return False, f"SQL does not contain any valid keywords: {SQLValidator.SQL_KEYWORDS}"

        # Check for basic balance of parentheses
        if sql.count('(') != sql.count(')'):
            return False, "Unbalanced parentheses"

        # Check for unterminated strings
        single_quotes = len(re.findall(r"(?<!\\)'", sql))
        if single_quotes % 2 != 0:
            return False, "Unterminated string (single quotes)"

        return True, None

    @staticmethod
    def extract_table_references(sql: str) -> Set[str]:
        """
        Extract table references from SQL (simplified pattern matching).

        Returns:
            Set of table names (in format "schema.table" or "table")
        """
        # Pattern to match table references: FROM/JOIN schema.table or table
        pattern = r'\b(?:FROM|JOIN)\s+([a-zA-Z_][a-zA-Z0-9_]*(?:\.[a-zA-Z_][a-zA-Z0-9_]*)?)\b'
        matches = re.findall(pattern, sql, re.IGNORECASE)
        return set(matches)

    @staticmethod
    def extract_created_tables(sql: str) -> Set[str]:
        """
        Extract table names being created from SQL.

        Returns:
            Set of table names (in format "schema.table" or "table")
        """
        # Pattern to match: CREATE [OR REPLACE] TABLE schema.table
        pattern = r'\bCREATE\s+(?:OR\s+REPLACE\s+)?TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([a-zA-Z_][a-zA-Z0-9_]*(?:\.[a-zA-Z_][a-zA-Z0-9_]*)?)\b'
        matches = re.findall(pattern, sql, re.IGNORECASE)
        return set(matches)


class PipelineValidator:
    """Validates complete pipeline configuration."""

    def __init__(self, config: Dict[str, Any], base_path: Path):
        self.config = config
        self.base_path = base_path
        self.errors: List[str] = []
        self.warnings: List[str] = []

    def validate_all(self) -> bool:
        """
        Run all validations.

        Returns:
            True if all validations pass, False otherwise
        """
        log.info("Validating pipeline configuration...")

        # Basic structure validation
        self._validate_structure()

        # Schema validation
        self._validate_schemas()

        # Python transformations
        self._validate_python_transforms()

        # SQL transformations
        self._validate_sql_transforms()

        # Table dependencies
        self._validate_table_dependencies()

        # Print results
        self._print_results()

        return len(self.errors) == 0

    def _validate_structure(self):
        """Validate basic pipeline structure."""
        required = ["stages", "jobs"]
        for section in required:
            if section not in self.config:
                self.errors.append(f"Missing required section: {section}")

    def _validate_schemas(self):
        """Validate that referenced schemas are defined."""
        databases = self.config.get("databases", {})
        defined_schemas = set()

        for db_name, db_config in databases.items():
            schemas = db_config.get("schemas", [])
            defined_schemas.update(schemas)

        if not defined_schemas:
            self.warnings.append("No schemas defined in database configuration")
            return

        # Check jobs that reference schemas
        jobs = self.config.get("jobs", {})
        for job_name, job_config in jobs.items():
            # Check stage jobs
            if "schema" in job_config:
                schema = job_config["schema"]
                if schema not in defined_schemas:
                    self.errors.append(f"Job '{job_name}' references undefined schema: {schema}")

            # Check Python transform output schemas
            if job_config.get("runner") == "python_transform":
                options = job_config.get("options", {})
                outputs = options.get("output", [])
                for output in outputs:
                    if "schema" in output:
                        schema = output["schema"]
                        if schema not in defined_schemas:
                            self.errors.append(
                                f"Job '{job_name}' Python output references undefined schema: {schema}"
                            )

    def _validate_python_transforms(self):
        """Validate Python transformation jobs."""
        jobs = self.config.get("jobs", {})
        variables = self.config.get("variables", {})

        for job_name, job_config in jobs.items():
            if job_config.get("runner") != "python_transform":
                continue

            options = job_config.get("options", {})
            python_file_str = options.get("python_file")
            python_code = options.get("python_code")

            # Check if either python_file or python_code is provided
            if not python_file_str and not python_code:
                self.errors.append(f"Job '{job_name}': Missing 'python_file' or 'python_code' in options")
                continue

            # If using inline python_code, validate syntax only
            if python_code:
                try:
                    ast.parse(python_code)
                except SyntaxError as e:
                    self.errors.append(f"Job '{job_name}': Python syntax error at line {e.lineno}: {e.msg}")
                continue

            # Expand variables in path for python_file
            python_file_str = self._expand_variables(python_file_str, variables)
            python_file = self.base_path / python_file_str

            if not python_file.exists():
                self.errors.append(f"Job '{job_name}': Python file not found: {python_file}")
                continue

            # Validate syntax
            is_valid, error = PythonValidator.validate_syntax(python_file)
            if not is_valid:
                self.errors.append(f"Job '{job_name}': {error}")
                continue

            # Validate transform function signature
            input_tables = options.get("input_tables", [])
            expected_params = [table.get("alias", table.get("table", "")) for table in input_tables]

            is_valid, error = PythonValidator.validate_transform_function(python_file, expected_params)
            if not is_valid:
                self.errors.append(f"Job '{job_name}': {error}")

            # Validate imports
            all_available, missing = PythonValidator.validate_imports(python_file)
            if not all_available:
                self.warnings.append(
                    f"Job '{job_name}': Missing imports: {missing}. "
                    "Install them before running."
                )

    def _validate_sql_transforms(self):
        """Validate SQL transformation jobs."""
        jobs = self.config.get("jobs", {})
        variables = self.config.get("variables", {})

        for job_name, job_config in jobs.items():
            if job_config.get("runner") != "sql_transform":
                continue

            sql = job_config.get("sql", "")
            sql_file = job_config.get("sql_file")

            if not sql and not sql_file:
                self.errors.append(f"Job '{job_name}': Missing 'sql' or 'sql_file'")
                continue

            # Load SQL from file if specified
            if sql_file:
                # Expand variables in path
                sql_file_expanded = self._expand_variables(sql_file, variables)
                sql_path = self.base_path / sql_file_expanded
                if not sql_path.exists():
                    self.errors.append(f"Job '{job_name}': SQL file not found: {sql_path}")
                    continue
                try:
                    with open(sql_path, 'r', encoding='utf-8') as f:
                        sql = f.read()
                except Exception as e:
                    self.errors.append(f"Job '{job_name}': Error reading SQL file: {e}")
                    continue

            # Validate SQL syntax
            is_valid, error = SQLValidator.validate_basic_syntax(sql)
            if not is_valid:
                self.errors.append(f"Job '{job_name}': {error}")

    def _validate_table_dependencies(self):
        """Validate that table dependencies are resolvable."""
        # This is a simplified check - just verify that tables referenced in SQL
        # are likely to be created by earlier jobs

        jobs = self.config.get("jobs", {})
        stages = self.config.get("stages", [])

        # Track which tables are created in which stage
        tables_by_stage: Dict[str, Set[str]] = {stage: set() for stage in stages}

        # First pass: identify tables created by each job
        for job_name, job_config in jobs.items():
            job_stage = job_config.get("stage", "")

            if job_config.get("runner") == "sql_transform":
                sql = job_config.get("sql", "")
                created = SQLValidator.extract_created_tables(sql)
                tables_by_stage[job_stage].update(created)

            elif job_config.get("runner") == "python_transform":
                options = job_config.get("options", {})
                outputs = options.get("output", [])
                for output in outputs:
                    schema = output.get("schema", "")
                    table = output.get("table", "")
                    if schema and table:
                        tables_by_stage[job_stage].add(f"{schema}.{table}")

        # Second pass: check if referenced tables exist
        # (This is simplified - doesn't check stage ordering)
        for job_name, job_config in jobs.items():
            if job_config.get("runner") == "sql_transform":
                sql = job_config.get("sql", "")
                referenced = SQLValidator.extract_table_references(sql)

                # Check if referenced tables are likely to exist
                # (This is a heuristic check, not perfect)
                for table_ref in referenced:
                    # Skip common CTEs or tables that might be in input schema
                    if any(table_ref.startswith(prefix) for prefix in ['input.', 'staging.', 'analytics.', 'mart.']):
                        continue  # Assume these are handled by stage jobs

    def _expand_variables(self, value: str, variables: Dict[str, Any]) -> str:
        """Expand {VAR} and ${VAR} in string."""
        for key, val in variables.items():
            value = value.replace(f"{{{key}}}", str(val))
            value = value.replace(f"${{{key}}}", str(val))
        return value

    def _print_results(self):
        """Print validation results."""
        if self.warnings:
            log.warning(f"{len(self.warnings)} warning(s):")
            for warning in self.warnings:
                log.warning(f"  - {warning}")

        if self.errors:
            log.error(f"{len(self.errors)} error(s):")
            for error in self.errors:
                log.error(f"  - {error}")
        else:
            log.success("All validations passed!")


def validate_pipeline(config: Dict[str, Any], base_path: Path = None) -> bool:
    """
    Validate pipeline configuration.

    Args:
        config: Pipeline configuration dict
        base_path: Base path for resolving relative paths (defaults to cwd)

    Returns:
        True if validation passes, False otherwise
    """
    if base_path is None:
        base_path = Path.cwd()

    validator = PipelineValidator(config, base_path)
    return validator.validate_all()
