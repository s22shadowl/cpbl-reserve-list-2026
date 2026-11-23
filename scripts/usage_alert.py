"""Alert when today's Workers requests (whole account, UTC day) pass a threshold.

The Workers free plan allows 100,000 requests per account per day, reset at
00:00 UTC; past it every request answers error 1027. Run on a schedule by
.github/workflows/usage-alert.yml: when over the threshold it writes over=true and
the UTC day to $GITHUB_OUTPUT, and the workflow opens one issue per day (GitHub
emails the owner once). A failed query exits non-zero, so a broken token is not silent.

Env: CF_API_TOKEN (Account Analytics: Read), CF_ACCOUNT_ID, THRESHOLD (default 70000).
Stdlib only, so the workflow needs no dependency install.
"""

import json
import os
import sys
import urllib.request
from datetime import datetime, timezone

API = "https://api.cloudflare.com/client/v4/graphql"
DAILY_LIMIT = 100_000
QUERY = """
query ($account: String!, $start: Time!, $end: Time!) {
  viewer {
    accounts(filter: {accountTag: $account}) {
      workersInvocationsAdaptive(limit: 1000, filter: {datetime_geq: $start, datetime_lt: $end}) {
        dimensions { scriptName }
        sum { requests }
      }
    }
  }
}
"""


def day_start(now: datetime) -> str:
    return now.astimezone(timezone.utc).strftime("%Y-%m-%dT00:00:00Z")


def summarize(resp: dict) -> tuple[int, dict[str, int]]:
    if resp.get("errors"):
        raise RuntimeError("; ".join(e.get("message", str(e)) for e in resp["errors"]))
    by_script: dict[str, int] = {}
    for account in resp["data"]["viewer"]["accounts"]:
        for g in account["workersInvocationsAdaptive"]:
            name = g["dimensions"]["scriptName"]
            by_script = {**by_script, name: by_script.get(name, 0) + g["sum"]["requests"]}
    return sum(by_script.values()), by_script


def fetch(token: str, account: str, now: datetime) -> dict:
    body = json.dumps({"query": QUERY, "variables": {
        "account": account, "start": day_start(now), "end": now.strftime("%Y-%m-%dT%H:%M:%SZ")}}).encode()
    req = urllib.request.Request(API, data=body, headers={
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
        # Cloudflare answers 403 to Python's default User-Agent.
        "User-Agent": "Mozilla/5.0 (usage-alert)",
    })
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)


def report(total: int, by_script: dict[str, int], threshold: int, now: datetime) -> str:
    lines = [f"Workers requests since {day_start(now)} (UTC): **{total:,}** / {DAILY_LIMIT:,}"
             f" (alert at {threshold:,})", ""]
    lines += [f"- `{name}`: {n:,}" for name, n in sorted(by_script.items(), key=lambda kv: -kv[1])]
    return "\n".join(lines)


def main() -> int:
    token, account = os.environ.get("CF_API_TOKEN"), os.environ.get("CF_ACCOUNT_ID")
    if not token or not account:
        print("CF_API_TOKEN and CF_ACCOUNT_ID must be set", file=sys.stderr)
        return 2
    threshold = int(os.environ.get("THRESHOLD") or 70_000)
    now = datetime.now(timezone.utc)
    total, by_script = summarize(fetch(token, account, now))
    text = report(total, by_script, threshold, now)
    print(text)
    summary = os.environ.get("GITHUB_STEP_SUMMARY")
    if summary:
        with open(summary, "a", encoding="utf-8") as f:
            f.write(text + "\n")
    over = total >= threshold
    if over:
        print(f"::warning::Workers requests today {total:,} >= {threshold:,} (free limit {DAILY_LIMIT:,})")
    out = os.environ.get("GITHUB_OUTPUT")
    if out:
        with open(out, "a", encoding="utf-8") as f:
            f.write(f"over={'true' if over else 'false'}\nday={day_start(now)[:10]}\ntotal={total}\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
