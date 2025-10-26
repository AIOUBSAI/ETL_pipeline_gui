# pipeline/proc/normalize_headers.py
from __future__ import annotations
from typing import Any, Mapping, Sequence

import polars as pl

from pipeline.plugins.registry import register_processor
from pipeline.plugins.api import Processor  # type: ignore

# If you have a shared helper, you can import it instead.
def _normalize_header(name: str) -> str:
    s = (name or "").strip()
    s = s.replace("\u00A0", " ")  # nbsp -> space
    s = s.lower()
    # collapse spaces/punct into underscores
    import re
    s = re.sub(r"[^0-9a-zA-Z]+", "_", s)
    s = re.sub(r"_+", "_", s).strip("_")
    return s or "col"

@register_processor
class NormalizeHeaders(Processor):
    """
    Make column names machine-friendly (lowercase, underscores, deduplicate).
    Options (optional):
      - dedupe_suffixes: sequence[str], default ["", ".1", ".2", ...] behavior similar to pandas
    """

    name = "normalize_headers"
    order = 10

    def applies_to(self, ctx: Mapping[str, Any]) -> bool:
        return True

    def process(self, df: pl.DataFrame, ctx: Mapping[str, Any]) -> pl.DataFrame:
        # (ctx["processor_options"] can hold future options; currently unused)
        cols = df.columns
        norm = [_normalize_header(c) for c in cols]

        # de-duplicate while preserving order
        seen: dict[str, int] = {}
        unique: list[str] = []
        for c in norm:
            if c not in seen:
                seen[c] = 0
                unique.append(c)
            else:
                seen[c] += 1
                unique.append(f"{c}_{seen[c]}")

        if unique == list(cols):
            return df
        return df.rename(dict(zip(cols, unique)))
