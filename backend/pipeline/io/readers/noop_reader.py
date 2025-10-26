from __future__ import annotations
from pathlib import Path
from typing import Iterable, Mapping
import polars as pl

from pipeline.plugins.api import Table, Reader
from pipeline.plugins.registry import register_reader

@register_reader
class NoopReader(Reader):
    """Emits a single empty table so you can attach writers that do work."""
    name = "noop"

    def can_handle(self, source: Mapping[str, object]) -> bool:
        return (source.get("type") == "noop") or (source.get("reader") == "noop")

    def read(self, source: Mapping[str, object], base_dir: Path) -> Iterable[Table]:
        yield Table(name=source.get("name") or "noop", df=pl.DataFrame({}), meta={})
