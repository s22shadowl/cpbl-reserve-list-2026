import json
from io import BytesIO
from pathlib import Path

from PIL import Image

import pytest

from scraper.build import SEASON, ensure_photo, load_person, run, scrape_team
from scraper.classify import REASONS
from scraper.fetcher import FatalScraperError
from scraper.parse_team import parse_roster

FIX = Path(__file__).parent / "fixtures"
EMPTY_EXEMPT = {r: [] for r in REASONS}


def team(n, start=1, ph=1):
    return {"players": [{"id": f"{i:010d}", "n": f"P{i}", "ph": ph} for i in range(start, start + n)],
            "exempt": dict(EMPTY_EXEMPT)}


class FakeClient:
    """Serves the AEO fixtures; every person page is local except 0000006749 (foreign)."""

    def __init__(self):
        self.person_calls = 0

    def team_pages(self, code):
        if code != "AEO":
            raise FatalScraperError("only AEO in fixtures")
        return ((FIX / "team_AEO_A.html").read_text(encoding="utf-8"),
                (FIX / "team_AEO_D.html").read_text(encoding="utf-8"))

    def team_stats(self, code, season):
        assert season == SEASON
        return {(k, p): (FIX / f"teamscore_{code}_{k}_{p}.html").read_text(encoding="utf-8")
                for k in "AD" for p in ("01", "02")}

    def person(self, acnt):
        self.person_calls += 1
        name = "person_0000006749.html" if acnt == "0000006749" else "person_0000005479.html"
        return (FIX / name).read_text(encoding="utf-8")

    def photo(self, path):
        if "江國豪" not in path:
            raise FatalScraperError("no photo")
        out = BytesIO()
        Image.new("RGB", (300, 385)).save(out, "JPEG")
        return out.getvalue()


def test_run_end_to_end(tmp_path):
    overrides = tmp_path / "overrides.json"
    overrides.write_text(json.dumps({"include": [], "exclude": {"0000003339": {"reason": "removed", "name": "林哲瑄"}},
                                     "tags": {"0000005310": {"label": "FA", "name": "陳真"}}},
                                    ensure_ascii=False), encoding="utf-8")
    teams_path, roster_path = tmp_path / "teams.json", tmp_path / "roster.json"
    teams_path.write_text(json.dumps({"updated": "2026-10-07", "teams": {"ACN": team(61)}}), encoding="utf-8")
    fake = FakeClient()
    kwargs = dict(teams_path=teams_path, roster_path=roster_path, photos=tmp_path / "photos",
                  cache=tmp_path / "cache", overrides_path=overrides)

    run(fake, ["AEO"], False, "2026-11-15", **kwargs)

    data = json.loads(teams_path.read_text(encoding="utf-8"))
    assert data["updated"] == "2026-11-15"
    assert list(data["teams"]) == ["ACN", "AEO"]  # other teams kept, TEAM_CODES order
    aeo = data["teams"]["AEO"]
    assert aeo["stats"] is True
    ids = {p["id"] for p in aeo["players"]}
    assert "0000006749" not in ids and "0000007577" not in ids and "0000003339" not in ids
    assert "魔力藍" in aeo["exempt"]["foreign"]
    assert "李斯特" in aeo["exempt"]["training"]
    assert aeo["exempt"]["removed"] == ["林哲瑄"]
    jiang = next(p for p in aeo["players"] if p["id"] == "0000005479")
    assert jiang == {"id": "0000005479", "n": "江國豪", "no": "12", "g": "P", "l": "一軍", "ph": 1,
                     "b": "1997-12-29", "dy": 2019, "dr": 1,
                     "s": {"A": {"g": 18, "ip": "64.0", "era": "2.81", "whip": "1.47", "so": 34},
                           "D": {"g": 8, "ip": "36.0", "era": "2.50", "whip": "1.22", "so": 26}}}
    chen = next(p for p in aeo["players"] if p["id"] == "0000005310")
    assert chen["tag"] == "FA" and sum("tag" in p for p in aeo["players"]) == 1
    assert chen["s"]["D"] == {"g": 52, "pa": 170, "avg": "0.271", "ops": "0.851", "hr": 7}
    assert sum("s" in p for p in aeo["players"]) < len(aeo["players"])  # non-playing players omit s
    assert sum(p["ph"] for p in aeo["players"]) == 1
    roster = json.loads(roster_path.read_text(encoding="utf-8"))
    assert roster["AEO"] == sorted(ids)
    assert (tmp_path / "photos/0000005479.jpg").exists()

    calls = fake.person_calls
    run(fake, ["AEO"], False, "2026-11-15", **kwargs)
    assert fake.person_calls == calls  # second run served from cache


