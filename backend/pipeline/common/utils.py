from __future__ import annotations

import re
import time
from pathlib import Path
from typing import Any, Dict, Mapping, Optional

import yaml

__all__ = [
    "ts",
    "timestamp_file",
    "safe_mkdir",
    "clean_directory",
    "load_yaml",
    "normalize_path",
    "resolve_placeholders",
]

def ts() -> str:
    return time.strftime("%Y-%m-%d %H:%M:%S")

def timestamp_file() -> str:
    return time.strftime("%Y%m%d-%H%M%S")

def safe_mkdir(p: Path) -> None:
    p.mkdir(parents=True, exist_ok=True)

def load_yaml(fp: Path) -> Dict[str, Any]:
    return yaml.safe_load(fp.read_text(encoding="utf-8"))

def normalize_path(p: Path) -> Path:
    return Path(str(p)).expanduser().resolve()

def resolve_placeholders(s: Optional[str], variables: Mapping[str, str]) -> str:
    """Support {VAR}, ${VAR}, and $VAR placeholders."""
    if s is None:
        return ""
    def repl_curly(m):        return variables.get(m.group(1), m.group(0))
    def repl_dollar_brace(m): return variables.get(m.group(1), m.group(0))
    def repl_dollar(m):       return variables.get(m.group(1), m.group(0))
    s = re.sub(r"\{([A-Za-z0-9_]+)\}", repl_curly, s)
    s = re.sub(r"\$\{([A-Za-z0-9_]+)\}", repl_dollar_brace, s)
    s = re.sub(r"\$([A-Za-z0-9_]+)", repl_dollar, s)
    return s
def clean_directory(p: Path) -> int:
    """
    Delete all files and subdirectories inside `p` (but keep `p` itself).
    Returns number of items removed. Ignores missing dirs.
    """
    if not p.exists():
        return 0
    removed = 0
    for child in p.iterdir():
        try:
            if child.is_dir():
                # remove directory tree
                import shutil
                shutil.rmtree(child, ignore_errors=False)
            else:
                child.unlink()
            removed = 1
        except Exception as e:
            from pipeline.common.logger import get_logger
            log = get_logger()
            log.warning(f"Could not remove {child}: {e}")
    return removed