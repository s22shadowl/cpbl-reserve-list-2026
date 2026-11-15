"""Turn parsed records into the docs/data/teams.json and worker/src/roster.json shapes."""

from typing import Dict, Iterable, Mapping, Optional, Tuple

from .classify import REASONS, exempt_reason, position_group
from .models import SEASON, PersonInfo, RosterEntry
from .parse_stats import BATTING, KINDS, PITCHING

# {(KindCode, Position): {player id: compact stats}} as parsed from the team score pages
StatTables = Mapping[Tuple[str, str], Mapping[str, dict]]


def season_record(entry: RosterEntry, tables: StatTables) -> dict:
    """Pitchers get pitching stats, everyone else batting; only levels the player appeared in."""
    position = PITCHING if position_group(entry.pos)[0] == "P" else BATTING
    rows = {kind: tables.get((kind, position), {}) for kind in KINDS}
    return {kind: dict(row[entry.id]) for kind, row in rows.items() if entry.id in row}


def player_record(entry: RosterEntry, person: PersonInfo, has_photo: bool,
                  tables: Optional[StatTables] = None, tag: Optional[str] = None, rookie: bool = False) -> dict:
    g, p = position_group(entry.pos)
    rec = {"id": entry.id, "n": entry.name, "no": entry.no, "g": g, "l": entry.level}
    if p:
        rec["p"] = p
    rec["ph"] = 1 if has_photo else 0
    optional = {"b": person.born, "dy": person.draft_year, "dr": person.draft_round}
    rec.update({k: v for k, v in optional.items() if v is not None})
    if tag:
        rec["tag"] = tag
    if person.draft_year == SEASON:
        rec["rk"] = "d"
    elif rookie:
        rec["rk"] = "c"
    season = season_record(entry, tables or {})
    if season:
        rec["s"] = season
    return rec


def build_team(
    entries: Iterable[RosterEntry],
    persons: Mapping[str, PersonInfo],
    overrides: dict,
    photo_ids: frozenset,
    tables: Optional[StatTables] = None,
) -> dict:
    players = []
    exempt: Dict[str, list] = {r: [] for r in REASONS}
    tags = overrides.get("tags", {})
    rookies = overrides.get("rookie", {})
    for e in entries:
        reason = exempt_reason(e, persons[e.id], overrides)
        if reason:
            exempt[reason].append(e.name)
        else:
            players.append(player_record(e, persons[e.id], e.id in photo_ids, tables, tags.get(e.id, {}).get("label"), e.id in rookies))
    return {"players": players, "exempt": exempt}


def build_outputs(teams: Mapping[str, dict], updated: str) -> Tuple[dict, dict]:
    teams_json = {"updated": updated, "teams": dict(teams)}
    roster_json = {code: sorted(p["id"] for p in t["players"]) for code, t in teams.items()}
    return teams_json, roster_json
