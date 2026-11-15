"""Scrape cpbl.com.tw and regenerate site data: python -m scraper.build [--team AEO ...] [--refresh]"""

import argparse
import json
import logging
import sys
from datetime import date
from pathlib import Path
from typing import Dict, Iterable, Optional

from PIL import Image

from .classify import exempt_reason, load_overrides
from .fetcher import CpblClient, FatalScraperError, RetryableScraperError
from .models import TEAM_CODES, PersonInfo, RosterEntry
from .output import build_outputs, build_team
from .parse_person import parse_person
from .parse_stats import parse_stats
from .parse_team import parse_roster
from .photos import resize_photo


REPO = Path(__file__).resolve().parent.parent
TEAMS_JSON = REPO / "docs/data/teams.json"
ROSTER_JSON = REPO / "worker/src/roster.json"
PHOTOS = REPO / "docs/photos"
CACHE = REPO / "scraper/.cache/person"
OVERRIDES = REPO / "scraper/overrides.json"
SEASON = 2026

log = logging.getLogger(__name__)


def load_person(client: CpblClient, acnt: str, cache: Path, refresh: bool) -> PersonInfo:
    """Return parsed person info; the cache only ever holds pages that parsed successfully."""
    path = cache / f"{acnt}.html"
    if path.exists() and not refresh:
        try:
            return parse_person(path.read_text(encoding="utf-8"))
        except ValueError:
            log.warning("%s 快取頁面無法解析，刪除並重新下載", acnt)
            path.unlink()
    html = client.person(acnt)
    info = parse_person(html)  # raises ValueError before anything is cached
    cache.mkdir(parents=True, exist_ok=True)
    path.write_text(html, encoding="utf-8")
    return info


def ensure_photo(client: CpblClient, entry: RosterEntry, photos: Path, refresh: bool) -> bool:
    """Download and shrink a player's photo; False (and a warning) when unavailable."""
    path = photos / f"{entry.id}.jpg"
    if path.exists() and not refresh:
        return True
    if not entry.photo_url:
        log.warning("%s %s 官網沒有照片", entry.id, entry.name)
        return False
    try:
        data = resize_photo(client.photo(entry.photo_url))
    except (RetryableScraperError, FatalScraperError, OSError, Image.DecompressionBombError) as e:
        log.warning("%s %s 照片下載失敗：%s", entry.id, entry.name, e)
        return False
    photos.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)
    return True


def load_stats(client: CpblClient, code: str) -> Optional[dict]:
    """Season stat tables for one team, or None (with a warning) so a stats outage never blocks the roster."""
    try:
        tables = {key: parse_stats(html, key[1]) for key, html in client.team_stats(code, SEASON).items()}
    except (RetryableScraperError, FatalScraperError, ValueError) as e:
        log.warning("%s：本季成績抓取失敗，此隊不顯示成績：%s", code, e)
        return None
    if not any(tables.values()):
        log.warning("%s：%d 年沒有任何球員成績", code, SEASON)
    return tables


def scrape_team(client: CpblClient, code: str, overrides: dict, photos: Path, cache: Path, refresh: bool) -> dict:
    first_html, farm_html = client.team_pages(code)
    entries = parse_roster(first_html, "一軍") + parse_roster(farm_html, "二軍")
    if not entries:
        raise FatalScraperError(f"{code}：球員列表是空的，頁面結構可能改變")
    unique: Dict[str, RosterEntry] = {}
    for e in entries:
        if e.id in unique:
            log.warning("%s：%s %s 同時出現在一二軍，保留 %s", code, e.id, e.name, unique[e.id].level)
        else:
            unique[e.id] = e
    entries = list(unique.values())
    persons: Dict[str, PersonInfo] = {}
    photo_ids = set()
    for e in entries:
        persons[e.id] = load_person(client, e.id, cache, refresh)
        if exempt_reason(e, persons[e.id], overrides) is None and ensure_photo(client, e, photos, refresh):
            photo_ids.add(e.id)
    tables = load_stats(client, code)
    team = {**build_team(entries, persons, overrides, frozenset(photo_ids), tables or {}), "stats": tables is not None}
    log.info("%s：一二軍共 %d 人，可選 %d 人", code, len(entries), len(team["players"]))
    return team


def run(client: CpblClient, codes: Iterable[str], refresh: bool, today: str,
        teams_path: Path = TEAMS_JSON, roster_path: Path = ROSTER_JSON,
        photos: Path = PHOTOS, cache: Path = CACHE, overrides_path: Path = OVERRIDES) -> None:
    overrides = load_overrides(overrides_path)
    existing = json.loads(teams_path.read_text(encoding="utf-8"))["teams"] if teams_path.exists() else {}
    fresh = {code: scrape_team(client, code, overrides, photos, cache, refresh) for code in codes}
    merged = {code: fresh.get(code, existing.get(code)) for code in TEAM_CODES if code in fresh or code in existing}
    teams_json, roster_json = build_outputs(merged, today)
    teams_path.parent.mkdir(parents=True, exist_ok=True)
    teams_path.write_text(json.dumps(teams_json, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    roster_path.write_text(json.dumps(roster_json, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description="從中職官網產生 teams.json、roster.json 與照片")
    parser.add_argument("--team", action="append", choices=TEAM_CODES, help="只更新指定球隊，可重複；預設六隊")
    parser.add_argument("--refresh", action="store_true", help="忽略個人頁快取並重新下載照片")
    args = parser.parse_args(argv)
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    try:
        run(CpblClient(), args.team or TEAM_CODES, args.refresh, date.today().isoformat())
    except (FatalScraperError, RetryableScraperError, ValueError) as e:
        log.error("產生失敗：%s", e)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
