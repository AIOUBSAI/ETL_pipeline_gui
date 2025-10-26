from __future__ import annotations
import os
import re
from pathlib import Path
from typing import Any, Dict, Iterable, List, Mapping, Optional
import xml.etree.ElementTree as ET
import duckdb  # required for ctx["duckdb"]

from pipeline.plugins.api import Table, MultiWriter
from pipeline.plugins.registry import register_multi_writer

# ------------------------- placeholder expansion ------------------------------

_DOLLAR = re.compile(r"\$\{([^}]+)\}")     # ${VAR}
_BRACES = re.compile(r"\{([A-Za-z0-9_]+)\}")  # {VAR}


def _expand(s: Optional[str], env: Mapping[str, Any]) -> Optional[str]:
    if s is None:
        return None
    s = str(s)
    s = _DOLLAR.sub(lambda m: str(env.get(m.group(1), "")), s)
    s = _BRACES.sub(lambda m: str(env.get(m.group(1), "")), s)
    return s


# ----------------------------- template helpers -------------------------------

# ${...} evaluator inside template attrs/text with limited scope
_SAFE_EVAL_BUILTINS = {"str": str, "int": int, "float": float, "len": len, "max": max, "min": min}
_DOLLEXPR = re.compile(r"\$\{([^}]+)\}")


def _interpolate(val: Optional[str], scope: Mapping[str, Any]) -> Optional[str]:
    """
    Interpolate ${...} expressions in strings using a small, bounded scope.
    Available names inside expressions:
      - row: current row dict (if inside forEach)
      - env: parameter dict built from OS env + target['env']
    """
    if val is None:
        return None
    s = str(val)

    def repl(m: re.Match[str]) -> str:
        expr = m.group(1).strip()
        try:
            env = {"__builtins__": _SAFE_EVAL_BUILTINS}
            return str(eval(expr, env, {"row": scope.get("row"), "env": scope.get("env")}))  # noqa: S307
        except Exception:
            # dotted-path fallback: row.a.b or env.KEY
            parts = expr.split(".")
            root = parts[0]
            rest = parts[1:]
            if root not in ("row", "env"):
                return ""
            cur: Any = scope.get(root)
            for p in rest:
                if cur is None:
                    return ""
                if isinstance(cur, Mapping):
                    cur = cur.get(p)
                else:
                    cur = getattr(cur, p, None)
            return "" if cur is None else str(cur)

    return _DOLLEXPR.sub(repl, s)


def _truthy(expr: Optional[str], scope: Mapping[str, Any]) -> bool:
    """Evaluate a simple boolean expression or dotted path against scope."""
    if not expr:
        return True
    try:
        env = {"__builtins__": {"len": len, "any": any, "all": all}}
        return bool(eval(expr, env, {"row": scope.get("row"), "env": scope.get("env")}))  # noqa: S307
    except Exception:
        p = str(expr).strip()
        cur: Any = {"row": scope.get("row"), "env": scope.get("env")}
        for k in p.split("."):
            if isinstance(cur, Mapping):
                cur = cur.get(k)
            else:
                cur = getattr(cur, k, None)
        return bool(cur)


def _attrs_filter(d: Mapping[str, Any]) -> Dict[str, str]:
    """Drop empty/sentinel values from attribute dict."""
    return {k: str(v) for k, v in d.items() if v not in (None, "", "__EMPTY__")}


def _row_to_dict(row: Mapping[str, Any] | Any) -> Dict[str, Any]:
    """Ensure row is a plain dict."""
    if isinstance(row, Mapping):
        return dict(row)
    return row.__dict__


def _render_node(el_parent: ET.Element, spec: Mapping[str, Any], scope: Mapping[str, Any]) -> None:
    """Recursively render a node spec into the XML tree."""
    # forEach (iterate a named dataset)
    if "forEach" in spec and spec["forEach"]:
        fe = spec["forEach"]
        ds_name = fe.get("dataset")
        rows = scope["datasets"].get(ds_name, [])
        for r in rows:
            row_scope = dict(scope)
            row_scope["row"] = _row_to_dict(r)
            _render_node(el_parent, {k: v for k, v in spec.items() if k != "forEach"}, row_scope)
        return

    # conditional
    if not _truthy(spec.get("if"), scope):
        return

    name = spec.get("name") or spec.get("element")
    if not name:
        return

    # attributes
    raw_attrs = {k: _interpolate(v, scope) for k, v in (spec.get("attrs") or {}).items()}
    if spec.get("pruneEmptyAttrs"):
        attrs = _attrs_filter(raw_attrs)
    else:
        attrs = {k: ("" if v is None else str(v)) for k, v in raw_attrs.items()}

    el = ET.SubElement(el_parent, name, attrs)

    # text
    if "text" in spec and spec["text"] is not None:
        el.text = _interpolate(spec["text"], scope)

    # children
    for child in (spec.get("children") or []):
        _render_node(el, child, scope)


