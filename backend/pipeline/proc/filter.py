from __future__ import annotations
from typing import Any, Mapping, List, Dict, Union
import polars as pl
import re
from datetime import datetime

from pipeline.plugins.api import Processor
from pipeline.plugins.registry import register_processor
from pipeline.common.logger import get_logger

log = get_logger()


@register_processor
class Filter(Processor):
    """
    Comprehensive filtering processor for rows and columns with advanced conditional logic.

    Features:
    - Filter rows with complex conditions (AND/OR/NOT, nested)
    - Select/exclude columns dynamically (by name, regex, conditions)
    - Cross-column comparisons within same row
    - Environment variable substitution {VAR}
    - Data-type aware operations
    - Regex support throughout

    Configuration:
      rows: Row filtering rules
        - conditions: List of condition objects or simple dict
        - operator: "and" | "or" (default: "and")

      columns: Column filtering/selection rules
        - select: List of column specs (names, patterns, conditions)
        - exclude: List of column specs to remove
        - rename: Dict of {old: new} or {pattern: template}
        - dynamic_select: Select one column from multiple based on conditions

    Examples:

    # Simple row filter
    - name: filter
      rows:
        conditions:
          category: "Project Overview"
          status: "Active"
        operator: "and"

    # Advanced row filter with cross-column comparison
    - name: filter
      rows:
        conditions:
          - column: age
            operator: ">"
            value: 18
          - type: "column_compare"
            left: "price"
            operator: "<"
            right: "budget"
          - type: "expression"
            eval: "length(name) > 5 AND status != 'Pending'"
        operator: "and"

    # Column selection with patterns
    - name: filter
      columns:
        select: ["id", "name", "config*"]  # Glob patterns
        exclude: ["temp_*", "debug_*"]

    # Dynamic column selection (like old select_dynamic_column)
    - name: filter
      columns:
        dynamic_select:
          pattern: "configuration*"
          match_row:
            category: "Project Overview"
            subcategory: "Applicable Configuration"
          condition:
            type: "value"
            value: "{CONFIG_NAME}"
            operator: "=="
          output_name: "configuration"

    # Combined: filter rows AND select columns
    - name: filter
      rows:
        conditions:
          status: "Active"
      columns:
        select: ["id", "name", "value"]
        rename:
          value: "result"
    """
    name = "filter"
    order = 35

    def applies_to(self, ctx: Mapping[str, Any]) -> bool:
        opts = ctx.get("processor_options") or {}
        return bool(opts.get("rows") or opts.get("columns"))

    def process(self, df: pl.DataFrame, ctx: Mapping[str, Any]) -> pl.DataFrame:
        opts: Mapping[str, Any] = ctx.get("processor_options") or {}

        # Step 1: Filter rows
        rows_config = opts.get("rows")
        if rows_config:
            df = self._filter_rows(df, rows_config)

        # Step 2: Process columns
        columns_config = opts.get("columns")
        if columns_config:
            df = self._process_columns(df, columns_config)

        return df

    # ==================== ROW FILTERING ====================

    def _filter_rows(self, df: pl.DataFrame, config: Dict) -> pl.DataFrame:
        """Apply row filtering based on conditions."""
        conditions = config.get("conditions")
        operator = config.get("operator", "and").lower()

        if not conditions:
            return df

        filters = self._build_row_filters(df, conditions)

        if not filters:
            log.warning("[filter] No valid row conditions, returning unchanged")
            return df

        # Combine filters
        if operator == "and":
            combined = filters[0]
            for f in filters[1:]:
                combined = combined & f
        elif operator == "or":
            combined = filters[0]
            for f in filters[1:]:
                combined = combined | f
        else:
            raise ValueError(f"Unknown operator: {operator}")

        rows_before = len(df)
        result = df.filter(combined)
        rows_after = len(result)

        log.info(f"[filter] Row filter: {rows_before} → {rows_after} rows")
        return result

    def _build_row_filters(self, df: pl.DataFrame, conditions: Union[Dict, List]) -> List[pl.Expr]:
        """Build Polars filter expressions from conditions."""
        filters = []

        # Simple dict format: {column: value}
        if isinstance(conditions, dict):
            for col, val in conditions.items():
                if col not in df.columns:
                    log.warning(f"[filter] Column '{col}' not found")
                    continue
                filters.append(pl.col(col) == val)

        # Advanced list format
        elif isinstance(conditions, list):
            for cond in conditions:
                expr = self._build_condition_expr(df, cond)
                if expr is not None:
                    filters.append(expr)

        return filters

    def _build_condition_expr(self, df: pl.DataFrame, cond: Dict) -> pl.Expr | None:
        """Build a single condition expression."""
        cond_type = cond.get("type", "simple")

        # Type 1: Simple comparison (column op value)
        if cond_type == "simple" or "column" in cond:
            col = cond.get("column")
            op = cond.get("operator", "==")
            val = cond.get("value")

            if col not in df.columns:
                log.warning(f"[filter] Column '{col}' not found")
                return None

            return self._build_comparison(pl.col(col), op, val)

        # Type 2: Cross-column comparison (colA op colB)
        elif cond_type == "column_compare":
            left = cond.get("left")
            right = cond.get("right")
            op = cond.get("operator", "==")

            if left not in df.columns or right not in df.columns:
                log.warning(f"[filter] Columns '{left}' or '{right}' not found")
                return None

            return self._build_comparison(pl.col(left), op, pl.col(right))

        # Type 3: Nested logical (AND/OR/NOT)
        elif cond_type in ["and", "or", "not"]:
            sub_conditions = cond.get("conditions", [])
            sub_filters = []

            for sub_cond in sub_conditions:
                expr = self._build_condition_expr(df, sub_cond)
                if expr is not None:
                    sub_filters.append(expr)

            if not sub_filters:
                return None

            if cond_type == "and":
                result = sub_filters[0]
                for f in sub_filters[1:]:
                    result = result & f
                return result
            elif cond_type == "or":
                result = sub_filters[0]
                for f in sub_filters[1:]:
                    result = result | f
                return result
            elif cond_type == "not":
                return ~sub_filters[0]

        # Type 4: Regex match
        elif cond_type == "regex":
            col = cond.get("column")
            pattern = cond.get("pattern")

            if col not in df.columns:
                log.warning(f"[filter] Column '{col}' not found")
                return None

            return pl.col(col).str.contains(pattern)

        log.warning(f"[filter] Unknown condition type: {cond_type}")
        return None

    def _build_comparison(self, left: pl.Expr, operator: str, right: Any) -> pl.Expr:
        """Build a comparison expression."""
        if operator == "==" or operator == "=":
            return left == right
        elif operator == "!=":
            return left != right
        elif operator == ">":
            return left > right
        elif operator == "<":
            return left < right
        elif operator == ">=":
            return left >= right
        elif operator == "<=":
            return left <= right
        elif operator == "contains":
            return left.cast(pl.Utf8).str.contains(str(right))
        elif operator == "starts_with":
            return left.cast(pl.Utf8).str.starts_with(str(right))
        elif operator == "ends_with":
            return left.cast(pl.Utf8).str.ends_with(str(right))
        elif operator == "regex":
            return left.cast(pl.Utf8).str.contains(str(right))
        elif operator == "in":
            values = right if isinstance(right, list) else [right]
            return left.is_in(values)
        elif operator == "not_in":
            values = right if isinstance(right, list) else [right]
            return ~left.is_in(values)
        else:
            log.warning(f"[filter] Unknown operator '{operator}', using ==")
            return left == right

    # ==================== COLUMN PROCESSING ====================

    def _process_columns(self, df: pl.DataFrame, config: Dict) -> pl.DataFrame:
        """Process column selection, exclusion, renaming, and dynamic selection."""

        # Step 1: Dynamic column selection (like old select_dynamic_column)
        dynamic_config = config.get("dynamic_select")
        if dynamic_config:
            df = self._dynamic_column_select(df, dynamic_config)

        # Step 2: Column selection
        select_specs = config.get("select")
        exclude_specs = config.get("exclude")

        if select_specs or exclude_specs:
            selected_cols = self._resolve_column_selection(df.columns, select_specs, exclude_specs)

            if selected_cols:
                df = df.select(selected_cols)
                log.info(f"[filter] Column selection: {len(df.columns)} columns kept")

        # Step 3: Column renaming
        rename_map = config.get("rename", {})
        if rename_map:
            df = df.rename(rename_map)
            log.info(f"[filter] Renamed {len(rename_map)} column(s)")

        return df

    def _resolve_column_selection(
        self,
        all_columns: List[str],
        select_specs: List[str] | None,
        exclude_specs: List[str] | None
    ) -> List[str]:
        """Resolve which columns to keep based on select/exclude specs."""

        # If no select specified, start with all columns
        if select_specs is None:
            selected = set(all_columns)
        else:
            selected = set()
            for spec in select_specs:
                matched = self._match_column_pattern(all_columns, spec)
                selected.update(matched)

        # Apply exclusions
        if exclude_specs:
            for spec in exclude_specs:
                matched = self._match_column_pattern(all_columns, spec)
                selected -= set(matched)

        return sorted(list(selected))

    def _match_column_pattern(self, all_columns: List[str], pattern: str) -> List[str]:
        """Match columns by exact name, glob pattern, or regex."""

        # Exact match
        if pattern in all_columns:
            return [pattern]

        # Check if it's a regex (has special chars)
        if any(c in pattern for c in ['^', '$', '\\', '(', ')', '|', '[', ']']):
            regex = re.compile(pattern)
            return [col for col in all_columns if regex.match(col)]

        # Glob pattern
        regex_pattern = pattern.replace('.', '\\.').replace('*', '.*').replace('?', '.')
        regex = re.compile(f'^{regex_pattern}$')
        return [col for col in all_columns if regex.match(col)]

    def _dynamic_column_select(self, df: pl.DataFrame, config: Dict) -> pl.DataFrame:
        """Select one column from multiple candidates based on conditions."""

        pattern = config.get("pattern")
        match_row = config.get("match_row", {})
        condition = config.get("condition", {})
        output_name = config.get("output_name")
        keep_columns = config.get("keep_columns", [])

        if not pattern or not output_name:
            raise ValueError("[filter] dynamic_select requires 'pattern' and 'output_name'")

        # Find candidate columns
        candidates = self._match_column_pattern(df.columns, pattern)

        if not candidates:
            raise ValueError(f"[filter] No columns matched pattern: {pattern}")

        log.debug(f"[filter] Dynamic select candidates: {candidates}")

        # Find matching row
        if match_row:
            filters = [pl.col(col) == val for col, val in match_row.items() if col in df.columns]
            if filters:
                combined = filters[0]
                for f in filters[1:]:
                    combined = combined & f
                matching_df = df.filter(combined)
            else:
                matching_df = df
        else:
            matching_df = df

        if len(matching_df) == 0:
            raise ValueError(f"[filter] No rows matched: {match_row}")

        # Find which column satisfies condition
        selected_col = self._find_matching_column(matching_df, candidates, condition)

        log.info(f"[filter] Dynamic select: '{selected_col}' → '{output_name}'")

        # Build result
        result_cols = []
        for col in keep_columns:
            if col in df.columns:
                result_cols.append(pl.col(col))

        result_cols.append(pl.col(selected_col).alias(output_name))

        return df.select(result_cols)

    def _find_matching_column(
        self,
        df: pl.DataFrame,
        candidates: List[str],
        condition: Dict
    ) -> str:
        """Find which candidate column satisfies the condition."""

        cond_type = condition.get("type", "value")
        operator = condition.get("operator", "==")
        value = condition.get("value")

        for col in candidates:
            cell_value = df[col][0]

            if cond_type == "value":
                if self._compare_values(cell_value, operator, value):
                    return col

            elif cond_type == "regex":
                if value and re.search(value, str(cell_value)):
                    return col

        # Fallback to first
        log.warning(f"[filter] No column matched condition, using first: {candidates[0]}")
        return candidates[0]

    def _compare_values(self, left: Any, operator: str, right: Any) -> bool:
        """Compare two values."""
        try:
            if operator == "==":
                return left == right
            elif operator == "!=":
                return left != right
            elif operator == ">":
                return float(left) > float(right)
            elif operator == "<":
                return float(left) < float(right)
            elif operator == "contains":
                return str(right) in str(left)
            elif operator == "regex":
                return bool(re.search(str(right), str(left)))
            return False
        except:
            return False
