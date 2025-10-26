from __future__ import annotations
import os, re
from pathlib import Path
from typing import Mapping, Any
from pipeline.plugins.api import Table, Writer
from pipeline.plugins.registry import register_writer

try:
    import yaml
except Exception:
    yaml = None

_DOLLAR = re.compile(r"\$\{([^}]+)\}")
_BRACES = re.compile(r"\{([A-Za-z0-9_]+)\}")
def _expand(s: str, env): 
    s = _DOLLAR.sub(lambda m: str(env.get(m.group(1), "")), s)
    s = _BRACES.sub(lambda m: str(env.get(m.group(1), "")), s)
    return s

@register_writer
class YAMLWriter(Writer):
    """YAML writer. Expands ${ENV}/{ENV} in 'dir' and 'name'."""
    name = "yaml"

    def can_handle(self, target: Mapping[str, object]) -> bool:
        fmt = str(target.get("format") or "").lower()
        return fmt in {"yaml", "yml"} or target.get("writer") in {"yaml", "yml"}

    def write(self, table: Table, target: Mapping[str, object], out_dir: Path) -> Path:
        if yaml is None:
            raise ImportError("PyYAML required for YAMLWriter.")

        env = {**os.environ, **(target.get("env") or {})}
        subdir = _expand(str(target.get("dir") or ""), env)
        base = _expand(str(target.get("name") or table.name or "table"), env)
        ext = str(target.get("ext") or "yaml").lstrip(".")

        root = out_dir / subdir if subdir else out_dir
        root.mkdir(parents=True, exist_ok=True)
        path = root / f"{base}.{ext}"

        orient = str(target.get("orient") or "records").lower()
        sort_keys = bool(target.get("sort_keys", False))
        allow_unicode = bool(target.get("allow_unicode", True))
        indent = int(target.get("indent", 2))
        wrap = target.get("wrap")

        if orient == "columns":
            payload: Any = {c: table.df[c].to_list() for c in table.df.columns}
        else:
            payload = [rec for rec in table.df.iter_rows(named=True)]

        if isinstance(wrap, str) and wrap:
            payload = {wrap: payload}

        text = yaml.safe_dump(payload, sort_keys=sort_keys, allow_unicode=allow_unicode,
                              indent=indent, default_flow_style=False)
        path.write_text(text, encoding="utf-8")
        return path
