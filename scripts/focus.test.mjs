// Keyboard focus after a tile toggle re-renders the grid. Run: node --test scripts/
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const ctx = vm.createContext({});
vm.runInContext(readFileSync(new URL("../docs/focus.js", import.meta.url), "utf8"), ctx, { filename: "focus.js" });
const { nextFocusId } = vm.runInContext("({nextFocusId})", ctx);

test("keeps focus on the same tile when it is still shown", () => {
  assert.equal(nextFocusId(["a", "b", "c"], ["a", "b", "c"], "b"), "b");
});
test("moves to the following tile when the toggled one is filtered out", () => {
  assert.equal(nextFocusId(["a", "b", "c"], ["a", "c"], "b"), "c");
});
test("falls back to the previous tile when the last one disappears", () => {
  assert.equal(nextFocusId(["a", "b", "c"], ["a", "b"], "c"), "b");
});
test("skips tiles missing from nextIds (e.g. filtered out by the 已保留 filter)", () => {
  assert.equal(nextFocusId(["a", "b", "c", "d"], ["a", "d"], "b"), "d");
  assert.equal(nextFocusId(["a", "b", "c", "d"], ["a"], "c"), "a");
});
test("returns null when nothing is left or nothing was focused", () => {
  assert.equal(nextFocusId(["a"], [], "a"), null);
  assert.equal(nextFocusId(["a", "b"], ["a", "b"], null), null);
});
test("does not mutate its inputs", () => {
  const prev = ["a", "b", "c"], next = ["a", "c"];
  nextFocusId(prev, next, "b");
  assert.deepEqual(prev, ["a", "b", "c"]);
  assert.deepEqual(next, ["a", "c"]);
});