def _indent(elem: ET.Element, level: int = 0) -> None:
    """Pretty-print the XML tree in-place."""
    i = "\n" + level * "  "
    if len(elem):
        if not elem.text or not elem.text.strip():
            elem.text = i + "  "
        for e in list(elem):
            _indent(e, level + 1)
            if not e.tail or not e.tail.strip():
                e.tail = i + "  "
        if not elem.tail or not elem.tail.strip():
            elem.tail = i
    else:
        if level and (not elem.tail or not elem.tail.strip()):
            elem.tail = i


# ---------------------------------- writer ------------------------------------

@register_multi_writer
class XMLTemplateWriter(MultiWriter):
    """
    Multi-writer that renders XML from a template spec by querying a DB connection.

    Target options (mapping):
      - writer: "xml_template"
      - name (str): base filename (without extension). Defaults to "output".
      - dir  (str): optional subdirectory under out_dir.
      - template (dict): the template spec:
          queries: [ { key: str, sql: str }, ... ]
          root:
            name: str
            attrs: { ... interpolated via ${...} ... }
            children: [ node, node, ... ]
        Node fields:
          - name/element, attrs, text, children
          - if: boolean expression (uses row/env)
          - pruneEmptyAttrs: bool
          - forEach: { dataset: "<key>", as?: "row" }

      - env (dict): extra variables available to ${env.*} and path expansion.

    Context:
      - ctx["duckdb"]: a duckdb.DuckDBPyConnection (required)
    """

    name = "xml_template"

    def can_handle(self, target: Mapping[str, object]) -> bool:
        val = (target.get("writer") or target.get("format") or "").__str__().lower()
        return val == "xml_template"

    def write_all(
        self,
        tables: Iterable[Table],
        target: Mapping[str, object],
        out_dir: Path,
        ctx: Optional[Mapping[str, object]] = None,
    ) -> Path:
        # ---- DB connection from context
        if ctx is None or "duckdb" not in ctx:
            raise ValueError("XMLTemplateWriter requires ctx['duckdb'] DuckDB connection.")
        con: duckdb.DuckDBPyConnection = ctx["duckdb"]  # type: ignore[assignment]

        # ---- Template
        template = target.get("template")
        if not isinstance(template, Mapping):
            raise ValueError("xml_template target requires a 'template' mapping.")

        # ---- Env bag: OS env + target.env
        env: Dict[str, Any] = {**os.environ, **(target.get("env") or {})}

        # ---- Run queries -> datasets dict
        datasets: Dict[str, List[Dict[str, Any]]] = {}
        for q in (template.get("queries") or []):
            key = q["key"]
            sql = q["sql"]
            rel = con.execute(sql)
            rows = rel.fetchall()
            cols = [d[0] for d in rel.description]  # type: ignore[attr-defined]
            datasets[key] = [dict(zip(cols, r)) for r in rows]

        # ---- Build XML
        root_spec = template["root"]
        root_name = root_spec.get("name", "Root")
        # Top-level attributes can use ${env.*}
        root_attrs = {k: _interpolate(v, {"row": None, "env": env}) for k, v in (root_spec.get("attrs") or {}).items()}
        root_el = ET.Element(str(root_name), _attrs_filter(root_attrs))

        scope = {"row": None, "env": env, "datasets": datasets}
        for child in (root_spec.get("children") or []):
            _render_node(root_el, child, scope)

        # ---- Serialize (pretty)
        _indent(root_el)
        xml_text = ET.tostring(root_el, encoding="utf-8", xml_declaration=True).decode("utf-8")

        # ---- Output path (expand env in dir/name)
        subdir = _expand(str(target.get("dir") or ""), env) or ""
        base = _expand(str(target.get("name") or "output"), env) or "output"

        out_root = out_dir / subdir if subdir else out_dir
        out_root.mkdir(parents=True, exist_ok=True)
        out_path = out_root / f"{base}.xml"
        out_path.write_text(xml_text, encoding="utf-8")
        return out_path
