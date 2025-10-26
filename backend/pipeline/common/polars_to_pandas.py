from __future__ import annotations
import polars as pl

def to_pandas(df: pl.DataFrame):
    """
    Convert a Polars DataFrame to pandas across Polars versions.

    Polars <= 0.20 often accepted `use_pyarrow=...`.
    Polars >= 1.0 removed that kwarg.

    This helper tries the old signature, then falls back cleanly.
    """
    try:
        # Old signature (will raise TypeError on newer Polars)
        return df.to_pandas(use_pyarrow=False)  # type: ignore[call-arg]
    except TypeError:
        return df.to_pandas()
