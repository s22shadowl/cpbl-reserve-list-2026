import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const ctx = vm.createContext({});
vm.runInContext(readFileSync(new URL("../../docs/mine.js", import.meta.url), "utf8"), ctx, { filename: "mine.js" });
const { mineVsFans, MINE_MIN_OTHERS, MINE_LOW, MINE_HIGH } =
  vm.runInContext("({mineVsFans,MINE_MIN_OTHERS,MINE_LOW,MINE_HIGH})", ctx);
const plain = o => JSON.parse(JSON.stringify(o));

const roster = ["p1", "p2", "p3", "p4", "p5", "p6"].map((id, i) => ({ id, n: id, g: "P", no: String(i + 1) }));
const cmp = (a, b) => +a.no - +b.no;
const ids = list => list.map(x => x.p.id);

test("constants match the roadmap spec", () => {
  assert.equal(MINE_MIN_OTHERS, 10);
  assert.equal(MINE_LOW, 0.3);
  assert.equal(MINE_HIGH, 0.7);
});

test("not submitted (null or empty) -> unsent", () => {
  assert.deepEqual(plain(mineVsFans({ roster, counts: {}, N: 50, saved: null, cmp })), { state: "unsent" });
  assert.deepEqual(plain(mineVsFans({ roster, counts: {}, N: 50, saved: new Set(), cmp })), { state: "unsent" });
});

test("fewer than 10 other lists -> few, own list not counted", () => {
  const r = plain(mineVsFans({ roster, counts: {}, N: 10, saved: new Set(["p1"]), cmp }));
  assert.deepEqual(r, { state: "few", others: 9 });
  assert.equal(mineVsFans({ roster, counts: {}, N: 11, saved: new Set(["p1"]), cmp }).state, "ok");
});

test("own vote is removed from the rate", () => {
  // N=11 -> 10 others. p1: 4 votes incl. mine -> 3/10 = 30% (kept-low, inclusive)
  // p2: 8 votes, not mine -> 8/10 = 80% (dropped-high)
  const counts = { p1: 4, p2: 8 };
  const r = mineVsFans({ roster, counts, N: 11, saved: new Set(["p1"]), cmp });
  assert.deepEqual(ids(r.keptLow), ["p1"]);
  assert.equal(r.keptLow[0].r, 0.3);
  assert.deepEqual(ids(r.droppedHigh), ["p2"]);
  assert.equal(r.droppedHigh[0].r, 0.8);
});

test("thresholds are inclusive and exclusive just past them", () => {
  // 10 others. kept: p1 3/10 (in), p2 4/10 (out). dropped: p3 7/10 (in), p4 6/10 (out)
  const counts = { p1: 4, p2: 5, p3: 7, p4: 6 };
  const r = mineVsFans({ roster, counts, N: 11, saved: new Set(["p1", "p2"]), cmp });
  assert.deepEqual(ids(r.keptLow), ["p1"]);
  assert.deepEqual(ids(r.droppedHigh), ["p3"]);
});

test("sorted by distance from the majority, ties by roster order", () => {
  // kept-low ascending rate: p3 0%, p1 10%, p2 10%
  // dropped-high descending rate: p6 100%, p4 90%, p5 90%
  const counts = { p1: 2, p2: 2, p3: 1, p4: 9, p5: 9, p6: 10 };
  const r = mineVsFans({ roster, counts, N: 11, saved: new Set(["p1", "p2", "p3"]), cmp });
  assert.deepEqual(ids(r.keptLow), ["p3", "p1", "p2"]);
  assert.deepEqual(ids(r.droppedHigh), ["p6", "p4", "p5"]);
});

test("stale stats without my vote never go negative", () => {
  const r = mineVsFans({ roster, counts: {}, N: 11, saved: new Set(["p1"]), cmp });
  assert.equal(r.keptLow[0].r, 0);
});

test("saved ids outside the roster are ignored", () => {
  const r = mineVsFans({ roster, counts: { gone: 5 }, N: 11, saved: new Set(["gone", "p1"]), cmp });
  assert.deepEqual(ids(r.keptLow), ["p1"]);
});
