"""Parse CPBL team player-list pages (GET /team?ClubNo=X and POST /team KindCode=D)."""

import re
from typing import List, Optional

from bs4 import BeautifulSoup, Tag

from .models import RosterEntry

# Official legend on the team page:
#   ＃ 註銷註冊 (still a contract player)   ✽ 合約所屬球員 (farm only)
#   ◎ 自主培訓、自行培訓、測試洋將、洋將（不占洋將名額）
NAME_MARKS = {"◎": "◎", "#": "#", "＃": "#", "*": "*", "✽": "*", "＊": "*"}
_ACNT = re.compile(r"Acnt=(\d{10})")
_BG_URL = re.compile(r"url\(['\"]?([^'\")]+)['\"]?\)")


def parse_token(html: str) -> str:
    """Return the anti-forgery token needed to POST /team."""
    soup = BeautifulSoup(html, "lxml")
    field = soup.find("input", attrs={"name": "__RequestVerificationToken"})
    if not isinstance(field, Tag) or not field.get("value"):
        raise ValueError("找不到 __RequestVerificationToken")
    return str(field["value"])


def _split_mark(raw: str) -> tuple:
    raw = raw.strip()
    if raw and raw[0] in NAME_MARKS:
        return NAME_MARKS[raw[0]], raw[1:].strip()
    return "", raw


def _photo_url(item: Tag) -> Optional[str]:
    img = item.select_one(".img a, .img span")
    style = img.get("style", "") if isinstance(img, Tag) else ""
    m = _BG_URL.search(style)
    return m.group(1) if m else None


def _text(item: Tag, selector: str) -> str:
    node = item.select_one(selector)
    return node.get_text(strip=True) if node else ""


def parse_roster(html: str, level: str) -> List[RosterEntry]:
    """Return players (coaches skipped: they have no person link) in page order."""
    soup = BeautifulSoup(html, "lxml")
    entries = []
    for item in soup.select(".TeamPlayersList .item"):
        link = item.select_one(".cont .name a[href]")
        if not isinstance(link, Tag):
            continue
        m = _ACNT.search(link["href"])
        if not m:
            continue
        mark, name = _split_mark(link.get_text())
        entries.append(
            RosterEntry(
                id=m.group(1),
                name=name,
                mark=mark,
                no=_text(item, ".cont .number"),
                pos=_text(item, ".cont .pos"),
                level=level,
                photo_url=_photo_url(item),
            )
        )
    return entries
