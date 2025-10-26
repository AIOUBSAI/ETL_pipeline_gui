from __future__ import annotations
import os
import re
import json
import gzip
from pathlib import Path
from typing import Mapping, Iterable, Any

from pipeline.plugins.api import Table, Writer
from pipeline.plugins.registry import register_writer

# ${VAR} and {VAR} expansion
_DOLLAR = re.compile(r"\$\{([^}]+)\}")
_BRACES = re.compile(r"\{([A-Za-z0-9_]+)\}")


def _expand(s: str, env: Mapping[str, Any]) -> str:
    s = _DOLLAR.sub(lambda m: str(env.get(m.group(1), "")), s)
    s = _BRACES.sub(lambda m: str(env.get(m.group(1), "")), s)
    return s


@register_writer
class JSONLWriter(Writer):
    """
    Writer that outputs one JSON object per line (JSON Lines / NDJSON).

    Target options:
      - writer / format: "jsonl" or "ndjson"
      - name (str): base filename (default table.name)
      - dir  (str): output subdirectory (optional)
      - ext  (str): "jsonl" (default) or "ndjson"
      - gzip (bool): if true, write .gz compressed
      - ensure_ascii (bool): default False
    """
    name = "jsonl"

    def can_handle(self, target: Mapping[str, object]) -> bool:
        val = (target.get("writer") or target.get("format") or "").__str__().lower()
        return val in {"jsonl", "ndjson"}

    def write(self, table: Table, target: Mapping[str, object], out_dir: Path) -> Path:
        env = {**os.environ, **(target.get("env") or {}), "table_name": table.name}

        subdir = _expand(str(target.get("dir") or ""), env)
        base = _expand(str(target.get("name") or table.name or "table"), env)
        ext = (str(target.get("ext") or "jsonl")).lstrip(".").lower()
        use_gzip = bool(target.get("gzip", False))
        ensure_ascii = bool(target.get("ensure_ascii", False))

        root = out_dir / subdir if subdir else out_dir
        root.mkdir(parents=True, exist_ok=True)

        path = root / f"{base}.{ext}"
        if use_gzip and not str(path).endswith(".gz"):
            path = path.with_suffix(path.suffix + ".gz")

        # Write one JSON object per line
        if use_gzip:
            with gzip.open(path, "wt", encoding="utf-8") as f:
                for rec in table.df.iter_rows(named=True):
                    f.write(json.dumps(rec, ensure_ascii=ensure_ascii))
                    f.write("\n")
        else:
            with open(path, "w", encoding="utf-8") as f:
                for rec in table.df.iter_rows(named=True):
                    f.write(json.dumps(rec, ensure_ascii=ensure_ascii))
                    f.write("\n")

        return path
