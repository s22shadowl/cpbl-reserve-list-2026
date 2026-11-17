// Picker filters and the per-position rail counts. Run: node --test tests/frontend/*.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const ctx = vm.createContext({});
vm.runInContext(readFileSync(new URL("../../docs/filter.js", import.meta.url), "utf8"), ctx, { filename: "filter.js" });
const { posMatch, filterMatch, railCounts } = vm.runInContext("({posMatch,filterMatch,railCounts})", ctx);
const plain = o => JSON.parse(JSON.stringify(o));

const rookie = p => p.rk === "d" || p.rk === "c";
const R = [
  { id: "a", g: "P", no: "1", n: "王大明" },
  { id: "b", g: "P", no: "18", n: "陳小華", rk: "d" },
  { id: "c", g: "C", no: "108", n: "林一" },
  { id: "d", g: "I", no: "07", n: "王二" },
  { id: "e", g: "O", no: "55", n: "張三", rk: "c" },
];
const sel = new Set(["a", "c", "e"]);
const ids = (show, q) => R.filter(p => filterMatch(p, show, q, sel, rookie)).map(p => p.id);

test("posMatch: all matches everything, a letter matches only that group", () => {
  assert.deepEqual(R.filter(p => posMatch(p, "all")).map(p => p.id), ["a", "b", "c", "d", "e"]);
  assert.deepEqual(R.filter(p => posMatch(p, "P")).map(p => p.id), ["a", "b"]);
});
test("filterMatch: show filter all / kept / dropped / new", () => {
  assert.deepEqual(ids("all", ""), ["a", "b", "c", "d", "e"]);
  assert.deepEqual(ids("kept", ""), ["a", "c", "e"]);
  assert.deepEqual(ids("dropped", ""), ["b", "d"]);
  assert.deepEqual(ids("new", ""), ["b", "e"]);
});
test("filterMatch: search by name part, exact number, or number without leading zero", () => {
  assert.deepEqual(ids("all", "王"), ["a", "d"]);
  assert.deepEqual(ids("all", "108"), ["c"]);
  assert.deepEqual(ids("all", "7"), ["d"]);
  assert.deepEqual(ids("all", "07"), ["d"]);
  assert.deepEqual(ids("all", " 18 "), ["b"]);
  assert.deepEqual(ids("all", "   "), ["a", "b", "c", "d", "e"]);
});
test("filterMatch: show filter and search combine", () => {
  assert.deepEqual(ids("kept", "王"), ["a"]);
  assert.deepEqual(ids("dropped", "王"), ["d"]);
});
test("railCounts: kept and total per group and overall", () => {
  assert.deepEqual(plain(railCounts(R, sel, "PCIO")), {
    all: { kept: 3, tot: 5 }, P: { kept: 1, tot: 2 }, C: { kept: 1, tot: 1 }, I: { kept: 0, tot: 1 }, O: { kept: 1, tot: 1 },
  });
});
test("railCounts: groups with no players are zero, not missing", () => {
  const shown = R.filter(p => filterMatch(p, "dropped", "", sel, rookie));
  assert.deepEqual(plain(railCounts(shown, sel, "PCIO")), {
    all: { kept: 0, tot: 2 }, P: { kept: 0, tot: 1 }, C: { kept: 0, tot: 0 }, I: { kept: 0, tot: 1 }, O: { kept: 0, tot: 0 },
  });
});
test("railCounts: ignores players outside the given groups in per-group counts", () => {
  assert.deepEqual(plain(railCounts([{ id: "x", g: "Z" }], new Set(["x"]), "P")), { all: { kept: 1, tot: 1 }, P: { kept: 0, tot: 0 } });
});
