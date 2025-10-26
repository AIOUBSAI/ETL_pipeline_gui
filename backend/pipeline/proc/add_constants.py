from __future__ import annotations
from typing import Any, Dict, Mapping
import polars as pl

from pipeline.plugins.api import Processor
from pipeline.plugins.registry import register_processor


@register_processor
class AddConstants(Processor):
    """
    Add literal columns (e.g., direction='IN').

    Options (ctx["processor_options"]):
      - add_constants: { colA: "value", colB: 123, colC: true }
    """
    name = "add_constants"
    order = 35  # before type_cast so constants can be cast later

    def applies_to(self, ctx: Mapping[str, Any]) -> bool:
        ac = (ctx.get("processor_options") or {}).get("add_constants")
        return isinstance(ac, Mapping) and len(ac) > 0

    def process(self, df: pl.DataFrame, ctx: Mapping[str, Any]) -> pl.DataFrame:
        consts: Dict[str, Any] = dict((ctx.get("processor_options") or {}).get("add_constants") or {})
        if not consts:
            return df
        exprs = [pl.lit(v).alias(k) for k, v in consts.items()]
        return df.with_columns(*exprs)
