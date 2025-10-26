from __future__ import annotations

import re
from typing import Any, Dict, List, Mapping, Optional, Set, Tuple

from pipeline.common.utils import resolve_placeholders

__all__ = [
    "resolve_alias_entry",
    "norm_header",
    "make_unique_headers",
    "match_alias",
    "has_all_required_columns_norm",
    "build_alias_map_norm",
]

def resolve_alias_entry(alias_entry: Any, variables: Mapping[str, str]) -> Any:
    """Resolve placeholders in alias entries using ENV ONLY."""
    if isinstance(alias_entry, dict) and "regex" in alias_entry:
        pat = resolve_placeholders(alias_entry["regex"], variables)
        return {"regex": re.compile(pat, re.IGNORECASE)}
    elif isinstance(alias_entry, str):
        return resolve_placeholders(alias_entry, variables)
    else:
        return alias_entry

def norm_header(s: str) -> str:
    s = str(s or "").strip()
    s = re.sub(r"\s+", " ", s).rstrip(".")
    return s.lower()

def make_unique_headers(headers: List[str]) -> List[str]:
    seen: Dict[str, int] = {}
    out: List[str] = []
    for h in headers:
        k = norm_header(h)
        cnt = seen.get(k, 0)
        out.append(h if cnt == 0 else f"{h}_{cnt}")
        seen[k] = cnt + 1
    return out

def match_alias(header_set_norm: Set[str], alias_entry: Any) -> Tuple[bool, Optional[str]]:
    if isinstance(alias_entry, dict) and "regex" in alias_entry and hasattr(alias_entry["regex"], "fullmatch"):
        pat = alias_entry["regex"]
        for h in header_set_norm:
            if pat.fullmatch(h):
                return True, h
        return False, None
    # ensure string input for norm_header
    a = norm_header(str(alias_entry))
    return (a in header_set_norm, a if a in header_set_norm else None)

def has_all_required_columns_norm(header_set_norm: Set[str], column_spec: List[Dict[str, Any]]) -> Tuple[bool, List[Any]]:
    missing: List[Any] = []
    for col in column_spec:
        aliases = col.get("__aliases_resolved__") or col.get("alias")
        if not isinstance(aliases, list):
            aliases = [aliases]
        is_required = bool(col.get("required")) or (col.get("optional") is False)
        ok = False
        for a in aliases:
            matched, _ = match_alias(header_set_norm, a)
            if matched:
                ok = True
                break
        if not ok and is_required:
            missing.append(aliases)
    return (len(missing) == 0, missing)

def build_alias_map_norm(
    header_list: List[str],
    header_set_norm: Set[str],
    norm_to_actual: Dict[str, str],
    column_spec: List[Dict[str, Any]]
) -> Dict[str, Tuple[str, Optional[str]]]:
    """
    Returns: canonical_key -> (output_name, actual_header_or_None)
    """
    amap: Dict[str, Tuple[str, Optional[str]]] = {}
    for col in column_spec:
        aliases = col.get("__aliases_resolved__") or col.get("alias")
        if not isinstance(aliases, list):
            aliases = [aliases]
        # Output name: rename > as > first alias
        if col.get("rename"):
            output_name = str(col["rename"])
        elif col.get("as"):
            output_name = str(col["as"])
        else:
            first = aliases[0]
            if isinstance(first, dict) and "regex" in first:
                output_name = first["regex"].pattern
            else:
                output_name = str(first)
        canonical = norm_header(output_name)

        found_actual: Optional[str] = None
        for a in aliases:
            matched, matched_norm = match_alias(header_set_norm, a)
            if matched:
                if matched_norm is not None:
                    found_actual = norm_to_actual[matched_norm]
                break
        amap[canonical] = (output_name, found_actual)
    return amap
