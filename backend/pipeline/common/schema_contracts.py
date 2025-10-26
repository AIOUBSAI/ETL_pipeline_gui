"""
Schema contracts using Pydantic for DataFrame validation

Extends Pydantic config validation to data schemas
"""
from __future__ import annotations

from datetime import date, datetime
from enum import Enum
from typing import Any, Dict, List, Literal, Optional, Type, Union

import polars as pl
from pydantic import BaseModel, Field, ValidationError, field_validator


class ColumnType(str, Enum):
    """Supported column types"""
    INT = "int"
    FLOAT = "float"
    STRING = "string"
    BOOLEAN = "boolean"
    DATE = "date"
    DATETIME = "datetime"
    BINARY = "binary"


class ColumnContract(BaseModel):
    """Contract for a single column"""
    name: str = Field(..., description="Column name")
    type: ColumnType = Field(..., description="Data type")
    nullable: bool = Field(True, description="Allow null values")
    unique: bool = Field(False, description="Values must be unique")
    min_value: Optional[Union[int, float]] = Field(None, description="Minimum value (numeric types)")
    max_value: Optional[Union[int, float]] = Field(None, description="Maximum value (numeric types)")
    allowed_values: Optional[List[Any]] = Field(None, description="Allowed values (enum)")
    pattern: Optional[str] = Field(None, description="Regex pattern (string types)")
    description: Optional[str] = Field(None, description="Column description")
    tags: List[str] = Field(default_factory=list, description="Tags (e.g., 'pii', 'sensitive')")

    @field_validator("type", mode="before")
    @classmethod
    def parse_type(cls, v):
        if isinstance(v, str):
            return ColumnType(v.lower())
        return v


