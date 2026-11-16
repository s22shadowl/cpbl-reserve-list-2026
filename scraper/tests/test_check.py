from scraper.check import check
from scraper.classify import REASONS
from scraper.models import TEAM_CODES

EMPTY_EXEMPT = {r: [] for r in REASONS}


def team(n, start=1, ph=1):
    return {"players": [{"id": f"{i:010d}", "n": f"P{i}", "ph": ph} for i in range(start, start + n)],
            "exempt": dict(EMPTY_EXEMPT)}


def valid():
    teams = {code: team(61, start=k * 100) for k, code in enumerate(TEAM_CODES)}
    roster = {code: [p["id"] for p in t["players"]] for code, t in teams.items()}
    photos = frozenset(i for ids in roster.values() for i in ids)
    return {"updated": "2026-11-15", "teams": teams}, roster, photos


def test_check_passes_valid_data():
    assert check(*valid()) == ([], [])


def test_check_reports_problems():
    teams_json, roster, photos = valid()
    del teams_json["teams"]["ACN"]
    teams_json["teams"]["ADD"] = team(60, start=100)
    roster["AJL"] = roster["AJL"][:-1]
    roster["XXX"] = []
    errors, _ = check(teams_json, roster, photos - {f"{300:010d}"})
    joined = "\n".join(errors)
    for needle in ["ACN：teams.json 缺少此隊", "ADD：可選球員只有 60 人", "AJL：teams.json 與 roster.json 的球員不一致",
                   "AEO：P300 標記有照片但檔案不存在", "未知球隊 ['XXX']"]:
        assert needle in joined


def test_check_warns_missing_photo():
    teams_json, roster, photos = valid()
    first = teams_json["teams"]["AEO"]["players"][0]
    first["ph"] = 0
    errors, warnings = check(teams_json, roster, photos - {first["id"]})
    assert errors == [] and len(warnings) == 1


def test_check_validates_season_stats_shape():
    teams_json, roster, photos = valid()
    players = teams_json["teams"]["AEO"]["players"]
    players[0]["s"] = {"A": {"g": 1}, "D": {"g": 2}}
    assert check(teams_json, roster, photos) == ([], [])
    players[1]["s"] = {"B": {"g": 1}}
    players[2]["s"] = [1]
    players[3]["s"] = {}
    errors, _ = check(teams_json, roster, photos)
    assert len(errors) == 3 and all("成績欄位 s" in e for e in errors)


def test_check_validates_team_stats_flag():
    teams_json, roster, photos = valid()
    teams_json["teams"]["AEO"]["stats"] = True
    teams_json["teams"]["ACN"]["stats"] = False
    assert check(teams_json, roster, photos) == ([], [])
    teams_json["teams"]["ADD"]["stats"] = "yes"
    errors, _ = check(teams_json, roster, photos)
    assert errors == ["ADD：stats 必須是 true 或 false"]


def test_check_validates_tag():
    teams_json, roster, photos = valid()
    players = teams_json["teams"]["AEO"]["players"]
    players[0]["tag"] = "FA"
    assert check(teams_json, roster, photos) == ([], [])
    players[1]["tag"] = ""
    players[2]["tag"] = 3
    errors, _ = check(teams_json, roster, photos)
    assert len(errors) == 2 and all("標籤 tag" in e for e in errors)


def test_check_validates_rk():
    teams_json, roster, photos = valid()
    players = teams_json["teams"]["AEO"]["players"]
    players[0]["rk"] = "d"
    players[1]["rk"] = "c"
    assert check(teams_json, roster, photos) == ([], [])
    players[2]["rk"] = "x"
    errors, _ = check(teams_json, roster, photos)
    assert len(errors) == 1 and "rk" in errors[0]


def test_check_overrides_ids_must_be_selectable():
    teams_json, roster, photos = valid()
    ids = roster["AEO"]
    ok = {"rookie": {ids[0]: {}}, "draft": {ids[1]: {}}}
    assert check(teams_json, roster, photos, ok) == ([], [])
    bad = {"rookie": {"0000009999": {"name": "甲"}}, "draft": {"0000009998": {"name": "乙"}}}
    errors, _ = check(teams_json, roster, photos, bad)
    assert len(errors) == 2 and "0000009999" in errors[0] and "0000009998" in errors[1]


def test_check_warns_orphan_photos():
    teams_json, roster, photos = valid()
    errors, warnings = check(teams_json, roster, photos | {"0000099999"})
    assert errors == [] and warnings == ["docs/photos 有 1 張沒有球員使用的照片：['0000099999']"]
