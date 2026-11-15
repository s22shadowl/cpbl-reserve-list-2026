"""Decide each player's position group and whether they are exempt from the 60-man list."""

import json
import re
from pathlib import Path
from typing import Optional, Tuple

from .models import PersonInfo, RosterEntry

REASONS = ("foreign", "training", "fa", "expansion", "removed")
DOMESTIC = "中華民國"
_INFIELD = {"一壘手", "二壘手", "三壘手", "游擊手", "內野手"}
_ID = re.compile(r"^\d{10}$")


def position_group(pos: str) -> Tuple[str, Optional[str]]:
    """'投手' -> ('P', None); '捕手' -> ('C', '捕手'); '二壘手' -> ('I', '二壘手'); '左外野手' -> ('O', '左外野手')."""
    if pos == "投手":
        return "P", None
    if pos == "捕手":
        return "C", pos
    if pos in _INFIELD:
        return "I", pos
    if "外野" in pos:
        return "O", pos
    raise ValueError(f"未知守位：{pos}")


def load_overrides(path: Path) -> dict:
    """Read and validate overrides.json: {"include": [id...], "exclude": {id: {"reason", "name", "note"}}}."""
    data = json.loads(path.read_text(encoding="utf-8"))
    include = data.get("include", [])
    exclude = data.get("exclude", {})
    for pid in [*include, *exclude]:
        if not _ID.match(pid):
            raise ValueError(f"overrides 球員 ID 格式錯誤：{pid}")
    for pid, rule in exclude.items():
        if rule.get("reason") not in REASONS:
            raise ValueError(f"overrides {pid} 的 reason 必須是 {REASONS} 之一")
    overlap = set(include) & set(exclude)
    if overlap:
        raise ValueError(f"overrides 同時 include 與 exclude：{sorted(overlap)}")
    return {"include": frozenset(include), "exclude": exclude}


def exempt_reason(entry: RosterEntry, person: PersonInfo, overrides: dict) -> Optional[str]:
    """None when the player must be chosen from; otherwise one of REASONS.

    Priority: manual include > manual exclude > non-domestic nationality > ◎ mark.
    """
    if entry.id in overrides["include"]:
        return None
    if entry.id in overrides["exclude"]:
        return overrides["exclude"][entry.id]["reason"]
    if person.nationality and person.nationality != DOMESTIC:
        return "foreign"
    if entry.mark == "◎":
        return "training"
    return None
