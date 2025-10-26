from __future__ import annotations
from pathlib import Path

def nuke_duckdb(db_path: Path) -> None:
    """
    Remove a DuckDB file and common sidecars if they exist.
    Safe to call even if nothing is there.
    """
    try:
        db_path.parent.mkdir(parents=True, exist_ok=True)
    except Exception:
        pass

    # main file
    for p in [
        db_path,
        Path(str(db_path) + ".wal"),  # DuckDB WAL lives alongside the db
    ]:
        try:
            if p.exists():
                p.unlink()
        except Exception:
            # best-effort; ignore if another process holds a lock
            pass
