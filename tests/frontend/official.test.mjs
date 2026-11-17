import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = new URL("../../docs/", import.meta.url);

const ctx = vm.createContext({});
for (const f of ["limit.js", "official.js"]) vm.runInContext(readFileSync(new URL(f, root), "utf8"), ctx, { filename: fileURLToPath(new URL(f, root)) });
const { offOverlap, offFanAverage, offConsensus, offUpsets, offAnswer, offDate, OFF_MIN_N, LIMIT } =
  vm.runInContext("({offOverlap,offFanAverage,offConsensus,offUpsets,offAnswer,offDate,OFF_MIN_N,LIMIT})", ctx);
const plain = o => JSON.parse(JSON.stringify(o));

// roster p1..p6, position order = id order
const roster = ["p1", "p2", "p3", "p4", "p5", "p6"].map((id, i) => ({ id, n: id, g: "P", no: String(i + 1) }));
const cmp = (a, b) => +a.no - +b.no;
const ids = list => list.map(x => x.p.id);

test("constants", () => {
  assert.equal(OFF_MIN_N, 10);
  assert.equal(LIMIT, 60);
});

test("overlap counts shared ids and lists both kinds of difference", () => {
  const r = offOverlap(["a", "b", "c"], ["b", "c", "d"]);
  assert.deepEqual(plain(r), { x: 2, denom: 3, mineOnly: ["a"], officialOnly: ["d"] });
});
test("overlap denominator is capped at 60 and uses my count when smaller", () => {
  const many = Array.from({ length: 60 }, (_, i) => "i" + i);
  assert.equal(offOverlap(many, many).denom, 60);
  assert.equal(offOverlap(["a"], ["a", "b"]).denom, 1);
  assert.equal(offOverlap(Array.from({ length: 61 }, (_, i) => "i" + i), many).denom, 60);
});
test("overlap is null when I have no list", () => {
  assert.equal(offOverlap([], ["a"]), null);
  assert.equal(offOverlap(null, ["a"]), null);
});

test("fan average sums keep counts of officially kept players over list count", () => {
  assert.equal(offFanAverage({ a: 10, b: 5, c: 9 }, 10, ["a", "b", "z"]), 1.5);
  assert.equal(offFanAverage({}, 10, ["a"]), 0);
  assert.equal(offFanAverage({ a: 3 }, 0, ["a"]), 0);
});

// counts out of N=10: p1 9, p2 8, p3 5, p4 5, p5 2, p6 1
const counts = { p1: 9, p2: 8, p3: 5, p4: 5, p5: 2, p6: 1 };
test("consensus top uses count desc then position order, cut at the limit", () => {
  const r = offConsensus(roster, counts, 10, 3, cmp);
  assert.deepEqual(ids(r.top), ["p1", "p2", "p3"]);
  assert.deepEqual(ids(r.rest), ["p4", "p5", "p6"]);
  assert.equal(r.top[0].r, 0.9);
});

test("upsets: fans keep >=70% but club dropped; fans <=30% but club kept; max 3 each, most extreme first", () => {
  const rows = ["a", "b", "c", "d", "e", "f", "g", "h"].map((id, i) => ({ id, n: id, g: "P", no: String(i + 1) }));
  const c = { a: 10, b: 9, c: 8, d: 7, e: 6, f: 0, g: 1, h: 2 };
  const official = ["f", "g", "h", "e"]; // a-d dropped though loved; f-h kept though not; e kept normally
  const u = offUpsets(rows, c, 10, official);
  assert.deepEqual(u.dropped.map(x => x.p.id), ["a", "b", "c"]);
  assert.deepEqual(u.kept.map(x => x.p.id), ["f", "g", "h"]);
  const edge = offUpsets(rows, { ...c, a: 7, b: 3 }, 10, ["f"]);
  assert.deepEqual(edge.dropped.map(x => x.p.id), ["c", "a", "d"]); // .70 counts, ties by roster order
  assert.deepEqual(offUpsets(rows, { ...c, f: 3, g: 4 }, 10, ["f", "g"]).kept.map(x => x.p.id), ["f"]); // .30 counts, .40 not
});

test("answer: gate below 10 lists leaves only my overlap", () => {
  const a = offAnswer({ roster, counts, N: 9, saved: ["p1"], official: ["p1", "p2"], limit: 3, cmp });
  assert.equal(a.mine.x, 1);
  assert.equal(a.diff, null);
  assert.equal(a.upsets, null);
  assert.equal(a.fanAvg, null);
});
test("answer: with N>=10 builds two diff columns sorted by keep rate", () => {
  // club keeps p3 p5 p6; consensus top-3 is p1 p2 p3
  const a = offAnswer({ roster, counts, N: 10, saved: new Set(["p1", "p5"]), official: ["p3", "p5", "p6"], limit: 3, cmp });
  assert.deepEqual(ids(a.diff.fanKeepClubDrop), ["p1", "p2"]);
  assert.deepEqual(ids(a.diff.fanDropClubKeep), ["p5", "p6"]);
  assert.equal(a.fanAvg, (5 + 2 + 1) / 10);
  assert.deepEqual(plain(a.mine), { x: 1, denom: 2, mineOnly: ["p1"], officialOnly: ["p3", "p6"] });
  assert.equal(a.upsets.dropped.length, 2); // p1 .9, p2 .8 dropped
  assert.equal(a.upsets.kept.length, 2); // p5 .2, p6 .1 kept
});
test("answer: no list of mine still gives the fan view", () => {
  const a = offAnswer({ roster, counts, N: 10, saved: new Set(), official: ["p3"], limit: 3, cmp });
  assert.equal(a.mine, null);
  assert.equal(a.mineState, "none");
  assert.ok(a.diff);
});
test("answer: hit rate comes only from the submitted list; unknown while /mine has not answered", () => {
  const ok = offAnswer({ roster, counts, N: 10, saved: new Set(["p3", "p4"]), official: ["p3", "p5"], limit: 3, cmp });
  assert.equal(ok.mineState, "ok");
  assert.deepEqual(plain(ok.mine), { x: 1, denom: 2, mineOnly: ["p4"], officialOnly: ["p5"] });
  const unknown = offAnswer({ roster, counts, N: 10, saved: null, official: ["p3"], limit: 3, cmp });
  assert.equal(unknown.mineState, "unknown");
  assert.equal(unknown.mine, null);
  assert.ok(unknown.diff, "fan view does not depend on my list");
  // There is no draft parameter: an old `mine` argument is ignored rather than scored.
  assert.equal(offAnswer({ roster, counts, N: 10, mine: ["p3"], saved: new Set(), official: ["p3"], limit: 3, cmp }).mine, null);
});
test("offDate: M/D without leading zeros, empty when missing", () => {
  assert.equal(offDate("2026-11-30"), "11/30");
  assert.equal(offDate("2026-12-01"), "12/1");
  assert.equal(offDate(""), "");
  assert.equal(offDate(undefined), "");
  assert.equal(offDate("11/30"), "");
});
