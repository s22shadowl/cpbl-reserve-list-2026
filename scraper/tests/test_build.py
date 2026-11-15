import json
from io import BytesIO
from pathlib import Path

from PIL import Image

from scraper.build import run
from scraper.classify import REASONS
from scraper.fetcher import FatalScraperError

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
    overrides.write_text(json.dumps({"include": [], "exclude": {"0000003339": {"reason": "removed", "name": "林哲瑄"}}},
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
    ids = {p["id"] for p in aeo["players"]}
    assert "0000006749" not in ids and "0000007577" not in ids and "0000003339" not in ids
    assert "魔力藍" in aeo["exempt"]["foreign"]
    assert "李斯特" in aeo["exempt"]["training"]
    assert aeo["exempt"]["removed"] == ["林哲瑄"]
    jiang = next(p for p in aeo["players"] if p["id"] == "0000005479")
    assert jiang == {"id": "0000005479", "n": "江國豪", "no": "12", "g": "P", "l": "一軍", "ph": 1,
                     "b": "1997-12-29", "dy": 2019, "dr": 1}
    assert sum(p["ph"] for p in aeo["players"]) == 1
    roster = json.loads(roster_path.read_text(encoding="utf-8"))
    assert roster["AEO"] == sorted(ids)
    assert (tmp_path / "photos/0000005479.jpg").exists()

    calls = fake.person_calls
    run(fake, ["AEO"], False, "2026-11-15", **kwargs)
    assert fake.person_calls == calls  # second run served from cache
