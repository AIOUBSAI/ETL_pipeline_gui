from __future__ import annotations
from dataclasses import dataclass
from typing import Any, Mapping, Optional, Protocol

import duckdb  # optional but we ship adapter
import sqlite3


class DBConn(Protocol):
    """Minimal DB protocol we need (duckdb and sqlite3 both satisfy)."""
    def execute(self, sql: str, parameters: Optional[tuple[Any, ...]] = None) -> Any: ...
    def close(self) -> None: ...


@dataclass
class DBConfig:
    """Generic DB config. driver: 'duckdb' | 'sqlite' (others can be added)."""
    driver: str
    path: str  # file path or ':memory:'


def open_connection(cfg: DBConfig | Mapping[str, Any]) -> DBConn:
    """Open a DB connection for the given config."""
    if not isinstance(cfg, DBConfig):
        cfg = DBConfig(**cfg)  # type: ignore[arg-type]
    drv = cfg.driver.lower()
    if drv == "duckdb":
        return duckdb.connect(cfg.path)
    if drv == "sqlite":
        return sqlite3.connect(cfg.path)
    raise ValueError(f"Unsupported driver: {cfg.driver}")


def apply_pragmas(conn: DBConn, driver: str, pragmas: Optional[Mapping[str, Any]] = None) -> None:
    """Apply driver-specific PRAGMAs if provided."""
    if not pragmas:
        return
    d = driver.lower()
    if d == "duckdb":
        for k, v in pragmas.items():
            if isinstance(v, bool):
                vs = "true" if v else "false"
            else:
                vs = str(v)
                if any(ch.isspace() for ch in vs) or not vs.replace("_", "").replace("-", "").isalnum():
                    vs = f"'{vs}'"
            conn.execute(f"PRAGMA {k}={vs};")
    elif d == "sqlite":
        for k, v in pragmas.items():
            conn.execute(f"PRAGMA {k}={v}")
    else:
        # Unknown driver: ignore pragmas
        pass
