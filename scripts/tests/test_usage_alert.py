from datetime import datetime, timezone

import pytest

from usage_alert import day_start, summarize


def resp(*rows):
    groups = [{"dimensions": {"scriptName": s}, "sum": {"requests": n}} for s, n in rows]
    return {"data": {"viewer": {"accounts": [{"workersInvocationsAdaptive": groups}]}}, "errors": None}


def test_day_start_is_utc_midnight_because_the_free_limit_resets_then():
    now = datetime(2026, 11, 23, 15, 30, tzinfo=timezone.utc)  # 23:30 in Taiwan
    assert day_start(now) == "2026-11-23T00:00:00Z"


def test_summarize_sums_every_script_because_the_limit_is_per_account():
    total, by_script = summarize(resp(("cpbl-reserve-2026-api", 60000), ("other", 500), ("other", 20)))
    assert total == 60520
    assert by_script == {"cpbl-reserve-2026-api": 60000, "other": 520}


def test_summarize_with_no_traffic_is_zero():
    assert summarize(resp()) == (0, {})


def test_summarize_raises_on_graphql_errors_so_the_run_fails_instead_of_staying_silent():
    with pytest.raises(RuntimeError, match="authentication"):
        summarize({"data": None, "errors": [{"message": "authentication error"}]})
