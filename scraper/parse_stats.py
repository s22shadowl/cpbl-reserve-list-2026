"""Parse CPBL team score tables (POST /team/teamscoreaction) into compact per-player stats."""

import re
from typing import Dict, List, Mapping

from bs4 import BeautifulSoup, Tag

BATTING = "01"
PITCHING = "02"
KINDS = ("A", "D")  # A 一軍例行賽, D 二軍例行賽
POSITIONS = (BATTING, PITCHING)

# header text on the page -> key in teams.json; rates and innings stay as display strings
COLUMNS: Mapping[str, Mapping[str, str]] = {
    BATTING: {"出賽數": "g", "打席": "pa", "打擊率": "avg", "整體攻擊指數": "ops", "全壘打": "hr"},
    PITCHING: {"出賽數": "g", "投球局數": "ip", "防禦率": "era", "每局被上壘率": "whip", "奪三振": "so"},
}
INT_KEYS = frozenset({"g", "pa", "hr", "so"})
_ACNT = re.compile(r"acnt=(\d{10})", re.IGNORECASE)

def _header_index(headers: List[str], columns: Mapping[str, str]) -> Dict[str, int]:
    missing = [h for h in columns if h not in headers]
    if missing:
        raise ValueError(f"成績表缺少欄位：{missing}")
    return {key: headers.index(h) for h, key in columns.items()}

def _value(key: str, text: str):
    return int(text) if key in INT_KEYS else text

def parse_stats(html: str, position: str) -> Dict[str, dict]:
    """Return {player id: {key: value}} for one table; {} when the page has no player rows."""
    if position not in COLUMNS:
        raise ValueError(f"未知成績類別：{position}")
    soup = BeautifulSoup(html, "lxml")
    table = soup.find("table")
    if not isinstance(table, Tag):
        return {}
    rows = [tr for tr in table.find_all("tr") if tr.select_one("td.player a[href]")]
    if not rows:
        return {}
    headers = [th.get_text(strip=True) for th in table.find_all("th")]
    index = _header_index(headers, COLUMNS[position])
    stats: Dict[str, dict] = {}
    for tr in rows:
        m = _ACNT.search(tr.select_one("td.player a[href]")["href"])
        if not m:
            continue
        cells = [td.get_text(strip=True) for td in tr.find_all("td")]
        stats[m.group(1)] = {key: _value(key, cells[i]) for key, i in index.items()}
    return stats
