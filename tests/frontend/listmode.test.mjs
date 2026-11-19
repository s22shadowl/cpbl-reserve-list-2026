// Cut/pick list mode helpers. Run: node --test tests/frontend/*.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const src = new URL("../../docs/listmode.js", import.meta.url);
const ctx = vm.createContext({});
vm.runInContext(readFileSync(src, "utf8"), ctx, { filename: fileURLToPath(src) });
const { normListMode, otherListMode, listModeStart, listModePristine, listModeOver } =
  vm.runInContext("({normListMode,otherListMode,listModeStart,listModePristine,listModeOver})", ctx);
const S = (...ids) => new Set(ids);
const arr = s => [...s].sort();

test("normListMode: only 'pick' is pick", () => {
  for (const v of [undefined, null, "x", "cut"]) assert.equal(normListMode(v), "cut");
  assert.equal(normListMode("pick"), "pick");
});
test("otherListMode flips", () => {
  assert.equal(otherListMode("cut"), "pick");
  assert.equal(otherListMode("pick"), "cut");
});
test("listModeStart: cut = everyone, pick = nobody", () => {
  assert.deepEqual(arr(listModeStart("cut", ["a", "b"])), ["a", "b"]);
  assert.equal(listModeStart("pick", ["a", "b"]).size, 0);
});
test("listModePristine compares against the starting set", () => {
  assert.equal(listModePristine("cut", S("a", "b"), ["a", "b"]), true);
  assert.equal(listModePristine("cut", S("a"), ["a", "b"]), false);
  assert.equal(listModePristine("pick", S(), ["a", "b"]), true);
  assert.equal(listModePristine("pick", S("a"), ["a", "b"]), false);
});
test("listModeOver", () => {
  assert.equal(listModeOver(75, 60), 15);
  assert.equal(listModeOver(60, 60), 0);
  assert.equal(listModeOver(58, 60), 0);
});

test("listModePristine: same size but different content is not pristine", () => {
  assert.equal(listModePristine("cut", S("a", "c"), ["a", "b"]), false);
});
