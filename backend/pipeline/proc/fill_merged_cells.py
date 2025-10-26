from __future__ import annotations
from typing import Any, Mapping, Sequence, List
import polars as pl

from pipeline.plugins.api import Processor
from pipeline.plugins.registry import register_processor


def _blank_expr(col: pl.Expr, tokens: List[str]) -> pl.Expr:
    """
    Build an expression that is True when the value is "blank":
    - NULL
    - after strip, empty string
    - after strip+lower, equals one of the tokens (e.g., "-", "null")
    """
    s = col.cast(pl.Utf8, strict=False).str.strip_chars()
    low = s.str.to_lowercase()
    token_set = [t.lower() for t in tokens]
    return col.is_null() | (s == "") | low.is_in(token_set)


@register_processor
class FillMergedCells(Processor):
    """
    Forward/backward-fill merged-cell style gaps in specific columns.

    Options (ctx["processor_options"]):
      - columns: list[str]              # which columns to fill (alias: fill_merged)
      - direction: "down" | "up"        # default "down"
      - empty_tokens: list[str]         # treated as empty before filling (default ["", "-", "NULL"])
    """
    name = "fill_merged_cells"
    order = 50

    def applies_to(self, ctx: Mapping[str, Any]) -> bool:
        opts = ctx.get("processor_options") or {}
        cols = opts.get("columns") or opts.get("fill_merged")
        return isinstance(cols, (list, tuple)) and len(cols) > 0

    def process(self, df: pl.DataFrame, ctx: Mapping[str, Any]) -> pl.DataFrame:
        opts = ctx.get("processor_options") or {}
        cols: Sequence[str] = opts.get("columns") or opts.get("fill_merged") or ()
        direction = str(opts.get("direction") or "down").lower()
        empty_tokens: List[str] = list(opts.get("empty_tokens") or ["", "-", "NULL"])

        out = df
        for c in cols:
            if c not in out.columns:
                continue

            # 1) convert empty tokens to NULL so fill works
            blank = _blank_expr(pl.col(c), empty_tokens)
            out = out.with_columns(
                pl.when(blank).then(pl.lit(None)).otherwise(pl.col(c)).alias(c)
            )

            # 2) fill
            if direction == "up":
                out = out.with_columns(pl.col(c).backward_fill())
            else:
                out = out.with_columns(pl.col(c).forward_fill())

        return out
