from __future__ import annotations
import os, re, json
from pathlib import Path
from typing import Mapping, Any
from datetime import date, datetime
from pipeline.plugins.api import Table, Writer
from pipeline.plugins.registry import register_writer

_DOLLAR = re.compile(r"\$\{([^}]+)\}")
_BRACES = re.compile(r"\{([A-Za-z0-9_]+)\}")

def _expand(s: str, env):
    s = _DOLLAR.sub(lambda m: str(env.get(m.group(1), "")), s)
    s = _BRACES.sub(lambda m: str(env.get(m.group(1), "")), s)
    return s

def _serialize_value(value: Any) -> Any:
    """Convert non-JSON-serializable types to JSON-compatible formats."""
    if isinstance(value, (date, datetime)):
        return value.isoformat()
    return value

@register_writer
class JSONWriter(Writer):
    """JSON writer. Expands ${ENV}/{ENV} in 'dir' and 'name'."""
    name = "json"

    def can_handle(self, target: Mapping[str, object]) -> bool:
        fmt = str(target.get("format") or "").lower()
        return fmt == "json" or target.get("writer") == "json"

    def write(self, table: Table, target: Mapping[str, object], out_dir: Path) -> Path:
        env = {**os.environ, **(target.get("env") or {})}
        subdir = _expand(str(target.get("dir") or ""), env)
        base = _expand(str(target.get("name") or table.name or "table"), env)

        root = out_dir / subdir if subdir else out_dir
        root.mkdir(parents=True, exist_ok=True)
        path = root / f"{base}.json"

        orient = str(target.get("orient") or "records")
        indent = target.get("indent", 2)
        ensure_ascii = bool(target.get("ensure_ascii", False))

        if orient == "columns":
            payload = {c: table.df[c].to_list() for c in table.df.columns}
            # Serialize values in each column
            payload = {k: [_serialize_value(v) for v in vals] for k, vals in payload.items()}
        else:
            # Convert rows to dicts and serialize values
            payload = [
                {k: _serialize_value(v) for k, v in rec.items()}
                for rec in table.df.iter_rows(named=True)
            ]

        path.write_text(json.dumps(payload, ensure_ascii=ensure_ascii, indent=indent), encoding="utf-8")
        return path
