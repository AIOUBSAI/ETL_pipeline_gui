from __future__ import annotations
import os, re
from pathlib import Path
from typing import Mapping
import xml.etree.ElementTree as ET

from pipeline.plugins.api import Table, Writer
from pipeline.plugins.registry import register_writer

_DOLLAR = re.compile(r"\$\{([^}]+)\}")
_BRACES = re.compile(r"\{([A-Za-z0-9_]+)\}")
def _expand(s: str, env):
    s = _DOLLAR.sub(lambda m: str(env.get(m.group(1), "")), s)
    s = _BRACES.sub(lambda m: str(env.get(m.group(1), "")), s)
    return s

def _indent_xml(elem: ET.Element, level: int = 0) -> None:
    i = "\n" + level * "  "
    if len(elem):
        if not elem.text or not elem.text.strip():
            elem.text = i + "  "
        for e in list(elem):
            _indent_xml(e, level + 1)
            if not e.tail or not e.tail.strip():
                e.tail = i + "  "
        if not elem.tail or not elem.tail.strip():
            elem.tail = i
    else:
        if level and (not elem.tail or not elem.tail.strip()):
            elem.tail = i

@register_writer
class XMLWriter(Writer):
    """XML writer. Expands ${ENV}/{ENV} in 'dir', 'name', 'root', 'row'."""
    name = "xml"

    def can_handle(self, target: Mapping[str, object]) -> bool:
        fmt = str(target.get("format") or "").lower()
        return fmt == "xml" or target.get("writer") == "xml"

    def write(self, table: Table, target: Mapping[str, object], out_dir: Path) -> Path:
        env = {**os.environ, **(target.get("env") or {}), "table_name": table.name}
        subdir = _expand(str(target.get("dir") or ""), env)
        base = _expand(str(target.get("name") or table.name or "table"), env)
        root_name = _expand(str(target.get("root") or "root"), env)
        row_name  = _expand(str(target.get("row") or "row"), env)
        as_attr   = bool(target.get("as_attr", False))

        root_dir = out_dir / subdir if subdir else out_dir
        root_dir.mkdir(parents=True, exist_ok=True)
        path = root_dir / f"{base}.xml"

        root_el = ET.Element(root_name)
        cols = table.df.columns
        for rec in table.df.iter_rows(named=True):
            r_el = ET.SubElement(root_el, row_name)
            if as_attr:
                for k in cols:
                    v = rec.get(k)
                    if v is not None:
                        r_el.set(k, str(v))
            else:
                for k in cols:
                    v = rec.get(k)
                    c_el = ET.SubElement(r_el, k)
                    if v is not None:
                        c_el.text = str(v)

        _indent_xml(root_el)
        xml_text = ET.tostring(root_el, encoding="utf-8", xml_declaration=True).decode("utf-8")
        path.write_text(xml_text, encoding="utf-8")
        return path
