"""Turn parsed records into the docs/data/teams.json and worker/src/roster.json shapes."""

from typing import Dict, Iterable, Mapping, Tuple

from .classify import REASONS, exempt_reason, position_group
from .models import PersonInfo, RosterEntry


def player_record(entry: RosterEntry, person: PersonInfo, has_photo: bool) -> dict:
    g, p = position_group(entry.pos)
    rec = {"id": entry.id, "n": entry.name, "no": entry.no, "g": g, "l": entry.level}
    if p:
        rec["p"] = p
    rec["ph"] = 1 if has_photo else 0
    optional = {"b": person.born, "dy": person.draft_year, "dr": person.draft_round}
    rec.update({k: v for k, v in optional.items() if v is not None})
    return rec


def build_team(
    entries: Iterable[RosterEntry],
    persons: Mapping[str, PersonInfo],
    overrides: dict,
    photo_ids: frozenset,
) -> dict:
    players = []
    exempt: Dict[str, list] = {r: [] for r in REASONS}
    for e in entries:
        reason = exempt_reason(e, persons[e.id], overrides)
        if reason:
            exempt[reason].append(e.name)
        else:
            players.append(player_record(e, persons[e.id], e.id in photo_ids))
    return {"players": players, "exempt": exempt}


def build_outputs(teams: Mapping[str, dict], updated: str) -> Tuple[dict, dict]:
    teams_json = {"updated": updated, "teams": dict(teams)}
    roster_json = {code: sorted(p["id"] for p in t["players"]) for code, t in teams.items()}
    return teams_json, roster_json
