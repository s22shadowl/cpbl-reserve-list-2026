import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildSeed, SEED_PREFIX } from "./seed-dev.mjs";

const read = f => JSON.parse(readFileSync(new URL("../../docs/data/" + f, import.meta.url), "utf8"));
const teams = read("teams.json").teams, official = read("official.sample.json").teams;
const VOTER = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const seed = buildSeed({ teams, official, perTeam: 50 });

test("is deterministic", () => {
  assert.deepEqual(buildSeed({ teams, official, perTeam: 50 }), seed);
});
test("50 distinct, valid voters per team with at most 60 known ids each", () => {
  for (const [code, picks] of Object.entries(seed)) {
    assert.equal(picks.length, 50);
    assert.equal(new Set(picks.map(p => p.voter)).size, 50);
    const known = new Set(teams[code].players.map(p => p.id));
    for (const p of picks) {
      assert.match(p.voter, VOTER);
      assert.ok(p.voter.startsWith(SEED_PREFIX));
      assert.ok(p.ids.length <= 60 && p.ids.length >= 30);
      assert.equal(new Set(p.ids).size, p.ids.length);
      assert.ok(p.ids.every(id => known.has(id)));
    }
  }
});
test("preferences are skewed: near-unanimous, split and disagreeing with the club all appear", () => {
  for (const [code, picks] of Object.entries(seed)) {
    const c = {};
    for (const p of picks) for (const id of p.ids) c[id] = (c[id] || 0) + 1;
    const o = new Set(official[code]), rate = id => (c[id] || 0) / 50;
    const all = teams[code].players.map(p => p.id);
    assert.ok(all.filter(id => rate(id) >= .9).length >= 5, code + " near-unanimous keep");
    assert.ok(all.filter(id => rate(id) <= .1).length >= 5, code + " near-unanimous drop");
    assert.ok(all.filter(id => rate(id) >= .35 && rate(id) <= .65).length >= 4, code + " split");
    assert.ok(all.filter(id => !o.has(id) && rate(id) >= .7).length >= 2, code + " fans keep, club dropped");
    assert.ok(all.filter(id => o.has(id) && rate(id) <= .3).length >= 2, code + " fans drop, club kept");
  }
});
