from __future__ import annotations
from pathlib import Path
from typing import Any, Iterable, Mapping, Optional, List
import json
import polars as pl

from pipeline.plugins.api import Table, Reader
from pipeline.plugins.registry import register_reader
from pipeline.common.fileio import iter_source_files


def _dig(obj: Any, dotpath: Optional[str]) -> Any:
    if not dotpath:
        return obj
    cur = obj
    for key in dotpath.split("."):
        if isinstance(cur, dict):
            cur = cur.get(key)
        else:
            return None
    return cur


@register_reader
class JSONReader(Reader):
    """
    Reader for JSON files.

    Options:
      - path/files/recursive
      - json_path (str): dot path to select nested list/dict (e.g., "data.items")
    """
    name = "json"

    def can_handle(self, source: Mapping[str, object]) -> bool:
        t = str(source.get("type") or "").lower()
        if t == "json":
            return True
        files = str(source.get("files") or "")
        path = str(source.get("path") or "")
        return path.lower().endswith(".json") or files.lower().endswith(".json")

    def read(self, source: Mapping[str, object], base_dir: Path) -> Iterable[Table]:
        json_path = source.get("json_path")
        for fp in iter_source_files(base_dir, source, default_glob="*.json"):
            if not fp.exists() or not fp.is_file():
                continue
            data = json.loads(fp.read_text(encoding="utf-8"))
            target = _dig(data, json_path if isinstance(json_path, str) else None)

            if target is None:
                df = pl.DataFrame({})
            elif isinstance(target, list):
                if target and isinstance(target[0], dict):
                    df = pl.from_dicts(target)
                else:
                    df = pl.DataFrame({"value": target})
            elif isinstance(target, dict):
                df = pl.from_dicts([target])
            else:
                df = pl.DataFrame({"value": [target]})

            yield Table(name=str(source.get("name") or fp.stem), df=df, meta={"file": str(fp), "json_path": json_path})
