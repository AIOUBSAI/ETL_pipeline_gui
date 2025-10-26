"""
Data Quality framework for pipeline validation

Provides expectation-based data quality checks with configurable actions
"""
from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional, Union

import polars as pl


class QualityAction(str, Enum):
    """Action to take when quality check fails"""
    WARN = "warn"           # Log warning, continue
    FAIL = "fail"           # Raise exception, stop pipeline
    QUARANTINE = "quarantine"  # Write failed rows to quarantine, continue


class ExpectationType(str, Enum):
    """Built-in expectation types"""
    NOT_NULL = "not_null"
    UNIQUE = "unique"
    IN_SET = "in_set"
    BETWEEN = "between"
    REGEX_MATCH = "regex_match"
    ROW_COUNT_BETWEEN = "row_count_between"
    COLUMN_EXISTS = "column_exists"
    CUSTOM = "custom"


@dataclass
class QualityResult:
    """Result of a quality check"""
    expectation_name: str
    expectation_type: ExpectationType
    passed: bool
    rows_evaluated: int
    rows_failed: int
    failure_pct: float
    message: str
    failed_rows: Optional[pl.DataFrame] = None
    metadata: Dict[str, Any] = field(default_factory=dict)

    def __str__(self) -> str:
        status = "PASS" if self.passed else "FAIL"
        return (
            f"[{status}] {self.expectation_name} ({self.expectation_type.value}) | "
            f"{self.rows_failed}/{self.rows_evaluated} failed ({self.failure_pct:.2f}%) | "
            f"{self.message}"
        )


@dataclass
class Expectation:
    """
    Data quality expectation

    Examples:
        >>> # Column must not be null
        >>> Expectation(
        ...     name="user_id_not_null",
        ...     type=ExpectationType.NOT_NULL,
        ...     column="user_id",
        ...     action=QualityAction.FAIL
        ... )

        >>> # Values must be in set
        >>> Expectation(
        ...     name="status_valid",
        ...     type=ExpectationType.IN_SET,
        ...     column="status",
        ...     config={"values": ["active", "inactive", "pending"]},
        ...     action=QualityAction.FAIL
        ... )

        >>> # Row count range
        >>> Expectation(
        ...     name="reasonable_row_count",
        ...     type=ExpectationType.ROW_COUNT_BETWEEN,
        ...     config={"min": 100, "max": 1000000},
        ...     action=QualityAction.WARN
        ... )
    """
    name: str
    type: ExpectationType
    column: Optional[str] = None
    config: Dict[str, Any] = field(default_factory=dict)
    action: QualityAction = QualityAction.FAIL
    threshold_pct: float = 0.0  # Allow % failures before triggering action


