import json

import pytest

from scraper.classify import apply_draft, exempt_reason, load_overrides, position_group
from scraper.models import PersonInfo, RosterEntry

LOCAL = PersonInfo(born="1997-12-29", nationality="中華民國", draft_year=2019, draft_round=1)
FOREIGN = PersonInfo(born="1992-11-20", nationality="美國", draft_year=None, draft_round=None)
NO_OVERRIDES = {"include": frozenset(), "exclude": {}}


def entry(pid="0000000001", name="甲", mark="", pos="投手", level="一軍"):
    return RosterEntry(id=pid, name=name, mark=mark, no="12", pos=pos, level=level, photo_url="/x.jpg")


@pytest.mark.parametrize("pos,expected", [
    ("投手", ("P", None)), ("捕手", ("C", "捕手")), ("游擊手", ("I", "游擊手")),
    ("一壘手", ("I", "一壘手")), ("左外野手", ("O", "左外野手")), ("中外野手", ("O", "中外野手")),
])
def test_position_group(pos, expected):
    assert position_group(pos) == expected


def test_position_group_unknown():
    with pytest.raises(ValueError):
        position_group("指定打擊")


def test_exempt_rules():
    assert exempt_reason(entry(), LOCAL, NO_OVERRIDES) is None
    assert exempt_reason(entry(), FOREIGN, NO_OVERRIDES) == "foreign"
    assert exempt_reason(entry(mark="◎"), LOCAL, NO_OVERRIDES) == "training"
    assert exempt_reason(entry(mark="◎"), FOREIGN, NO_OVERRIDES) == "foreign"
    assert exempt_reason(entry(mark="#"), LOCAL, NO_OVERRIDES) is None
    assert exempt_reason(entry(mark="*"), LOCAL, NO_OVERRIDES) is None


def test_drafted_foreign_national_is_local_player():
    drafted = PersonInfo(born="2003-04-01", nationality="日本", draft_year=2026, draft_round=10)
    assert exempt_reason(entry(), drafted, NO_OVERRIDES) is None
    assert exempt_reason(entry(), FOREIGN, NO_OVERRIDES) == "foreign"
    assert exempt_reason(entry(mark="◎"), drafted, NO_OVERRIDES) == "training"


def test_exempt_overrides_win():
    ov = {"include": frozenset({"0000000002"}), "exclude": {"0000000001": {"reason": "fa"}}}
    assert exempt_reason(entry("0000000001"), LOCAL, ov) == "fa"
    assert exempt_reason(entry("0000000002", mark="◎"), FOREIGN, ov) is None


def write(tmp_path, data):
    path = tmp_path / "overrides.json"
    path.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
    return path


def test_load_overrides_ok(tmp_path):
    ov = load_overrides(write(tmp_path, {"include": ["0000000002"], "exclude": {"0000000001": {"reason": "removed", "name": "甲"}}}))
    assert ov["include"] == frozenset({"0000000002"})
    assert ov["exclude"]["0000000001"]["reason"] == "removed"
    assert ov["tags"] == {}


def test_load_overrides_tags(tmp_path):
    tags = {"0000000003": {"label": "FA", "name": "丙", "note": "宣告行使 FA"}}
    ov = load_overrides(write(tmp_path, {"include": [], "exclude": {}, "tags": tags}))
    assert ov["tags"] == tags


@pytest.mark.parametrize("data", [
    {"include": ["123"]},
    {"exclude": {"0000000001": {"reason": "retired"}}},
    {"include": ["0000000001"], "exclude": {"0000000001": {"reason": "fa"}}},
    {"tags": {"12": {"label": "FA"}}},
    {"tags": {"0000000001": {"label": ""}}},
    {"tags": {"0000000001": {"label": 1}}},
    {"tags": {"0000000001": {"label": "1234567"}}},
    {"tags": {"0000000001": {}}},
    {"exclude": {"0000000001": {"reason": "fa"}}, "tags": {"0000000001": {"label": "FA"}}},
    {"rookie": {"12": {"name": "甲"}}},
    {"exclude": {"0000000001": {"reason": "fa"}}, "rookie": {"0000000001": {"name": "甲"}}},
    {"draft": {"12": {"year": 2025, "round": 7}}},
    {"draft": {"0000000001": {"year": "2025", "round": 7}}},
    {"draft": {"0000000001": {"year": 2025, "round": 0}}},
    {"draft": {"0000000001": {"year": 2025}}},
])
def test_load_overrides_rejects(tmp_path, data):
    with pytest.raises(ValueError):
        load_overrides(write(tmp_path, data))


def test_load_overrides_rookie_and_draft(tmp_path):
    rookie = {"0000000001": {"name": "甲", "note": "自培轉正"}}
    draft = {"0000000002": {"name": "乙", "year": 2025, "round": 7, "note": "補進"}}
    ov = load_overrides(write(tmp_path, {"rookie": rookie, "draft": draft}))
    assert ov["rookie"] == rookie and ov["draft"] == draft
    empty = load_overrides(write(tmp_path, {}))
    assert empty["rookie"] == {} and empty["draft"] == {}


def test_apply_draft_overrides_person():
    person = PersonInfo(born="1999-01-01", nationality="中華民國", draft_year=None, draft_round=None)
    ov = {"draft": {"0000000002": {"year": 2025, "round": 7}}}
    out = apply_draft(person, "0000000002", ov)
    assert (out.draft_year, out.draft_round, out.born) == (2025, 7, "1999-01-01")
    assert apply_draft(person, "0000000003", ov) is person
    assert apply_draft(person, "0000000002", {}) is person
