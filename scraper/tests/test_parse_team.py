from pathlib import Path

import pytest

from scraper.parse_team import parse_roster, parse_token

FIX = Path(__file__).parent / "fixtures"


def read(name):
    return (FIX / name).read_text(encoding="utf-8")


def test_token_found():
    assert len(parse_token(read("team_AEO_A.html"))) > 20


def test_token_missing_raises():
    with pytest.raises(ValueError):
        parse_token("<html></html>")


def test_first_team_roster():
    rows = parse_roster(read("team_AEO_A.html"), "一軍")
    assert len(rows) == 28
    first = rows[0]
    assert (first.id, first.name, first.no, first.pos, first.level, first.mark) == (
        "0000005479", "江國豪", "12", "投手", "一軍", "")
    assert first.photo_url == "/files/atts/0L088856657657537117/12江國豪2026.jpg"


def test_farm_roster_marks():
    rows = {r.id: r for r in parse_roster(read("team_AEO_D.html"), "二軍")}
    assert len(rows) == 68
    assert (rows["0000007577"].name, rows["0000007577"].mark) == ("李斯特", "◎")
    assert (rows["0000003339"].name, rows["0000003339"].mark) == ("林哲瑄", "#")
    assert (rows["0000007834"].name, rows["0000007834"].mark) == ("泰威", "*")


def test_coaches_skipped():
    names = {r.name for r in parse_roster(read("team_AEO_A.html"), "一軍")}
    assert "後藤光尊" not in names
