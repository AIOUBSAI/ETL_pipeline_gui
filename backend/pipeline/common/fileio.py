from __future__ import annotations
from pathlib import Path
from typing import Iterable, Mapping, Optional, List

_GLOB_META = set("*?[]")

def _split_patterns(files: Optional[object]) -> List[str]:
    if files is None:
        return []
    if isinstance(files, list):
        return [str(p).strip() for p in files if str(p).strip()]
    s = str(files)
    # strip BOM and outer quotes
    s = s.replace("\ufeff", "").strip().strip('"').strip("'")
    if not s:
        return []
    parts: List[str] = []
    for chunk in s.replace("\r\n", "\n").replace("\r", "\n").replace("\n", ";").replace(",", ";").split(";"):
        c = chunk.replace("\ufeff", "").strip().strip('"').strip("'")
        if c:
            parts.append(c)
    return parts

def _has_glob_meta(s: str) -> bool:
    return any(ch in s for ch in _GLOB_META)

def _normalize_name(s: str) -> str:
    # normalize suspicious whitespace and BOMs
    return (
        s.replace("\ufeff", "")
         .replace("\u00A0", " ")   # NBSP → space
         .strip()
         .strip('"')
         .strip("'")
    )

def iter_source_files(
    base_dir: Path,
    source: Mapping[str, object],
    default_glob: str = "*",
) -> Iterable[Path]:
    """
    Yields file paths for a source:
      - path (str): base directory or single file
      - files (str|list): glob pattern(s) or literal filenames
      - recursive (bool): recurse into subdirs when using patterns

    Rules:
      - Absolute paths in 'files' → yield directly if exist.
      - Literal filenames (no wildcards) → join with 'path'. If not found, try a
        case-insensitive/normalized match inside the directory.
      - Glob patterns → use glob/rglob.
      - No 'files':
          * if 'path' is a file → yield it
          * else treat 'path' as dir and use default_glob
    """
    raw_path = str(source.get("path") or ".")
    recursive = bool(source.get("recursive", False))
    patterns = _split_patterns(source.get("files"))

    base = (base_dir / raw_path).resolve()

    # Case 1: explicit files/patterns
    if patterns:
        for pat in patterns:
            pat = _normalize_name(pat)
            p = Path(pat)

            # A) absolute path
            if p.is_absolute():
                if p.is_file():
                    yield p
                continue

            # B) literal filename (no glob metachar)
            if not _has_glob_meta(pat):
                cand = (base / pat).resolve()
                if cand.is_file():
                    yield cand
                    continue

                # Fallback: try case-insensitive / normalized scan of the directory
                if base.is_dir():
                    try:
                        want = _normalize_name(pat).casefold()
                        for child in base.iterdir():
                            if not child.is_file():
                                continue
                            name_norm = _normalize_name(child.name).casefold()
                            if name_norm == want:
                                yield child.resolve()
                                break  # found the match
                    except FileNotFoundError:
                        pass
                continue

            # C) glob pattern under base
            globber = base.rglob if recursive else base.glob
            for m in globber(pat):
                if m.is_file():
                    yield m
        return

    # Case 2: no 'files' key
    if base.is_file():
        yield base
        return

    globber = base.rglob if recursive else base.glob
    for m in globber(default_glob):
        if m.is_file():
            yield m