class QualityValidator:
    """
    Data quality validation engine

    Runs expectations against DataFrames and handles actions
    """

    def __init__(self, quarantine_dir: Optional[Path] = None):
        """
        Args:
            quarantine_dir: Directory to write quarantined rows
        """
        self.quarantine_dir = quarantine_dir
        self.results: List[QualityResult] = []

    def validate(
        self,
        df: pl.DataFrame,
        expectations: List[Expectation],
        context: Optional[Dict[str, Any]] = None
    ) -> tuple[pl.DataFrame, List[QualityResult]]:
        """
        Validate DataFrame against expectations

        Args:
            df: DataFrame to validate
            expectations: List of expectations to check
            context: Optional context metadata (run_id, dataset_name, etc.)

        Returns:
            (clean_df, results) - Clean rows and validation results

        Raises:
            ValueError: If any FAIL action expectation fails
        """
        self.results = []
        clean_df = df
        context = context or {}

        for exp in expectations:
            result = self._run_expectation(df, exp)
            self.results.append(result)

            if not result.passed:
                # Handle failed expectation
                if exp.action == QualityAction.FAIL:
                    raise ValueError(
                        f"Data quality check failed: {result}\n"
                        f"Context: {context}"
                    )
                elif exp.action == QualityAction.QUARANTINE:
                    if result.failed_rows is not None and len(result.failed_rows) > 0:
                        clean_df = self._quarantine_rows(
                            df, result.failed_rows, exp, context
                        )
                elif exp.action == QualityAction.WARN:
                    # Just log (caller should check results)
                    pass

        return clean_df, self.results

    def _run_expectation(self, df: pl.DataFrame, exp: Expectation) -> QualityResult:
        """Run single expectation and return result"""
        if exp.type == ExpectationType.NOT_NULL:
            return self._expect_not_null(df, exp)
        elif exp.type == ExpectationType.UNIQUE:
            return self._expect_unique(df, exp)
        elif exp.type == ExpectationType.IN_SET:
            return self._expect_in_set(df, exp)
        elif exp.type == ExpectationType.BETWEEN:
            return self._expect_between(df, exp)
        elif exp.type == ExpectationType.REGEX_MATCH:
            return self._expect_regex_match(df, exp)
        elif exp.type == ExpectationType.ROW_COUNT_BETWEEN:
            return self._expect_row_count_between(df, exp)
        elif exp.type == ExpectationType.COLUMN_EXISTS:
            return self._expect_column_exists(df, exp)
        elif exp.type == ExpectationType.CUSTOM:
            return self._expect_custom(df, exp)
        else:
            raise ValueError(f"Unknown expectation type: {exp.type}")

    def _expect_not_null(self, df: pl.DataFrame, exp: Expectation) -> QualityResult:
        """Expect column values are not null"""
        col = exp.column
        if col not in df.columns:
            return QualityResult(
                expectation_name=exp.name,
                expectation_type=exp.type,
                passed=False,
                rows_evaluated=0,
                rows_failed=0,
                failure_pct=0.0,
                message=f"Column '{col}' not found in DataFrame"
            )

        null_mask = df[col].is_null()
        failed_df = df.filter(null_mask)
        rows_failed = len(failed_df)
        rows_evaluated = len(df)
        failure_pct = (rows_failed / rows_evaluated * 100) if rows_evaluated > 0 else 0
        passed = failure_pct <= exp.threshold_pct

        return QualityResult(
            expectation_name=exp.name,
            expectation_type=exp.type,
            passed=passed,
            rows_evaluated=rows_evaluated,
            rows_failed=rows_failed,
            failure_pct=failure_pct,
            message=f"Column '{col}' has {rows_failed} null values",
            failed_rows=failed_df if rows_failed > 0 else None
        )

    def _expect_unique(self, df: pl.DataFrame, exp: Expectation) -> QualityResult:
        """Expect column values are unique"""
        col = exp.column
        if col not in df.columns:
            return QualityResult(
                expectation_name=exp.name,
                expectation_type=exp.type,
                passed=False,
                rows_evaluated=0,
                rows_failed=0,
                failure_pct=0.0,
                message=f"Column '{col}' not found in DataFrame"
            )

        # Find duplicates
        dup_counts = df.group_by(col).agg(pl.len().alias("count"))
        duplicates = dup_counts.filter(pl.col("count") > 1)

        if len(duplicates) > 0:
            dup_values = duplicates[col].to_list()
            failed_df = df.filter(pl.col(col).is_in(dup_values))
            rows_failed = len(failed_df)
        else:
            failed_df = None
            rows_failed = 0

        rows_evaluated = len(df)
        failure_pct = (rows_failed / rows_evaluated * 100) if rows_evaluated > 0 else 0
        passed = failure_pct <= exp.threshold_pct

        return QualityResult(
            expectation_name=exp.name,
            expectation_type=exp.type,
            passed=passed,
            rows_evaluated=rows_evaluated,
            rows_failed=rows_failed,
            failure_pct=failure_pct,
            message=f"Column '{col}' has {len(duplicates)} duplicate values affecting {rows_failed} rows",
            failed_rows=failed_df
        )

    def _expect_in_set(self, df: pl.DataFrame, exp: Expectation) -> QualityResult:
        """Expect column values are in allowed set"""
        col = exp.column
        allowed_values = exp.config.get("values", [])

        if col not in df.columns:
            return QualityResult(
                expectation_name=exp.name,
                expectation_type=exp.type,
                passed=False,
                rows_evaluated=0,
                rows_failed=0,
                failure_pct=0.0,
                message=f"Column '{col}' not found in DataFrame"
            )

        failed_df = df.filter(~pl.col(col).is_in(allowed_values) & pl.col(col).is_not_null())
        rows_failed = len(failed_df)
        rows_evaluated = len(df)
        failure_pct = (rows_failed / rows_evaluated * 100) if rows_evaluated > 0 else 0
        passed = failure_pct <= exp.threshold_pct

        return QualityResult(
            expectation_name=exp.name,
            expectation_type=exp.type,
            passed=passed,
            rows_evaluated=rows_evaluated,
            rows_failed=rows_failed,
            failure_pct=failure_pct,
            message=f"Column '{col}' has {rows_failed} values not in {allowed_values}",
            failed_rows=failed_df if rows_failed > 0 else None
        )

    def _expect_between(self, df: pl.DataFrame, exp: Expectation) -> QualityResult:
        """Expect column values are between min and max"""
        col = exp.column
        min_val = exp.config.get("min")
        max_val = exp.config.get("max")

        if col not in df.columns:
            return QualityResult(
                expectation_name=exp.name,
                expectation_type=exp.type,
                passed=False,
                rows_evaluated=0,
                rows_failed=0,
                failure_pct=0.0,
                message=f"Column '{col}' not found in DataFrame"
            )

        condition = pl.lit(True)
        if min_val is not None:
            condition = condition & (pl.col(col) >= min_val)
        if max_val is not None:
            condition = condition & (pl.col(col) <= max_val)

        failed_df = df.filter(~condition & pl.col(col).is_not_null())
        rows_failed = len(failed_df)
        rows_evaluated = len(df)
        failure_pct = (rows_failed / rows_evaluated * 100) if rows_evaluated > 0 else 0
        passed = failure_pct <= exp.threshold_pct

        return QualityResult(
            expectation_name=exp.name,
            expectation_type=exp.type,
            passed=passed,
            rows_evaluated=rows_evaluated,
            rows_failed=rows_failed,
            failure_pct=failure_pct,
            message=f"Column '{col}' has {rows_failed} values outside [{min_val}, {max_val}]",
            failed_rows=failed_df if rows_failed > 0 else None
        )

    def _expect_regex_match(self, df: pl.DataFrame, exp: Expectation) -> QualityResult:
        """Expect column values match regex pattern"""
        col = exp.column
        pattern = exp.config.get("pattern", "")

        if col not in df.columns:
            return QualityResult(
                expectation_name=exp.name,
                expectation_type=exp.type,
                passed=False,
                rows_evaluated=0,
                rows_failed=0,
                failure_pct=0.0,
                message=f"Column '{col}' not found in DataFrame"
            )

        failed_df = df.filter(
            ~pl.col(col).cast(pl.Utf8).str.contains(pattern) & pl.col(col).is_not_null()
        )
        rows_failed = len(failed_df)
        rows_evaluated = len(df)
        failure_pct = (rows_failed / rows_evaluated * 100) if rows_evaluated > 0 else 0
        passed = failure_pct <= exp.threshold_pct

        return QualityResult(
            expectation_name=exp.name,
            expectation_type=exp.type,
            passed=passed,
            rows_evaluated=rows_evaluated,
            rows_failed=rows_failed,
            failure_pct=failure_pct,
            message=f"Column '{col}' has {rows_failed} values not matching pattern '{pattern}'",
            failed_rows=failed_df if rows_failed > 0 else None
        )

    def _expect_row_count_between(self, df: pl.DataFrame, exp: Expectation) -> QualityResult:
        """Expect row count is between min and max"""
        min_rows = exp.config.get("min", 0)
        max_rows = exp.config.get("max", float("inf"))
        row_count = len(df)

        passed = min_rows <= row_count <= max_rows
        message = f"Row count {row_count} "
        if not passed:
            message += f"not in range [{min_rows}, {max_rows}]"
        else:
            message += f"in range [{min_rows}, {max_rows}]"

        return QualityResult(
            expectation_name=exp.name,
            expectation_type=exp.type,
            passed=passed,
            rows_evaluated=row_count,
            rows_failed=0 if passed else row_count,
            failure_pct=0.0 if passed else 100.0,
            message=message
        )

    def _expect_column_exists(self, df: pl.DataFrame, exp: Expectation) -> QualityResult:
        """Expect column exists in DataFrame"""
        col = exp.column
        exists = col in df.columns

        return QualityResult(
            expectation_name=exp.name,
            expectation_type=exp.type,
            passed=exists,
            rows_evaluated=len(df),
            rows_failed=0,
            failure_pct=0.0,
            message=f"Column '{col}' {'exists' if exists else 'missing'}"
        )

    def _expect_custom(self, df: pl.DataFrame, exp: Expectation) -> QualityResult:
        """Run custom expectation function"""
        func = exp.config.get("function")
        if not callable(func):
            return QualityResult(
                expectation_name=exp.name,
                expectation_type=exp.type,
                passed=False,
                rows_evaluated=0,
                rows_failed=0,
                failure_pct=0.0,
                message="Custom function not provided or not callable"
            )

        # Custom function should return (passed: bool, failed_df: Optional[pl.DataFrame], message: str)
        passed, failed_df, message = func(df, exp.config)
        rows_failed = len(failed_df) if failed_df is not None else 0
        rows_evaluated = len(df)
        failure_pct = (rows_failed / rows_evaluated * 100) if rows_evaluated > 0 else 0

        return QualityResult(
            expectation_name=exp.name,
            expectation_type=exp.type,
            passed=passed,
            rows_evaluated=rows_evaluated,
            rows_failed=rows_failed,
            failure_pct=failure_pct,
            message=message,
            failed_rows=failed_df
        )

    def _quarantine_rows(
        self,
        df: pl.DataFrame,
        failed_rows: pl.DataFrame,
        exp: Expectation,
        context: Dict[str, Any]
    ) -> pl.DataFrame:
        """
        Write failed rows to quarantine and return clean DataFrame

        Args:
            df: Original DataFrame
            failed_rows: Rows that failed validation
            exp: Expectation that failed
            context: Run context

        Returns:
            Clean DataFrame (original minus failed rows)
        """
        if self.quarantine_dir and len(failed_rows) > 0:
            self.quarantine_dir.mkdir(parents=True, exist_ok=True)

            # Add metadata columns
            quarantine_df = failed_rows.with_columns([
                pl.lit(exp.name).alias("_quality_check"),
                pl.lit(exp.type.value).alias("_check_type"),
                pl.lit(context.get("run_id", "unknown")).alias("_run_id"),
                pl.lit(context.get("dataset_name", "unknown")).alias("_dataset")
            ])

            # Write to parquet with timestamp
            import datetime
            timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
            quarantine_file = self.quarantine_dir / f"{exp.name}_{timestamp}.parquet"
            quarantine_df.write_parquet(quarantine_file)

        # Return clean rows (anti-join)
        # Create unique identifier for anti-join
        if len(df.columns) > 0:
            # Use row index for anti-join
            df_with_idx = df.with_row_count("_row_idx")
            failed_with_idx = failed_rows.with_row_count("_row_idx")
            clean_df = df_with_idx.join(
                failed_with_idx.select("_row_idx"),
                on="_row_idx",
                how="anti"
            ).drop("_row_idx")
            return clean_df

        return df

    def get_summary(self) -> Dict[str, Any]:
        """Get summary of validation results"""
        total = len(self.results)
        passed = sum(1 for r in self.results if r.passed)
        failed = total - passed

        return {
            "total_checks": total,
            "passed": passed,
            "failed": failed,
            "pass_rate": (passed / total * 100) if total > 0 else 0.0,
            "results": [
                {
                    "name": r.expectation_name,
                    "type": r.expectation_type.value,
                    "passed": r.passed,
                    "rows_failed": r.rows_failed,
                    "failure_pct": r.failure_pct,
                    "message": r.message
                }
                for r in self.results
            ]
        }
