from __future__ import annotations
from typing import Any, Dict, List, Mapping, Sequence, Optional
import polars as pl

from pipeline.plugins.api import Processor
from pipeline.plugins.registry import register_processor
from ._signals import SkipTable
from pipeline.common.logger import get_logger

log = get_logger()


def _norm(s: str) -> str:
    return " ".join(str(s).strip().lower().split())


@register_processor
class RequireColumns(Processor):
    """
    Ensure a table has required columns (after optional aliasing). Optionally
    reduce the table to a selected set of columns.

    NEW SIMPLIFIED FORMAT:
      required: [col1, col2, ...]                         # Simple list of required columns
      required: {"source col": target, col: ~, ...}       # Dict with aliases (~ means keep as-is)
      optional: {"source col": target, ...}               # Optional columns (won't fail if missing)
      keep_extra: true | false                            # Keep columns not in required/optional (default: false)
      mode: "error" | "skip_table" | "empty"

    MULTIPLE SOURCES → SAME TARGET (pipe-separated):
      required:
        "network adress|network address": network_address
        "description|signal description": signal_description
      First matching source column wins, others are dropped to avoid duplicates.

    LEGACY FORMAT (still supported):
      alias_map: {source_col: target_col, ...}       # case/space-insensitive on source_col
      required: [colA, colB, ...]                    # columns that must exist AFTER aliasing
      include_only: true | [list] | false            # keep only these; if true -> required
      mode: "error" | "skip_table" | "empty"         # on missing required (default "error")
      normalize_source: bool                         # apply simple normalization (default True)
    """
    name = "require_columns"
    order = 30

    def applies_to(self, ctx: Mapping[str, Any]) -> bool:
        opts = ctx.get("processor_options") or {}
        return bool(opts.get("required") or opts.get("alias_map") or opts.get("include_only"))

    def process(self, df: pl.DataFrame, ctx: Mapping[str, Any]) -> pl.DataFrame:
        opts: Mapping[str, Any] = ctx.get("processor_options") or {}

        # NEW SIMPLIFIED FORMAT SUPPORT
        # Format 1: required: [col1, col2, ...]  (simple list)
        # Format 2: required: {source: target, col: ~, ...}  (dict with aliases)
        # Legacy: alias_map + required + include_only (still supported)

        required_opt = opts.get("required")
        optional_opt = opts.get("optional")

        # Parse new format if used
        if required_opt and isinstance(required_opt, dict):
            # New dict format: {source: target or ~}
            # Support pipe-separated sources: "col1|col2|col3": target
            alias_map_raw = {}
            multi_source_groups = {}  # target -> list of possible sources

            for k, v in required_opt.items():
                target = v if v not in (None, "~") else k

                # Support pipe-separated alternative column names
                if isinstance(k, str) and "|" in k:
                    sources = [s.strip() for s in k.split("|")]
                    multi_source_groups[target] = sources
                else:
                    sources = [k]

                for src in sources:
                    alias_map_raw[src] = target

            required = list(set(alias_map_raw.values()))  # unique target names
            include_only_opt = True  # dict format implies include_only
        elif required_opt and isinstance(required_opt, list):
            # New list format: [col1, col2, ...]
            alias_map_raw = {}
            required = list(required_opt)
            include_only_opt = opts.get("include_only", True)  # default to True for new format
        else:
            # Legacy format
            alias_map_raw = dict(opts.get("alias_map") or {})
            required = list(opts.get("required") or [])
            include_only_opt = opts.get("include_only", False)

        # Add optional columns (only for new format)
        if optional_opt and isinstance(optional_opt, dict):
            for k, v in optional_opt.items():
                target = v if v not in (None, "~") else k

                # Support pipe-separated for optional too
                if isinstance(k, str) and "|" in k:
                    sources = [s.strip() for s in k.split("|")]
                else:
                    sources = [k]

                for src in sources:
                    alias_map_raw[src] = target

        mode: str = str(opts.get("mode") or "error").lower()
        normalize_source: bool = bool(opts.get("normalize_source", True))
        keep_extra: bool = bool(opts.get("keep_extra", False))

        # 1) apply alias_map (case/space-insensitive keys if normalize_source=True)
        if alias_map_raw:
            log.debug(f"[require_columns] Input columns: {list(df.columns)}")
            log.debug(f"[require_columns] Alias map raw: {alias_map_raw}")

            if normalize_source:
                # build map: normalized_source -> target
                nmap = {_norm(k): v for k, v in alias_map_raw.items()}
                log.debug(f"[require_columns] Normalized alias map: {nmap}")

                renames: Dict[str, str] = {}
                seen_targets: Dict[str, str] = {}  # target -> source (first match wins)
                cols_to_drop: List[str] = []  # columns that map to already-used targets

                for c in df.columns:
                    key = _norm(c)
                    log.debug(f"[require_columns] Column '{c}' normalized to '{key}'")
                    if key in nmap:
                        target = nmap[key]
                        # Check if this target already mapped from another source
                        if target in seen_targets:
                            log.debug(f"[require_columns]   -> Target '{target}' already mapped from '{seen_targets[target]}', will drop '{c}'")
                            cols_to_drop.append(c)
                        else:
                            renames[c] = target
                            seen_targets[target] = c
                            log.debug(f"[require_columns]   -> Will rename to '{target}'")
                    else:
                        log.debug(f"[require_columns]   -> No match in alias_map")

                if renames:
                    log.debug(f"[require_columns] Applying renames: {renames}")
                    df = df.rename(renames)
                    log.debug(f"[require_columns] Columns after rename: {list(df.columns)}")

                if cols_to_drop:
                    log.debug(f"[require_columns] Dropping duplicate source columns: {cols_to_drop}")
                    df = df.drop(cols_to_drop)
                else:
                    log.debug(f"[require_columns] No columns matched for renaming!")
            else:
                present = set(df.columns)
                renames = {}
                seen_targets: Dict[str, str] = {}
                cols_to_drop: List[str] = []

                for k, v in alias_map_raw.items():
                    if k in present:
                        if v in seen_targets:
                            log.debug(f"[require_columns] Target '{v}' already mapped from '{seen_targets[v]}', will drop '{k}'")
                            cols_to_drop.append(k)
                        else:
                            renames[k] = v
                            seen_targets[v] = k

                if renames:
                    df = df.rename(renames)

                if cols_to_drop:
                    df = df.drop(cols_to_drop)

        # 2) check required
        # For multi-source columns, check if at least ONE source was found
        missing = []
        for c in required:
            if c not in df.columns:
                # Check if this was a multi-source target
                if 'multi_source_groups' in locals() and c in multi_source_groups:
                    # At least one of the sources should have been renamed to target
                    # If target not in columns, none of the sources existed
                    missing.append(f"{c} (tried: {', '.join(multi_source_groups[c])})")
                else:
                    missing.append(c)

        if missing:
            if mode == "skip_table":
                raise SkipTable(f"require_columns: missing {missing}")
            if mode == "empty":
                # return empty frame with required (and any additional include_only cols)
                cols_for_empty: List[str]
                if include_only_opt is True or include_only_opt is False or include_only_opt is None:
                    cols_for_empty = list(required)
                elif isinstance(include_only_opt, (list, tuple)):
                    cols_for_empty = list(include_only_opt)
                else:
                    cols_for_empty = list(required)
                return pl.DataFrame({c: pl.Series([], dtype=pl.Utf8) for c in cols_for_empty})
            # default: error
            raise KeyError(f"[require_columns] required columns missing: {missing}")

        # 3) include_only selection
        if include_only_opt is True:
            # Only keep required columns (unless keep_extra is True)
            if keep_extra:
                keep = None  # Keep everything
            else:
                keep = required
        elif isinstance(include_only_opt, (list, tuple)):
            # Keep specified columns
            if keep_extra:
                # Keep specified + any extra columns
                keep = None
            else:
                keep = [c for c in include_only_opt if c in df.columns]
        else:
            keep = None

        if keep:
            df = df.select([pl.col(c) for c in keep])

        # Handle duplicate column names (Polars doesn't allow them, so this shouldn't happen)
        # But if source data has dupes, readers should handle with suffix like .1, .2
        # This processor just works with whatever column names exist

        return df