class BadPageClient(FakeClient):
    def person(self, acnt):
        self.person_calls += 1
        return "<html></html>"


def test_unparseable_page_not_cached(tmp_path):
    with pytest.raises(ValueError):
        load_person(BadPageClient(), "0000005479", tmp_path / "cache", False)
    assert not list((tmp_path / "cache").glob("*.html")) if (tmp_path / "cache").exists() else True


def test_corrupt_cache_is_replaced(tmp_path):
    cache = tmp_path / "cache"
    cache.mkdir()
    (cache / "0000005479.html").write_text("<html></html>", encoding="utf-8")
    fake = FakeClient()
    info = load_person(fake, "0000005479", cache, False)
    assert info.nationality == "中華民國" and fake.person_calls == 1
    assert "PlayerBrief" in (cache / "0000005479.html").read_text(encoding="utf-8")


class DupClient(FakeClient):
    def team_pages(self, code):
        html = (FIX / "team_AEO_A.html").read_text(encoding="utf-8")
        return html, html


def test_scrape_team_dedupes_keeping_first_team(tmp_path):
    ov = {"include": frozenset(), "exclude": {}}
    first_ids = [e.id for e in parse_roster((FIX / "team_AEO_A.html").read_text(encoding="utf-8"), "一軍")]
    team = scrape_team(DupClient(), "AEO", ov, tmp_path / "p", tmp_path / "c", False)
    ids = [p["id"] for p in team["players"]]
    assert len(ids) == len(set(ids))
    assert {p["l"] for p in team["players"]} == {"一軍"}
    assert len(ids) <= len(first_ids)


def test_ensure_photo_handles_decompression_bomb(tmp_path, monkeypatch):
    import scraper.build as b
    from PIL import Image
    from scraper.models import RosterEntry

    def boom(data):
        raise Image.DecompressionBombError("big")

    monkeypatch.setattr(b, "resize_photo", boom)
    e = RosterEntry("0000000001", "甲", "", "1", "投手", "一軍", "/x.jpg")
    assert ensure_photo(FakeClient(), e, tmp_path, False) is False


class NoStatsClient(FakeClient):
    def team_stats(self, code, season):
        raise FatalScraperError("teamscore down")


def test_stats_failure_still_builds_roster(tmp_path, caplog):
    teams_path, roster_path = tmp_path / "teams.json", tmp_path / "roster.json"
    run(NoStatsClient(), ["AEO"], False, "2026-11-15", teams_path=teams_path, roster_path=roster_path,
        photos=tmp_path / "photos", cache=tmp_path / "cache", overrides_path=Path(__file__).parents[1] / "overrides.json")
    aeo = json.loads(teams_path.read_text(encoding="utf-8"))["teams"]["AEO"]
    assert aeo["stats"] is False and aeo["players"]
    assert not any("s" in p for p in aeo["players"])
    assert json.loads(roster_path.read_text(encoding="utf-8"))["AEO"]
    assert "AEO" in caplog.text and "teamscore down" in caplog.text


class BadStatsClient(FakeClient):
    def team_stats(self, code, season):
        return {("A", "01"): "<table><tr><th>球員</th></tr><tr><td class='player'><a href='?acnt=0000000001'>甲</a></td></tr></table>"}


def test_unparseable_stats_marks_team_without_stats(tmp_path):
    ov = {"include": frozenset(), "exclude": {}}
    team = scrape_team(BadStatsClient(), "AEO", ov, tmp_path / "p", tmp_path / "c", False)
    assert team["stats"] is False and not any("s" in p for p in team["players"])
