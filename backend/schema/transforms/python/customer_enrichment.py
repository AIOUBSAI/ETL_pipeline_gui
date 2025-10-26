"""
Example Python transformation: Customer Enrichment

This demonstrates complex data processing that's difficult to express in SQL:
- Custom business logic
- Complex conditional transformations
- Statistical calculations
- Data cleaning operations
"""
import polars as pl
from datetime import datetime, timedelta
from typing import Dict


def transform(
    enriched_df: pl.DataFrame
) -> Dict[str, pl.DataFrame]:
    """
    Further enrich data with additional analytics.

    Args:
        enriched_df: Enriched data table from previous transformation

    Returns:
        Dictionary of result DataFrames to write back to DuckDB
    """

    # ========================================================================
    # 1. Add additional value-based calculations
    # ========================================================================

    result_df = enriched_df.with_columns([
        # Add value ranking within category
        pl.col("adjusted_value").rank().over("category").alias("value_rank_in_category"),

        # Calculate percentage above/below average
        ((pl.col("adjusted_value") - pl.col("avg_value")) / pl.col("avg_value") * 100)
        .round(2)
        .alias("pct_vs_category_avg"),

        # Add quality score based on value tier and rank
        pl.when(pl.col("value_tier") == "high")
        .then(pl.lit(3))
        .when(pl.col("value_tier") == "medium")
        .then(pl.lit(2))
        .otherwise(pl.lit(1))
        .alias("tier_score")
    ])

    # ========================================================================
    # 2. Calculate cumulative metrics
    # ========================================================================

    result_df = result_df.sort("category", "id").with_columns([
        # Cumulative sum within category
        pl.col("adjusted_value")
        .cum_sum()
        .over("category")
        .alias("cumulative_value_in_category"),

        # Running count within category
        pl.lit(1)
        .cum_sum()
        .over("category")
        .alias("record_sequence_in_category")
    ])

    # ========================================================================
    # 3. Create summary statistics table
    # ========================================================================

    category_stats = result_df.group_by("category").agg([
        pl.count("id").alias("total_records"),
        pl.col("adjusted_value").mean().alias("mean_value"),
        pl.col("adjusted_value").median().alias("median_value"),
        pl.col("adjusted_value").std().alias("std_value"),
        pl.col("adjusted_value").min().alias("min_value"),
        pl.col("adjusted_value").max().alias("max_value"),
        pl.col("value_tier").value_counts().alias("tier_distribution")
    ])

    # ========================================================================
    # Return results
    # ========================================================================

    return {
        "enriched_df": result_df
    }
