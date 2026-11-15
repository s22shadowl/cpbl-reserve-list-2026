from pathlib import Path

import pytest

from scraper.parse_stats import BATTING, PITCHING, parse_stats

FIX = Path(__file__).parent / "fixtures"


def page(kind, position):
    return (FIX / f"teamscore_AEO_{kind}_{position}.html").read_text(encoding="utf-8")


def test_first_team_batting():
    rows = parse_stats(page("A", BATTING), BATTING)
    assert len(rows) == 34
    assert rows["0000002352"] == {"g": 113, "pa": 436, "avg": "0.282", "ops": "0.771", "hr": 13}


def test_farm_batting_marked_name_still_keyed_by_id():
    rows = parse_stats(page("D", BATTING), BATTING)
    assert len(rows) == 42
    assert rows["0000005310"] == {"g": 52, "pa": 170, "avg": "0.271", "ops": "0.851", "hr": 7}
    assert rows["0000007592"]["pa"] == 144  # shown as *劉承佑


def test_first_team_pitching():
    rows = parse_stats(page("A", PITCHING), PITCHING)
    assert len(rows) == 28
    assert rows["0000005790"] == {"g": 54, "ip": "54.0", "era": "1.67", "whip": "1.26", "so": 40}


def test_farm_pitching():
    rows = parse_stats(page("D", PITCHING), PITCHING)
    assert len(rows) == 36
    assert rows["0000006864"] == {"g": 35, "ip": "36.1", "era": "5.45", "whip": "1.71", "so": 37}


@pytest.mark.parametrize("html", ["", "<html><body>查無資料</body></html>", "<table><tr><th>球員</th></tr></table>"])
def test_no_rows_is_empty(html):
    assert parse_stats(html, BATTING) == {}


def test_missing_column_raises():
    html = ('<table><tr><th>球員</th><th>出賽數</th></tr>'
            '<tr><td class="sticky player"><a href="/team/person?acnt=0000000001">甲</a></td><td>1</td></tr></table>')
    with pytest.raises(ValueError, match="打席"):
        parse_stats(html, BATTING)


def test_unknown_position_raises():
    with pytest.raises(ValueError):
        parse_stats("", "03")


def test_blank_dash_and_parenthesised_cells():
    head = "".join(f"<th>{h}</th>" for h in ["球員", "出賽數", "打席", "打擊率", "整體攻擊指數", "全壘打"])
    cells = "".join(f"<td>{v}</td>" for v in ["3", "（5）", "-", "--", ""])
    html = (f'<table><tr>{head}</tr><tr><td class="sticky player">'
            f'<a href="/team/person?acnt=0000000001">甲</a></td>{cells}</tr></table>')
    assert parse_stats(html, BATTING) == {"0000000001": {"g": 3, "pa": 5}}
