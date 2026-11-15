"""Parse a CPBL player personal page (GET /team/person?Acnt=X)."""

import re
from typing import Optional

from bs4 import BeautifulSoup

from .models import PersonInfo

_CN_DIGITS = {"一": 1, "二": 2, "三": 3, "四": 4, "五": 5, "六": 6, "七": 7, "八": 8, "九": 9}
_DRAFT = re.compile(r"(\d{4})年第([0-9一二三四五六七八九十]+)輪")


def cn_number(text: str) -> int:
    """Convert 1-99 written as digits or Chinese numerals ("十二", "二十") to int."""
    if text.isdigit():
        return int(text)
    if "十" not in text:
        return _CN_DIGITS[text]
    tens, _, ones = text.partition("十")
    return (_CN_DIGITS[tens] if tens else 1) * 10 + (_CN_DIGITS[ones] if ones else 0)


def _desc(soup: BeautifulSoup, cls: str) -> str:
    node = soup.select_one(f".PlayerBrief dd.{cls} .desc")
    return node.get_text(strip=True) if node else ""


def parse_draft(text: str) -> tuple:
    """'富邦悍將2019年第一輪' -> (2019, 1); anything else -> (None, None)."""
    m = _DRAFT.search(text)
    if not m:
        return None, None
    return int(m.group(1)), cn_number(m.group(2))


def parse_person(html: str) -> PersonInfo:
    soup = BeautifulSoup(html, "lxml")
    if soup.select_one(".PlayerBrief") is None:
        raise ValueError("找不到 PlayerBrief 區塊")
    born_raw = _desc(soup, "born")
    born: Optional[str] = born_raw.replace("/", "-") if re.fullmatch(r"\d{4}/\d{2}/\d{2}", born_raw) else None
    year, rnd = parse_draft(_desc(soup, "draft"))
    return PersonInfo(born=born, nationality=_desc(soup, "nationality"), draft_year=year, draft_round=rnd)
