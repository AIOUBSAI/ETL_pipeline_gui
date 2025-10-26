from __future__ import annotations
from pathlib import Path
from typing import Any, Iterable, Mapping, Optional
import polars as pl

from pipeline.plugins.api import Table, Reader
from pipeline.plugins.registry import register_reader
from pipeline.common.fileio import iter_source_files

try:
    import yaml  # PyYAML
except Exception:
    yaml = None


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
class YAMLReader(Reader):
    """
    Reader for YAML files.

    Options:
      - path/files/recursive
      - json_path (str): dot path to a list/dict inside the YAML
    """
    name = "yaml"

    def can_handle(self, source: Mapping[str, object]) -> bool:
        t = str(source.get("type") or "").lower()
        if t in {"yaml", "yml"}:
            return True
        files = str(source.get("files") or "")
        path = str(source.get("path") or "")
        return path.lower().endswith((".yaml", ".yml")) or files.lower().endswith((".yaml", ".yml"))

    def read(self, source: Mapping[str, object], base_dir: Path) -> Iterable[Table]:
        if yaml is None:
            raise ImportError("YAMLReader requires PyYAML. `pip install pyyaml`")

        json_path = source.get("json_path")
        for fp in iter_source_files(base_dir, source, default_glob="*.yaml"):
            if not fp.exists() or not fp.is_file():
                continue
            data = yaml.safe_load(fp.read_text(encoding="utf-8"))
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
