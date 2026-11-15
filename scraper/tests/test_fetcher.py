from pathlib import Path

import pytest
import requests

from scraper.fetcher import BASE_URL, CpblClient, FatalScraperError, RetryableScraperError

FIX = Path(__file__).parent / "fixtures"


class FakeResponse:
    def __init__(self, status=200, text="", content=b""):
        self.status_code, self.text, self.content = status, text, content


class FakeSession:
    """Plays back queued responses (or exceptions) and records every call."""

    def __init__(self, replies):
        self.replies, self.calls, self.headers = list(replies), [], {}

    def request(self, method, url, **kwargs):
        self.calls.append((method, url, kwargs))
        reply = self.replies.pop(0)
        if isinstance(reply, Exception):
            raise reply
        return reply


def client(replies):
    session = FakeSession(replies)
    return CpblClient(session=session, delay=0, sleep=lambda s: None), session


def test_retries_then_succeeds():
    c, s = client([FakeResponse(503), requests.ConnectionError("boom"), FakeResponse(200, text="ok")])
    assert c.person("0000000001") == "ok"
    assert len(s.calls) == 3
    assert s.calls[0][1] == BASE_URL + "/team/person?Acnt=0000000001"


def test_gives_up_after_three_attempts():
    c, _ = client([FakeResponse(500)] * 3)
    with pytest.raises(RetryableScraperError):
        c.person("0000000001")


def test_client_error_is_fatal_without_retry():
    c, s = client([FakeResponse(404)])
    with pytest.raises(FatalScraperError):
        c.person("0000000001")
    assert len(s.calls) == 1


def test_team_pages_posts_token_for_farm_team():
    first = (FIX / "team_AEO_A.html").read_text(encoding="utf-8")
    c, s = client([FakeResponse(200, text=first), FakeResponse(200, text="farm")])
    assert c.team_pages("AEO") == (first, "farm")
    method, url, kwargs = s.calls[1]
    assert (method, url) == ("POST", BASE_URL + "/team")
    assert kwargs["data"]["ClubNo"] == "AEO" and kwargs["data"]["KindCode"] == "D"
    assert len(kwargs["data"]["__RequestVerificationToken"]) > 20


def test_photo_path_is_url_encoded():
    c, s = client([FakeResponse(200, content=b"img")])
    assert c.photo("/files/atts/X/12江國豪2026.jpg") == b"img"
    assert s.calls[0][1] == BASE_URL + "/files/atts/X/12%E6%B1%9F%E5%9C%8B%E8%B1%AA2026.jpg"
