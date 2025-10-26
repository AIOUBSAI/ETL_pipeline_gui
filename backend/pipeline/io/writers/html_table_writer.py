from __future__ import annotations
import os, re
from pathlib import Path
from typing import Mapping
from html import escape

from pipeline.plugins.api import Table, Writer
from pipeline.plugins.registry import register_writer

_DOLLAR = re.compile(r"\$\{([^}]+)\}")
_BRACES = re.compile(r"\{([A-Za-z0-9_]+)\}")
def _expand(s: str, env): 
    s = _DOLLAR.sub(lambda m: str(env.get(m.group(1), "")), s)
    s = _BRACES.sub(lambda m: str(env.get(m.group(1), "")), s)
    return s

@register_writer
class HTMLTableWriter(Writer):
    """HTML table writer. Expands ${ENV}/{ENV} in 'dir', 'name', 'title'."""
    name = "html_table"

    def can_handle(self, target: Mapping[str, object]) -> bool:
        fmt = str(target.get("format") or "").lower()
        return fmt in {"html", "html_table"} or target.get("writer") == "html_table"

    def write(self, table: Table, target: Mapping[str, object], out_dir: Path) -> Path:
        env = {**os.environ, **(target.get("env") or {})}
        subdir = _expand(str(target.get("dir") or ""), env)
        base = _expand(str(target.get("name") or table.name or "table"), env)
        title = _expand(str(target.get("title") or base), env)

        root = out_dir / subdir if subdir else out_dir
        root.mkdir(parents=True, exist_ok=True)
        path = root / f"{base}.html"

        table_class = str(target.get("table_class") or "dataframe")
        thead_class = str(target.get("thead_class") or "")
        tbody_class = str(target.get("tbody_class") or "")
        standalone = bool(target.get("standalone", True))
        include_index = bool(target.get("include_index", False))
        pretty = bool(target.get("pretty", True))

        cols = table.df.columns
        nl = "\n" if pretty else ""
        ind = (lambda n: ("  " * n) if pretty else "")

        parts = []
        parts.append(f'<table class="{escape(table_class)}">')
        th_cls_attr = f' class="{escape(thead_class)}"' if thead_class else ""
        parts.append(f'{nl}{ind(1)}<thead{th_cls_attr}><tr>')
        if include_index:
            parts.append(f"{nl}{ind(2)}<th>index</th>")
        for c in cols:
            parts.append(f"{nl}{ind(2)}<th>{escape(str(c))}</th>")
        parts.append(f"{nl}{ind(1)}</tr></thead>")
        tb_cls_attr = f' class="{escape(tbody_class)}"' if tbody_class else ""
        parts.append(f"{nl}{ind(1)}<tbody{tb_cls_attr}>")
        for idx, rec in enumerate(table.df.iter_rows(named=True)):
            parts.append(f"{nl}{ind(2)}<tr>")
            if include_index:
                parts.append(f"{nl}{ind(3)}<td>{idx}</td>")
            for c in cols:
                v = rec.get(c)
                parts.append(f"{nl}{ind(3)}<td>{'' if v is None else escape(str(v))}</td>")
            parts.append(f"{nl}{ind(2)}</tr>")
        parts.append(f"{nl}{ind(1)}</tbody>")
        parts.append(f"{nl}</table>")
        table_html = "".join(parts)

        if standalone:
            doc = f"""<!doctype html>
                <html lang="en">
                <head>
                <meta charset="utf-8">{nl}
                <meta name="viewport" content="width=device-width, initial-scale=1">{nl}
                <title>{escape(title)}</title>{nl}
                <style>
                table.dataframe {{ border-collapse: collapse; width: 100%; }}
                table.dataframe th, table.dataframe td {{ border: 1px solid #ccc; padding: 6px 8px; text-align: left; }}
                table.dataframe thead th {{ background: #f8f8f8; }}
                </style>
                </head>
                <body>{nl}
                {table_html}{nl}
                </body>
                </html>
                """
            path.write_text(doc, encoding="utf-8")
        else:
            path.write_text(table_html, encoding="utf-8")
        return path
