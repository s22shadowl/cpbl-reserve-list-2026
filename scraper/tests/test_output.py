from scraper.models import PersonInfo, RosterEntry
from scraper.output import build_outputs, build_team, player_record, season_record

LOCAL = PersonInfo(born="1997-12-29", nationality="中華民國", draft_year=2019, draft_round=1)
FOREIGN = PersonInfo(born="1992-11-20", nationality="美國", draft_year=None, draft_round=None)
NO_OVERRIDES = {"include": frozenset(), "exclude": {}}


def entry(pid="0000000001", name="甲", mark="", pos="投手", level="一軍"):
    return RosterEntry(id=pid, name=name, mark=mark, no="12", pos=pos, level=level, photo_url="/x.jpg")


def test_player_record_pitcher_omits_p_and_none_fields():
    rec = player_record(entry(), FOREIGN, has_photo=False)
    assert rec == {"id": "0000000001", "n": "甲", "no": "12", "g": "P", "l": "一軍", "ph": 0, "b": "1992-11-20"}


def test_player_record_fielder():
    rec = player_record(entry(pos="二壘手", level="二軍"), LOCAL, has_photo=True)
    assert rec == {"id": "0000000001", "n": "甲", "no": "12", "g": "I", "l": "二軍", "p": "二壘手", "ph": 1,
                   "b": "1997-12-29", "dy": 2019, "dr": 1}


def test_build_team_and_outputs():
    a, b, c = entry("0000000003", "丙"), entry("0000000001", "甲"), entry("0000000002", "乙", mark="◎")
    persons = {"0000000001": LOCAL, "0000000002": LOCAL, "0000000003": LOCAL}
    team = build_team([a, b, c], persons, NO_OVERRIDES, frozenset({"0000000001"}))
    assert [p["id"] for p in team["players"]] == ["0000000003", "0000000001"]
    assert [p["ph"] for p in team["players"]] == [0, 1]
    assert team["exempt"] == {"foreign": [], "training": ["乙"], "fa": [], "expansion": [], "removed": []}
    teams_json, roster_json = build_outputs({"AEO": team}, "2026-11-15")
    assert teams_json == {"updated": "2026-11-15", "teams": {"AEO": team}}
    assert roster_json == {"AEO": ["0000000001", "0000000003"]}

BAT_A = {"g": 7, "pa": 24, "avg": "0.217", "ops": "0.469", "hr": 0}
BAT_D = {"g": 52, "pa": 170, "avg": "0.271", "ops": "0.851", "hr": 7}
PIT_A = {"g": 18, "ip": "64.0", "era": "2.81", "whip": "1.47", "so": 34}
TABLES = {("A", "01"): {"0000000001": BAT_A}, ("D", "01"): {"0000000001": BAT_D},
          ("A", "02"): {"0000000001": PIT_A}, ("D", "02"): {}}


def test_season_record_picks_table_by_position():
    assert season_record(entry(pos="投手"), TABLES) == {"A": PIT_A}
    assert season_record(entry(pos="捕手"), TABLES) == {"A": BAT_A, "D": BAT_D}
    assert season_record(entry(pid="0000000009"), TABLES) == {}
    assert season_record(entry(), {}) == {}


def test_player_record_adds_s_only_when_played():
    rec = player_record(entry(pos="游擊手"), FOREIGN, has_photo=False, tables=TABLES)
    assert rec["s"] == {"A": BAT_A, "D": BAT_D}
    assert "s" not in player_record(entry(pid="0000000009"), FOREIGN, has_photo=False, tables=TABLES)


def test_build_team_passes_tables():
    team = build_team([entry()], {"0000000001": LOCAL}, NO_OVERRIDES, frozenset(), TABLES)
    assert team["players"][0]["s"] == {"A": PIT_A}


def test_player_record_tag():
    rec = player_record(entry(), LOCAL, has_photo=False, tag="FA")
    assert rec["tag"] == "FA"
    assert "tag" not in player_record(entry(), LOCAL, has_photo=False)


def test_build_team_applies_tags_from_overrides():
    ov = {**NO_OVERRIDES, "tags": {"0000000002": {"label": "FA", "name": "乙"}}}
    persons = {"0000000001": LOCAL, "0000000002": LOCAL}
    team = build_team([entry("0000000001"), entry("0000000002")], persons, ov, frozenset())
    assert ["tag" in p for p in team["players"]] == [False, True]
    assert team["players"][1]["tag"] == "FA"


NEW = PersonInfo(born="2004-03-01", nationality="中華民國", draft_year=2026, draft_round=4)


def test_player_record_rk():
    assert player_record(entry(), NEW, has_photo=False)["rk"] == "d"
    assert player_record(entry(), LOCAL, has_photo=False, rookie=True)["rk"] == "c"
    assert player_record(entry(), NEW, has_photo=False, rookie=True)["rk"] == "d"
    assert "rk" not in player_record(entry(), LOCAL, has_photo=False)


def test_build_team_applies_rookie_overrides():
    ov = {**NO_OVERRIDES, "rookie": {"0000000002": {"name": "乙"}}}
    persons = {"0000000001": LOCAL, "0000000002": LOCAL}
    team = build_team([entry("0000000001"), entry("0000000002")], persons, ov, frozenset())
    assert [p.get("rk") for p in team["players"]] == [None, "c"]