class SchemaContract(BaseModel):
    """
    Schema contract for DataFrame validation

    Examples:
        >>> contract = SchemaContract(
        ...     name="users",
        ...     version="1.0",
        ...     columns=[
        ...         ColumnContract(name="user_id", type=ColumnType.INT, nullable=False, unique=True),
        ...         ColumnContract(name="email", type=ColumnType.STRING, nullable=False, pattern=r'^[^@]+@[^@]+$'),
        ...         ColumnContract(name="status", type=ColumnType.STRING, allowed_values=["active", "inactive"]),
        ...         ColumnContract(name="age", type=ColumnType.INT, min_value=0, max_value=150)
        ...     ],
        ...     primary_keys=["user_id"]
        ... )
    """
    name: str = Field(..., description="Schema name")
    version: str = Field("1.0", description="Schema version")
    columns: List[ColumnContract] = Field(..., description="Column contracts")
    primary_keys: List[str] = Field(default_factory=list, description="Primary key columns")
    unique_constraints: List[List[str]] = Field(default_factory=list, description="Multi-column unique constraints")
    check_constraints: List[str] = Field(default_factory=list, description="Custom SQL CHECK constraints")
    description: Optional[str] = Field(None, description="Schema description")
    tags: List[str] = Field(default_factory=list, description="Schema tags")

    def validate_dataframe(self, df: pl.DataFrame, strict: bool = True) -> SchemaValidationResult:
        """
        Validate DataFrame against schema contract

        Args:
            df: DataFrame to validate
            strict: If True, fail on extra columns not in contract

        Returns:
            SchemaValidationResult with validation details
        """
        errors = []
        warnings = []

        # Check for missing columns
        required_cols = {col.name for col in self.columns}
        df_cols = set(df.columns)

        missing_cols = required_cols - df_cols
        if missing_cols:
            errors.append(f"Missing required columns: {missing_cols}")

        # Check for extra columns (in strict mode)
        extra_cols = df_cols - required_cols
        if strict and extra_cols:
            errors.append(f"Extra columns not in contract: {extra_cols}")
        elif extra_cols:
            warnings.append(f"Extra columns not in contract: {extra_cols}")

        # Validate each column
        for col_contract in self.columns:
            if col_contract.name not in df.columns:
                continue  # Already reported as missing

            col_errors = self._validate_column(df, col_contract)
            errors.extend(col_errors)

        # Validate primary key uniqueness
        if self.primary_keys:
            pk_errors = self._validate_primary_keys(df)
            errors.extend(pk_errors)

        # Validate unique constraints
        for unique_cols in self.unique_constraints:
            unique_errors = self._validate_unique_constraint(df, unique_cols)
            errors.extend(unique_errors)

        passed = len(errors) == 0

        return SchemaValidationResult(
            schema_name=self.name,
            schema_version=self.version,
            passed=passed,
            errors=errors,
            warnings=warnings,
            rows_validated=len(df),
            columns_validated=len(self.columns)
        )

    def _validate_column(self, df: pl.DataFrame, col: ColumnContract) -> List[str]:
        """Validate single column against contract"""
        errors = []
        col_name = col.name
        series = df[col_name]

        # Check nullability
        if not col.nullable:
            null_count = series.null_count()
            if null_count > 0:
                errors.append(f"Column '{col_name}' has {null_count} null values (nullable=False)")

        # Check type compatibility
        type_error = self._check_type_compatibility(series, col.type)
        if type_error:
            errors.append(f"Column '{col_name}': {type_error}")

        # Check uniqueness
        if col.unique:
            non_null_series = series.drop_nulls()
            if len(non_null_series) != non_null_series.n_unique():
                errors.append(f"Column '{col_name}' has duplicate values (unique=True)")

        # Check min/max values
        if col.min_value is not None or col.max_value is not None:
            range_errors = self._check_value_range(series, col.min_value, col.max_value, col_name)
            errors.extend(range_errors)

        # Check allowed values
        if col.allowed_values is not None:
            invalid_values = series.filter(
                ~series.is_in(col.allowed_values) & series.is_not_null()
            ).unique()
            if len(invalid_values) > 0:
                errors.append(
                    f"Column '{col_name}' has invalid values {invalid_values.to_list()[:5]} "
                    f"(allowed: {col.allowed_values})"
                )

        # Check regex pattern
        if col.pattern is not None:
            try:
                invalid_count = series.filter(
                    ~series.cast(pl.Utf8).str.contains(col.pattern) & series.is_not_null()
                ).len()
                if invalid_count > 0:
                    errors.append(
                        f"Column '{col_name}' has {invalid_count} values not matching pattern '{col.pattern}'"
                    )
            except Exception as e:
                errors.append(f"Column '{col_name}' pattern validation failed: {e}")

        return errors

    def _check_type_compatibility(self, series: pl.Series, expected_type: ColumnType) -> Optional[str]:
        """Check if series type is compatible with expected type"""
        dtype = series.dtype

        type_map = {
            ColumnType.INT: [pl.Int8, pl.Int16, pl.Int32, pl.Int64, pl.UInt8, pl.UInt16, pl.UInt32, pl.UInt64],
            ColumnType.FLOAT: [pl.Float32, pl.Float64],
            ColumnType.STRING: [pl.Utf8, pl.Categorical],
            ColumnType.BOOLEAN: [pl.Boolean],
            ColumnType.DATE: [pl.Date],
            ColumnType.DATETIME: [pl.Datetime],
            ColumnType.BINARY: [pl.Binary]
        }

        expected_dtypes = type_map.get(expected_type, [])
        if dtype not in expected_dtypes:
            return f"Type mismatch: expected {expected_type.value}, got {dtype}"

        return None

    def _check_value_range(
        self, series: pl.Series, min_val: Optional[Union[int, float]], max_val: Optional[Union[int, float]], col_name: str
    ) -> List[str]:
        """Check if values are within range"""
        errors = []
        non_null = series.drop_nulls()

        if len(non_null) == 0:
            return errors

        if min_val is not None:
            below_min = non_null.filter(non_null < min_val).len()
            if below_min > 0:
                errors.append(f"Column '{col_name}' has {below_min} values below minimum {min_val}")

        if max_val is not None:
            above_max = non_null.filter(non_null > max_val).len()
            if above_max > 0:
                errors.append(f"Column '{col_name}' has {above_max} values above maximum {max_val}")

        return errors

    def _validate_primary_keys(self, df: pl.DataFrame) -> List[str]:
        """Validate primary key uniqueness"""
        errors = []

        # Check all PK columns exist
        missing_pk_cols = set(self.primary_keys) - set(df.columns)
        if missing_pk_cols:
            errors.append(f"Primary key columns missing: {missing_pk_cols}")
            return errors

        # Check for nulls in PK columns
        for pk_col in self.primary_keys:
            null_count = df[pk_col].null_count()
            if null_count > 0:
                errors.append(f"Primary key column '{pk_col}' has {null_count} null values")

        # Check uniqueness of PK combination
        if len(self.primary_keys) > 0:
            pk_df = df.select(self.primary_keys)
            unique_count = pk_df.unique().height
            if unique_count != len(df):
                errors.append(
                    f"Primary key {self.primary_keys} has duplicates "
                    f"({len(df) - unique_count} duplicate rows)"
                )

        return errors

    def _validate_unique_constraint(self, df: pl.DataFrame, unique_cols: List[str]) -> List[str]:
        """Validate multi-column unique constraint"""
        errors = []

        # Check all columns exist
        missing_cols = set(unique_cols) - set(df.columns)
        if missing_cols:
            errors.append(f"Unique constraint columns missing: {missing_cols}")
            return errors

        # Check uniqueness
        constraint_df = df.select(unique_cols)
        unique_count = constraint_df.unique().height
        if unique_count != len(df):
            errors.append(
                f"Unique constraint {unique_cols} violated "
                f"({len(df) - unique_count} duplicate combinations)"
            )

        return errors

    def to_polars_schema(self) -> Dict[str, pl.DataType]:
        """Convert contract to Polars schema dict"""
        type_map = {
            ColumnType.INT: pl.Int64,
            ColumnType.FLOAT: pl.Float64,
            ColumnType.STRING: pl.Utf8,
            ColumnType.BOOLEAN: pl.Boolean,
            ColumnType.DATE: pl.Date,
            ColumnType.DATETIME: pl.Datetime,
            ColumnType.BINARY: pl.Binary
        }

        return {col.name: type_map[col.type] for col in self.columns}

    def to_duckdb_ddl(self, table_name: Optional[str] = None) -> str:
        """Generate DuckDB CREATE TABLE DDL"""
        table_name = table_name or self.name

        type_map = {
            ColumnType.INT: "BIGINT",
            ColumnType.FLOAT: "DOUBLE",
            ColumnType.STRING: "VARCHAR",
            ColumnType.BOOLEAN: "BOOLEAN",
            ColumnType.DATE: "DATE",
            ColumnType.DATETIME: "TIMESTAMP",
            ColumnType.BINARY: "BLOB"
        }

        col_defs = []
        for col in self.columns:
            parts = [col.name, type_map[col.type]]

            if not col.nullable:
                parts.append("NOT NULL")

            if col.unique:
                parts.append("UNIQUE")

            col_defs.append(" ".join(parts))

        # Add primary key constraint
        if self.primary_keys:
            pk_constraint = f"PRIMARY KEY ({', '.join(self.primary_keys)})"
            col_defs.append(pk_constraint)

        # Add unique constraints
        for unique_cols in self.unique_constraints:
            unique_constraint = f"UNIQUE ({', '.join(unique_cols)})"
            col_defs.append(unique_constraint)

        ddl = f"CREATE TABLE {table_name} (\n  " + ",\n  ".join(col_defs) + "\n)"
        return ddl


