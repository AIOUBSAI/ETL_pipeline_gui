# pipeline/proc/_signals.py
from __future__ import annotations

class SkipTable(Exception):
    """Signal a processor decided to drop the current table (soft skip)."""
    pass
