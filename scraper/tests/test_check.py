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
