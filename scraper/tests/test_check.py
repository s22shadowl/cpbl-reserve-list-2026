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
    teams_json["teams"]["AEO"]["players"][0]["ph"] = 0
    errors, warnings = check(teams_json, roster, photos)
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
