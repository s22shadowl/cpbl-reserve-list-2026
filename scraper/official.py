"""Official reserve list data: python -m scraper.official [--sample]

Without flags: scraper/official/2027.json (hand-curated from the league announcement, if present)
-> docs/data/official.json. With --sample: docs/data/official.sample.json, a plausible fake list for
development, picked from docs/data/teams.json with a fixed seed.
"""

import argparse
import json
import logging
import random
import re
import sys
from pathlib import Path
from typing import Dict, List, Optional

from scraper.models import TEAM_CODES

LIMIT = 60
SEASON = 2027
SEED = 2027
REPO = Path(__file__).resolve().parent.parent
log = logging.getLogger(__name__)

# Sampling weights: clubs keep first-team regulars and fresh draftees far more often than depth players.
W_CORE, W_FIRST, W_ROOKIE, W_REST = 8.0, 4.0, 4.0, 1.0
CORE_OUTS, CORE_PA = 120, 250  # same thresholds as docs/stats.js statTier()


def _outs(ip) -> int:
    whole, _, frac = str(ip or "").partition(".")
    return (int(whole) if whole.isdigit() else 0) * 3 + (int(frac) if frac.isdigit() else 0)


def _is_core(p: dict) -> bool:
    a = (p.get("s") or {}).get("A")
    if not a:
        return False
    return _outs(a.get("ip")) >= CORE_OUTS if p.get("g") == "P" else (a.get("pa") or 0) >= CORE_PA


def _weight(p: dict) -> float:
    if _is_core(p):
        return W_CORE
    if p.get("l") == "一軍":
        return W_FIRST
    return W_ROOKIE if p.get("rk") else W_REST


def sample_official(teams_json: dict, seed: int = SEED, per_team: int = LIMIT) -> dict:
    """Weighted sampling without replacement (Efraimidis-Spirakis), deterministic per seed and team."""
    out: Dict[str, List[str]] = {}
    for code, team in teams_json["teams"].items():
        players = team["players"]
        rng = random.Random(f"{seed}:{code}")
        keyed = sorted(((rng.random() ** (1 / _weight(p)), p["id"]) for p in players), reverse=True)
        out[code] = sorted(pid for _, pid in keyed[:per_team])
    return {"season": SEASON, "updated": teams_json["updated"], "teams": out}


def build_official(src: dict) -> dict:
    if not isinstance(src, dict) or not isinstance(src.get("season"), int):
        raise ValueError("season 必須是整數")
    if not re.match(r"^\d{4}-\d{2}-\d{2}$", str(src.get("updated", ""))):
        raise ValueError("updated 必須是 YYYY-MM-DD")
    teams = src.get("teams")
    if not isinstance(teams, dict) or not all(isinstance(v, list) for v in teams.values()):
        raise ValueError("teams 必須是 {球隊代碼: [球員 ID, ...]}")
    for code, ids in teams.items():
        if code not in TEAM_CODES:
            raise ValueError(f"未知的球隊代碼 {code!r}（可用：{', '.join(TEAM_CODES)}）")
        for pid in ids:
            if not (isinstance(pid, str) and re.fullmatch(r"\d{10}", pid)):
                raise ValueError(f"{code} 的球員 ID {pid!r} 必須是 10 碼數字字串")
    return {"season": src["season"], "updated": src["updated"], "teams": {c: sorted(ids) for c, ids in teams.items()}}


def _write(path: Path, data: dict) -> None:
    path.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    log.info("已寫入 %s", path)


def main(argv: Optional[List[str]] = None) -> int:
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--sample", action="store_true", help="產生開發用的假官方名單 official.sample.json")
    args = ap.parse_args(argv)
    if args.sample:
        teams_json = json.loads((REPO / "docs/data/teams.json").read_text(encoding="utf-8"))
        _write(REPO / "docs/data/official.sample.json", sample_official(teams_json))
        return 0
    src = REPO / "scraper/official" / f"{SEASON}.json"
    if not src.exists():
        log.info("找不到 %s，略過（官方名單公布後再整理）", src)
        return 0
    try:
        data = build_official(json.loads(src.read_text(encoding="utf-8")))
    except ValueError as e:
        log.error("錯誤：%s：%s", src, e)
        return 1
    _write(REPO / "docs/data/official.json", data)
    return 0


if __name__ == "__main__":
    sys.exit(main())
