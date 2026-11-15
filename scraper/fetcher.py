"""HTTP access to www.cpbl.com.tw, ported from cpbl_takao_today_BE app/core/fetcher.py.

The site sits behind HiNet CDN: the first request answers 308 with a __chtcdn cookie and
redirects to the same URL. A requests.Session keeps that cookie, so plain requests works.
"""

import logging
import time
from typing import Callable, Dict, Optional, Tuple
from urllib.parse import quote

import requests

from .parse_stats import KINDS, POSITIONS
from .parse_team import parse_token

BASE_URL = "https://www.cpbl.com.tw"
USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/130.0 Safari/537.36"
)
TIMEOUT = 30
DELAY_SECONDS = 1.5
MAX_ATTEMPTS = 3

log = logging.getLogger(__name__)


class RetryableScraperError(Exception):
    """Temporary failure (5xx, timeout, connection); worth retrying."""


class FatalScraperError(Exception):
    """Permanent failure (4xx, unexpected page); do not retry."""


class CpblClient:
    def __init__(
        self,
        session: Optional[requests.Session] = None,
        delay: float = DELAY_SECONDS,
        sleep: Callable[[float], None] = time.sleep,
    ):
        self._session = session or requests.Session()
        self._session.headers.update({"User-Agent": USER_AGENT})
        self._delay = delay
        self._sleep = sleep

    def _once(self, method: str, url: str, **kwargs) -> requests.Response:
        try:
            resp = self._session.request(method, url, timeout=TIMEOUT, **kwargs)
        except requests.RequestException as e:
            raise RetryableScraperError(f"{method} {url} 失敗：{e}") from e
        if resp.status_code in (408, 429) or 500 <= resp.status_code < 600:
            raise RetryableScraperError(f"{method} {url} 暫時性錯誤 HTTP {resp.status_code}")
        if resp.status_code >= 400:
            raise FatalScraperError(f"{method} {url} 客戶端錯誤 HTTP {resp.status_code}")
        resp.encoding = "utf-8"
        return resp

    def _request(self, method: str, path: str, **kwargs) -> requests.Response:
        url = BASE_URL + path
        for attempt in range(1, MAX_ATTEMPTS + 1):
            self._sleep(self._delay)  # friendly pacing before every request
            try:
                return self._once(method, url, **kwargs)
            except RetryableScraperError as e:
                if attempt == MAX_ATTEMPTS:
                    raise
                log.warning("第 %d 次失敗，稍後重試：%s", attempt, e)
                self._sleep(self._delay * 2 ** attempt)
        raise AssertionError("unreachable")

    def team_pages(self, code: str) -> tuple:
        """Return (一軍 HTML, 二軍 HTML) for a team code such as 'AEO'."""
        first = self._request("GET", f"/team?ClubNo={code}").text
        farm = self._request(
            "POST",
            "/team",
            data={"__RequestVerificationToken": parse_token(first), "ClubNo": code, "KindCode": "D"},
            headers={"X-Requested-With": "XMLHttpRequest", "Referer": f"{BASE_URL}/team?ClubNo={code}"},
        ).text
        return first, farm

    def team_stats(self, code: str, season: int) -> Dict[Tuple[str, str], str]:
        """Return {(KindCode, Position): table HTML} for 一二軍 batting and pitching of one season."""
        page = f"/team/teamscore?ClubNo={code}"
        token = parse_token(self._request("GET", page).text)
        headers = {"X-Requested-With": "XMLHttpRequest", "Referer": BASE_URL + page}
        tables = {}
        for kind in KINDS:
            for position in POSITIONS:
                form = {
                    "__RequestVerificationToken": token, "ClubNo": code, "KindCode": kind, "Year": str(season),
                    "Position": position, "DefendStation": "", "Sortby": "01", "IndexOfPages": "1", "ExecAction": "Q",
                }
                tables[(kind, position)] = self._request("POST", "/team/teamscoreaction", data=form, headers=headers).text
        return tables

    def person(self, acnt: str) -> str:
        return self._request("GET", f"/team/person?Acnt={acnt}").text

    def photo(self, path: str) -> bytes:
        return self._request("GET", quote(path)).content
