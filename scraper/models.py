"""Immutable records passed between scraper stages."""

from dataclasses import dataclass
from typing import Optional


@dataclass(frozen=True)
class RosterEntry:
    """One player row from a team list page (一軍 or 二軍)."""

    id: str  # 10-digit Acnt
    name: str  # name without the official prefix mark
    mark: str  # "" or one of "◎", "#", "*" (see NAME_MARKS)
    no: str  # uniform number as shown, e.g. "00", "12"
    pos: str  # position text as shown, e.g. "投手", "二壘手"
    level: str  # "一軍" or "二軍"
    photo_url: Optional[str]  # site-relative path, or None


@dataclass(frozen=True)
class PersonInfo:
    """Fields read from a player's personal page."""

    born: Optional[str]  # "YYYY-MM-DD"
    nationality: str  # e.g. "中華民國", "美國"; "" when missing
    draft_year: Optional[int]
    draft_round: Optional[int]


TEAM_CODES = ("ACN", "ADD", "AJL", "AEO", "AAA", "AKP")
