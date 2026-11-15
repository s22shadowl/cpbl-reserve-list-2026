import json

import pytest

from scraper.check import check_official
from scraper.models import TEAM_CODES
from scraper.official import LIMIT, build_official, main, sample_official


def make_player(i, level="二軍", rk=None, s=None):
    p = {"id": f"{i:010d}", "n": f"P{i}", "g": "P", "l": level}
    if rk:
        p["rk"] = rk
    if s:
        p["s"] = s
    return p


def make_teams(n=90):
    players = []
    for i in range(n):
        if i < 20:
            players.append(make_player(i, "一軍", s={"A": {"ip": "60.0"}}))
        elif i < 30:
            players.append(make_player(i, rk="d"))
        else:
            players.append(make_player(i))
    return {"updated": "2026-11-15", "teams": {c: {"players": [dict(p, id=f"{k * 1000 + int(p['id']):010d}") for p in players]}
                                                for k, c in enumerate(TEAM_CODES)}}


def test_sample_has_sixty_distinct_selectable_players_per_team():
    teams = make_teams()
    out = sample_official(teams, seed=7)
    assert out["season"] == 2027 and out["updated"] == "2026-11-15"
    assert set(out["teams"]) == set(TEAM_CODES)
    for code, ids in out["teams"].items():
        assert len(ids) == LIMIT == len(set(ids))
        assert set(ids) <= {p["id"] for p in teams["teams"][code]["players"]}


def test_sample_is_deterministic_and_seed_dependent():
    teams = make_teams()
    assert sample_official(teams, seed=7) == sample_official(teams, seed=7)
    assert sample_official(teams, seed=7) != sample_official(teams, seed=8)


def test_sample_prefers_first_team_core_and_rookies_but_is_not_pure_filter():
    teams = make_teams(n=120)
    ids = set(sample_official(teams, seed=7)["teams"]["ACN"])
    pool = teams["teams"]["ACN"]["players"]
    core = [p["id"] for p in pool if p["l"] == "一軍"]
    rookies = [p["id"] for p in pool if p.get("rk")]
    rest = [p["id"] for p in pool if p["l"] == "二軍" and not p.get("rk")]
    assert len(ids & set(core)) >= 17
    assert len(ids & set(rookies)) >= 7
    assert ids & set(rest)


def test_sample_takes_everyone_when_team_has_fewer_than_limit():
    teams = make_teams(n=40)
    assert len(sample_official(teams, seed=1)["teams"]["ACN"]) == 40


def test_build_official_normalizes_source():
    src = {"season": 2027, "updated": "2026-11-30", "teams": {"ACN": ["0000000002", "0000000001"]}}
    assert build_official(src) == {"season": 2027, "updated": "2026-11-30", "teams": {"ACN": ["0000000001", "0000000002"]}}


@pytest.mark.parametrize("bad", [{"season": 2027, "updated": "x", "teams": {}}, {"updated": "2026-11-30", "teams": {}},
                                 {"season": 2027, "updated": "2026-11-30", "teams": {"ACN": "nope"}}])
def test_build_official_rejects_malformed(bad):
    with pytest.raises(ValueError):
        build_official(bad)


def test_main_writes_official_and_sample(tmp_path, monkeypatch):
    (tmp_path / "docs/data").mkdir(parents=True)
    (tmp_path / "scraper/official").mkdir(parents=True)
    (tmp_path / "docs/data/teams.json").write_text(json.dumps(make_teams()), encoding="utf-8")
    monkeypatch.setattr("scraper.official.REPO", tmp_path)
    assert main([]) == 0
    assert not (tmp_path / "docs/data/official.json").exists()  # no source yet: nothing to publish
    assert main(["--sample"]) == 0
    sample = json.loads((tmp_path / "docs/data/official.sample.json").read_text(encoding="utf-8"))
    assert len(sample["teams"]["ACN"]) == LIMIT
    (tmp_path / "scraper/official/2027.json").write_text(json.dumps({"season": 2027, "updated": "2026-11-30", "teams": {"ACN": ["0000000001"]}}), encoding="utf-8")
    assert main([]) == 0
    assert json.loads((tmp_path / "docs/data/official.json").read_text(encoding="utf-8"))["teams"] == {"ACN": ["0000000001"]}


def test_check_official_accepts_valid_and_reports_unknown_ids():
    teams = make_teams()
    good = sample_official(teams, seed=1)
    assert check_official(good, teams, "official.json") == []
    bad = json.loads(json.dumps(good))
    bad["teams"]["ACN"][0] = "9999999999"
    bad["teams"]["XXX"] = []
    errors = "\n".join(check_official(bad, teams, "official.json"))
    assert "official.json" in errors and "ACN" in errors and "9999999999" in errors and "XXX" in errors


def test_check_official_flags_duplicates_and_too_many():
    teams = make_teams()
    dup = {"season": 2027, "updated": "2026-11-30", "teams": {"ACN": [teams["teams"]["ACN"]["players"][0]["id"]] * 2}}
    assert any("重複" in e for e in check_official(dup, teams, "f"))
    many = {"season": 2027, "updated": "2026-11-30", "teams": {"ACN": [p["id"] for p in teams["teams"]["ACN"]["players"][:61]]}}
    assert any("60" in e for e in check_official(many, teams, "f"))
