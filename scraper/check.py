"""Validate generated data before committing: python -m scraper.check"""

import json
import logging
import re
import sys
from pathlib import Path
from typing import List, Tuple

from .classify import REASONS
from .models import TEAM_CODES


LIMIT = 60
REPO = Path(__file__).resolve().parent.parent
_ID = re.compile(r"^\d{10}$")
STAT_LEVELS = frozenset({"A", "D"})

log = logging.getLogger(__name__)


def _valid_season(s) -> bool:
    """s is omitted when a player has no games, so a present s must be a non-empty {A/D: dict}."""
    return isinstance(s, dict) and bool(s) and set(s) <= STAT_LEVELS and all(isinstance(v, dict) for v in s.values())


def check(teams_json: dict, roster_json: dict, photo_ids: frozenset) -> Tuple[List[str], List[str]]:
    errors: List[str] = []
    warnings: List[str] = []
    teams = teams_json.get("teams", {})
    if not re.match(r"^\d{4}-\d{2}-\d{2}$", str(teams_json.get("updated", ""))):
        errors.append("updated 必須是 YYYY-MM-DD")
    for code in TEAM_CODES:
        if code not in teams:
            errors.append(f"{code}：teams.json 缺少此隊")
            continue
        players = teams[code].get("players", [])
        ids = [p["id"] for p in players]
        bad = [i for i in ids if not _ID.match(i)]
        if bad:
            errors.append(f"{code}：ID 格式錯誤 {bad}")
        if len(set(ids)) != len(ids):
            errors.append(f"{code}：球員 ID 重複")
        if len(ids) <= LIMIT:
            errors.append(f"{code}：可選球員只有 {len(ids)} 人，應多於 {LIMIT}")
        if sorted(ids) != sorted(roster_json.get(code, [])):
            errors.append(f"{code}：teams.json 與 roster.json 的球員不一致")
        if set(teams[code].get("exempt", {})) != set(REASONS):
            errors.append(f"{code}：exempt 欄位必須剛好是 {REASONS}")
        for p in players:
            if p.get("ph") and p["id"] not in photo_ids:
                errors.append(f"{code}：{p['n']} 標記有照片但檔案不存在")
            if "s" in p and not _valid_season(p["s"]):
                errors.append(f"{code}：{p['n']} 的成績欄位 s 格式錯誤")
            if not p.get("ph"):
                warnings.append(f"{code}：{p['n']} 沒有照片")
    extra = set(roster_json) - set(TEAM_CODES)
    if extra:
        errors.append(f"roster.json 有未知球隊 {sorted(extra)}")
    return errors, warnings


def main() -> int:
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    teams_json = json.loads((REPO / "docs/data/teams.json").read_text(encoding="utf-8"))
    roster_json = json.loads((REPO / "worker/src/roster.json").read_text(encoding="utf-8"))
    photo_ids = frozenset(p.stem for p in (REPO / "docs/photos").glob("*.jpg"))
    errors, warnings = check(teams_json, roster_json, photo_ids)
    for w in warnings:
        log.warning("警告：%s", w)
    for e in errors:
        log.error("錯誤：%s", e)
    counts = {c: len(t["players"]) for c, t in teams_json.get("teams", {}).items()}
    log.info("可選人數：%s；%d 個錯誤、%d 個警告", counts, len(errors), len(warnings))
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