class SchemaValidationResult(BaseModel):
    """Result of schema validation"""
    schema_name: str
    schema_version: str
    passed: bool
    errors: List[str] = Field(default_factory=list)
    warnings: List[str] = Field(default_factory=list)
    rows_validated: int = 0
    columns_validated: int = 0

    def __str__(self) -> str:
        status = "PASS" if self.passed else "FAIL"
        summary = f"[{status}] Schema: {self.schema_name} v{self.schema_version} | {self.rows_validated} rows, {self.columns_validated} columns"

        if self.errors:
            summary += f"\n  Errors ({len(self.errors)}):"
            for err in self.errors:
                summary += f"\n    - {err}"

        if self.warnings:
            summary += f"\n  Warnings ({len(self.warnings)}):"
            for warn in self.warnings:
                summary += f"\n    - {warn}"

        return summary

    def raise_if_failed(self):
        """Raise exception if validation failed"""
        if not self.passed:
            raise ValueError(f"Schema validation failed:\n{self}")


def validate_dataframe(
    df: pl.DataFrame,
    contract: SchemaContract,
    strict: bool = True,
    raise_on_error: bool = False
) -> SchemaValidationResult:
    """
    Convenience function to validate DataFrame

    Args:
        df: DataFrame to validate
        contract: Schema contract
        strict: Fail on extra columns
        raise_on_error: Raise exception if validation fails

    Returns:
        SchemaValidationResult

    Examples:
        >>> result = validate_dataframe(df, contract, strict=True, raise_on_error=True)
    """
    result = contract.validate_dataframe(df, strict=strict)

    if raise_on_error and not result.passed:
        result.raise_if_failed()

    return result
