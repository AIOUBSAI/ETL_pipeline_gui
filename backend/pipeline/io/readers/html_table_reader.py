from __future__ import annotations
from pathlib import Path
from typing import Any, Iterable, Mapping, Optional, List
import polars as pl

from pipeline.plugins.api import Table, Reader
from pipeline.plugins.registry import register_reader
from pipeline.common.fileio import iter_source_files

try:
    import pandas as pd
except Exception:
    pd = None


@register_reader
class HTMLTableReader(Reader):
    """
    Reader for HTML pages/files containing <table> elements. Uses pandas.read_html.

    Options:
      - path/files/recursive
      - url (str): read directly from URL (alternative to path/files)
      - table_index (int): which table to extract (default 0)
      - match (str): regex/text to select specific tables
    """
    name = "html_table"

    def can_handle(self, source: Mapping[str, object]) -> bool:
        t = str(source.get("type") or "").lower()
        if t in {"html", "html_table"}:
            return True
        path = str(source.get("path") or "")
        url = str(source.get("url") or "")
        return path.lower().endswith((".html", ".htm")) or url.startswith(("http://", "https://"))

    def read(self, source: Mapping[str, object], base_dir: Path) -> Iterable[Table]:
        if pd is None:
            raise ImportError("HTMLTableReader requires pandas. `pip install pandas lxml`")

        table_index = int(source.get("table_index", 0))
        match = source.get("match")
        url = source.get("url")

        if isinstance(url, str) and url.startswith(("http://", "https://")):
            pdf_list = pd.read_html(url, match=match if isinstance(match, str) else None)
            if not pdf_list:
                yield Table(name=str(source.get("name") or "table"), df=pl.DataFrame({}), meta={"url": url})
                return
            pdf = pdf_list[table_index]
            df = pl.from_pandas(pdf, include_index=False)
            yield Table(name=str(source.get("name") or "table"), df=df, meta={"url": url, "table_index": table_index})
            return

        for fp in iter_source_files(base_dir, source, default_glob="*.html"):
            if not fp.exists() or not fp.is_file():
                continue
            pdf_list = pd.read_html(str(fp), match=match if isinstance(match, str) else None)
            if not pdf_list:
                yield Table(name=fp.stem, df=pl.DataFrame({}), meta={"file": str(fp)})
                continue
            pdf = pdf_list[table_index]
            df = pl.from_pandas(pdf, include_index=False)
            yield Table(name=fp.stem, df=df, meta={"file": str(fp), "table_index": table_index})
