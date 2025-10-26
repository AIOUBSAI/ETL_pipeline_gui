from __future__ import annotations
from typing import Any, Mapping, Dict
import polars as pl

from pipeline.plugins.api import Processor
from pipeline.plugins.registry import register_processor


_POLARS_TYPES: Dict[str, pl.DataType] = {
    "int": pl.Int64, "int64": pl.Int64, "int32": pl.Int32,
    "float": pl.Float64, "float64": pl.Float64, "float32": pl.Float32,
    "str": pl.Utf8, "string": pl.Utf8, "bool": pl.Boolean,
    "date": pl.Date, "datetime": pl.Datetime,
}

@register_processor
class TypeCast(Processor):
    """
    Cast columns to specified Polars dtypes.

    Options (ctx["processor_options"]):
      - type_cast: { col_name: "int|float|str|bool|date|datetime|int32|..." }
        (If you pass the mapping directly as options, that's accepted too.)
    """
    name = "type_cast"
    order = 40

    def applies_to(self, ctx: Mapping[str, Any]) -> bool:
        opts = ctx.get("processor_options") or {}
        m = opts.get("type_cast", opts)
        return isinstance(m, Mapping) and len(m) > 0

    def process(self, df: pl.DataFrame, ctx: Mapping[str, Any]) -> pl.DataFrame:
        opts = ctx.get("processor_options") or {}
        casts: Mapping[str, Any]
        if "type_cast" in opts and isinstance(opts["type_cast"], Mapping):
            casts = opts["type_cast"]  # nested mapping
        else:
            casts = opts  # allow direct mapping

        out = df
        for col, typ in casts.items():
            if col in out.columns:
                dt = _POLARS_TYPES.get(str(typ).lower())
                if dt:
                    out = out.with_columns(pl.col(col).cast(dt, strict=False))
        return out
