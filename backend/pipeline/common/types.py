from __future__ import annotations
from typing import TypedDict, List, Dict, Any

class ColumnAliasRegex(TypedDict):
    regex: str

ColumnAlias = str | ColumnAliasRegex

class ColumnSpec(TypedDict, total=False):
    alias: ColumnAlias | List[ColumnAlias]
    rename: str
    as_: str  # using "as_" in typing to avoid keyword conflict (mapped from "as" in YAML)
    required: bool
    optional: bool
    __aliases_resolved__: List[ColumnAlias | ColumnAliasRegex]

class SheetSpec(TypedDict, total=False):
    name: str
    match_by: str
    include_extra: bool
    preprocess: Dict[str, Any]
    columns: List[ColumnSpec]

class SourceSpec(TypedDict, total=False):
    type: str
    name: str
    path: str
    files: str
    sheets: List[SheetSpec]

class SchemaSpec(TypedDict, total=False):
    global_variables: List[str]
    schema: List[SourceSpec]
