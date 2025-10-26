from __future__ import annotations
from typing import Any, Mapping, Sequence
import polars as pl

from pipeline.plugins.api import Processor
from pipeline.plugins.registry import register_processor


@register_processor
class DropEmptyRows(Processor):
    """
    Remove rows that are entirely null/blank across selected columns (or all).

    Options (ctx["processor_options"]):
      - drop_empty_rows: true | { columns: [..] }
        * if true: check all columns
        * if mapping: only check the given columns
    """
    name = "drop_empty_rows"
    order = 60

    def applies_to(self, ctx: Mapping[str, Any]) -> bool:
        opt = (ctx.get("processor_options") or {}).get("drop_empty_rows", False)
        return bool(opt)

    def process(self, df: pl.DataFrame, ctx: Mapping[str, Any]) -> pl.DataFrame:
        opt = (ctx.get("processor_options") or {}).get("drop_empty_rows", False)
        cols: Sequence[str] | None = None
        if isinstance(opt, Mapping):
            cols = opt.get("columns")

        working_cols = list(cols) if cols else list(df.columns)

        # Treat empty as: null OR all-whitespace after stripping
        exprs = []
        for c in working_cols:
            if c in df.columns:
                s = pl.col(c).cast(pl.Utf8, strict=False)
                # Use strip_chars() for broad Polars compatibility
                blank = s.str.strip_chars().eq("")
                exprs.append(pl.col(c).is_null() | blank)

        if not exprs:
            return df

        # Row is "empty" if ALL selected columns are empty
        predicate = exprs[0]
        for e in exprs[1:]:
            predicate = predicate & e

        return df.filter(~predicate)
