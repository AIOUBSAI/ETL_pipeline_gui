from __future__ import annotations
from pathlib import Path
from typing import Any, Dict, Iterable, Mapping, Optional
import xml.etree.ElementTree as ET
import polars as pl

from pipeline.plugins.api import Table, Reader
from pipeline.plugins.registry import register_reader
from pipeline.common.fileio import iter_source_files
from pipeline.common.logger import get_logger

log = get_logger()


def _get_text(el: Optional[ET.Element]) -> str | None:
    if el is None:
        return None
    t = (el.text or "").strip()
    return t if t else None


def _eval_xpath(node: ET.Element, xpath: str, ns: Optional[Dict[str, str]]) -> str | None:
    xp = (xpath or "").strip()
    if not xp:
        return None
    if xp.startswith("@"):
        return node.get(xp[1:]) or None
    if xp.endswith("/text()"):
        sub = xp[:-8]
        el = node.find(sub, ns)
        return _get_text(el)
    el = node.find(xp, ns)
    return _get_text(el)


@register_reader
class XMLReader(Reader):
    """
    Reader for XML (and UCDEF) files.

    Config can be at top-level or nested under `xml:`:
      - row_xpath (str): element selector for rows
      - fields (mapping): { out_col: xpath }
      - namespaces (mapping): { prefix: uri }
    Supports path/files/recursive. Yields one table per file.
    """
    name = "xml"

    def can_handle(self, source: Mapping[str, Any]) -> bool:
        t = str(source.get("type") or "").lower()
        if t == "xml":
            return True
        files = str(source.get("files") or "")
        path = str(source.get("path") or "")
        return any(path.lower().endswith(ext) for ext in (".xml", ".ucdef")) or \
               any(files.lower().endswith(ext) for ext in (".xml", ".ucdef"))

    def read(self, source: Mapping[str, Any], base_dir: Path) -> Iterable[Table]:
        cfg = dict(source.get("xml") or {})
        row_xpath: str = str(cfg.get("row_xpath") or source.get("row_xpath") or "")
        fields: Mapping[str, str] = cfg.get("fields") or source.get("fields") or {}
        namespaces = cfg.get("namespaces") or source.get("namespaces") or None
        ns: Optional[Dict[str, str]] = None if namespaces is None else dict(namespaces)

        log.debug(f"XML reader scanning for files...")
        log.debug(f"Base dir: {base_dir}")
        log.debug(f"Source path: {source.get('path', 'N/A')}")
        log.debug(f"File pattern: {source.get('files', '*.xml')}")
        log.debug(f"Row XPath: {row_xpath}")
        log.debug(f"Fields to extract: {list(fields.keys())}")
        if ns:
            log.debug(f"Namespaces: {ns}")

        files_found = 0
        for fp in iter_source_files(base_dir, source, default_glob="*.xml"):
            if not fp.exists() or not fp.is_file():
                log.debug(f"Skipping (not a file): {fp}")
                continue

            files_found += 1
            log.dev(f"Found file: {fp}")

            try:
                tree = ET.parse(str(fp))
                root = tree.getroot()
                log.debug(f"Root element: {root.tag}")

                rows: list[Dict[str, Any]] = []
                for node in root.findall(row_xpath, ns):
                    rec: Dict[str, Any] = {}
                    for out_col, fx in fields.items():
                        rec[out_col] = _eval_xpath(node, fx, ns)
                    rows.append(rec)

                log.debug(f"Extracted {len(rows)} rows using XPath")

                df = pl.DataFrame({k: [] for k in fields.keys()}) if not rows else pl.DataFrame(rows)
                log.debug(f"Created DataFrame: {len(df)} rows, {len(df.columns)} columns")

                tname = str(source.get("name") or fp.stem)
                yield Table(name=tname, df=df, meta={"file": str(fp)})

            except Exception as e:
                log.error(f"Failed to parse XML file {fp}: {e}")
                raise

        if files_found == 0:
            log.dev(f"No XML files found matching criteria")
