// Fake fan picks for the LOCAL D1 only (roadmap P1-3): `npm run db:seed` writes .wrangler/seed-dev.sql and runs it
// with `wrangler d1 execute DB --local`. Inserting SQL directly bypasses the per-IP rate limit.
// Picks lean on purpose: some players are near-unanimous keeps/drops, some split, some go against docs/data/official.sample.json.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const SEED_PREFIX = "5eed0000-";
const LIMIT = 60;

function rng(seed) { // mulberry32
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const shuffle = (list, r) => { const a = [...list]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const hex = (r, n) => Array.from({ length: n }, () => Math.floor(r() * 16).toString(16)).join("");
const team_seed = code => [...code].reduce((s, ch) => s * 31 + ch.charCodeAt(0), 7);

// Keep probability per player id for one team.
function leanings(players, officialIds, r) {
  const o = new Set(officialIds), P = {};
  const kept = shuffle(players.filter(p => o.has(p.id)), r), dropped = shuffle(players.filter(p => !o.has(p.id)), r);
  const first = list => list.filter(p => p.l === "一軍"), farm = list => list.filter(p => p.l !== "一軍");
  const take = (list, n, prob) => { for (const p of list.filter(p => !(p.id in P)).slice(0, n)) P[p.id] = typeof prob === "function" ? prob() : prob; };
  take(first(kept), 9, () => .94 + r() * .05);            // near-unanimous keep
  take(farm(kept), 4, () => .08 + r() * .2);               // club kept, fans would drop (爆冷)
  take(kept, 6, () => .38 + r() * .24);                    // split
  for (const p of kept) if (!(p.id in P)) P[p.id] = .9;    // the rest: fans mostly agree
  take([...first(dropped), ...dropped.filter(p => p.rk), ...dropped], 3, () => .8 + r() * .15);           // fans keep, club dropped (爆冷)
  take(dropped, 3, () => .38 + r() * .24);                 // split
  take(dropped, 8, () => .01 + r() * .04);                 // near-unanimous drop
  for (const p of dropped) if (!(p.id in P)) P[p.id] = .1;
  return P;
}

export function buildSeed({ teams, official, perTeam = 50 }) {
  const out = {};
  for (const [code, team] of Object.entries(teams)) {
    if (!official[code]) continue;
    const r = rng(team_seed(code)), P = leanings(team.players, official[code], r);
    out[code] = Array.from({ length: perTeam }, () => {
      const voter = SEED_PREFIX + `${hex(r, 4)}-4${hex(r, 3)}-8${hex(r, 3)}-${hex(r, 12)}`;
      const ids = team.players.filter(p => r() < P[p.id]).map(p => p.id);
      return { voter, ids: shuffle(ids, r).slice(0, LIMIT).sort() };
    });
  }
  return out;
}

export function toSql(seed, now = new Date().toISOString()) {
  const lines = [`DELETE FROM picks WHERE voter LIKE '${SEED_PREFIX}%';`];
  for (const [code, picks] of Object.entries(seed))
    for (const { voter, ids } of picks)
      lines.push(`INSERT INTO picks (team, voter, ids, ip_hash, created_at, updated_at) VALUES ('${code}', '${voter}', '${JSON.stringify(ids)}', NULL, '${now}', '${now}');`);
  lines.push("DELETE FROM tally; -- rebuilt from picks on the next /stats");
  return lines.join("\n") + "\n";
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const read = f => JSON.parse(readFileSync(new URL("../../docs/data/" + f, import.meta.url), "utf8"));
  const seed = buildSeed({ teams: read("teams.json").teams, official: read("official.sample.json").teams });
  const dir = new URL("../.wrangler/", import.meta.url);
  mkdirSync(dir, { recursive: true });
  writeFileSync(new URL("seed-dev.sql", dir), toSql(seed));
  console.log(`wrote worker/.wrangler/seed-dev.sql (${Object.values(seed).flat().length} picks)`);
}
