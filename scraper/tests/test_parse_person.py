from pathlib import Path

import pytest

from scraper.parse_person import cn_number, parse_draft, parse_person

FIX = Path(__file__).parent / "fixtures"


def read(name):
    return (FIX / name).read_text(encoding="utf-8")


@pytest.mark.parametrize("text,expected", [("一", 1), ("九", 9), ("十", 10), ("十二", 12), ("二十", 20), ("二十一", 21), ("7", 7)])
def test_cn_number(text, expected):
    assert cn_number(text) == expected


@pytest.mark.parametrize("text,expected", [
    ("富邦悍將2019年第一輪", (2019, 1)),
    ("台鋼雄鷹2023年第十二輪", (2023, 12)),
    ("味全龍2021年第3輪", (2021, 3)),
    ("", (None, None)),
    ("自主培訓", (None, None)),
])
def test_parse_draft(text, expected):
    assert parse_draft(text) == expected


def test_person_local():
    p = parse_person(read("person_0000005479.html"))
    assert (p.born, p.nationality, p.draft_year, p.draft_round) == ("1997-12-29", "中華民國", 2019, 1)


def test_person_foreign():
    p = parse_person(read("person_0000006749.html"))
    assert (p.born, p.nationality, p.draft_year, p.draft_round) == ("1992-11-20", "美國", None, None)


def test_person_missing_brief_raises():
    with pytest.raises(ValueError):
        parse_person("<html></html>")


@pytest.mark.parametrize("text", ["1十", "x"])
def test_cn_number_invalid_raises_value_error(text):
    with pytest.raises(ValueError):
        cn_number(text)
