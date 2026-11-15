"""Decide each player's position group and whether they are exempt from the 60-man list."""

import json
import re
from dataclasses import replace
from pathlib import Path
from typing import Optional, Tuple

from .models import PersonInfo, RosterEntry

REASONS = ("foreign", "training", "fa", "expansion", "removed")
DOMESTIC = "中華民國"
_INFIELD = {"一壘手", "二壘手", "三壘手", "游擊手", "內野手"}
TAG_MAX = 6
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
    """Read and validate overrides.json.

    {"include": [id...], "exclude": {id: {"reason", "name", "note"}}, "tags": {id: {"label", "name", "note"}},
     "rookie": {id: {"name", "note"}}, "draft": {id: {"name", "year", "round", "note"}}}
    Tags only label a player on the site (e.g. "FA"); they never change whether the player is selectable.
    rookie marks this season's 自培/練習生轉正 players; draft fills a missing draft year/round from the official site.
    """
    data = json.loads(path.read_text(encoding="utf-8"))
    include = data.get("include", [])
    exclude = data.get("exclude", {})
    tags = data.get("tags", {})
    rookie = data.get("rookie", {})
    draft = data.get("draft", {})
    for pid in [*include, *exclude, *tags, *rookie, *draft]:
        if not _ID.match(pid):
            raise ValueError(f"overrides 球員 ID 格式錯誤：{pid}")
    for pid, rule in exclude.items():
        if rule.get("reason") not in REASONS:
            raise ValueError(f"overrides {pid} 的 reason 必須是 {REASONS} 之一")
    overlap = set(include) & set(exclude)
    if overlap:
        raise ValueError(f"overrides 同時 include 與 exclude：{sorted(overlap)}")
    for pid, rule in tags.items():
        label = rule.get("label")
        if not isinstance(label, str) or not 0 < len(label) <= TAG_MAX:
            raise ValueError(f"overrides {pid} 的 label 必須是 1～{TAG_MAX} 字的字串")
    tagged_out = set(tags) & set(exclude)
    if tagged_out:
        raise ValueError(f"overrides 被排除的球員不能加標籤：{sorted(tagged_out)}")
    rookie_out = set(rookie) & set(exclude)
    if rookie_out:
        raise ValueError(f"overrides 被排除的球員不能標為新人：{sorted(rookie_out)}")
    for pid, rule in draft.items():
        year, rnd = rule.get("year"), rule.get("round")
        if not all(isinstance(v, int) and not isinstance(v, bool) and v > 0 for v in (year, rnd)):
            raise ValueError(f"overrides {pid} 的選秀 year、round 必須是正整數")
    return {"include": frozenset(include), "exclude": exclude, "tags": tags, "rookie": rookie, "draft": draft}


def apply_draft(person: PersonInfo, pid: str, overrides: dict) -> PersonInfo:
    """Override the draft year/round from overrides["draft"] (used when the official page is blank or wrong)."""
    rule = overrides.get("draft", {}).get(pid)
    if not rule:
        return person
    return replace(person, draft_year=rule["year"], draft_round=rule["round"])


def exempt_reason(entry: RosterEntry, person: PersonInfo, overrides: dict) -> Optional[str]:
    """None when the player must be chosen from; otherwise one of REASONS.

    Priority: manual include > manual exclude > foreign > ◎ mark.
    Foreign means a non-domestic nationality with no draft: a foreign national picked in the
    CPBL draft (e.g. a Japanese 本土選秀 pick) is a local player and must be chosen from.
    """
    if entry.id in overrides["include"]:
        return None
    if entry.id in overrides["exclude"]:
        return overrides["exclude"][entry.id]["reason"]
    if person.nationality and person.nationality != DOMESTIC and person.draft_year is None:
        return "foreign"
    if entry.mark == "◎":
        return "training"
    return None
