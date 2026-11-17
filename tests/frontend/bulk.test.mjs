// Group-header bulk select/deselect decision. Run: node --test tests/frontend/*.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const src = new URL("../../docs/bulk.js", import.meta.url);

const ctx = vm.createContext({});
vm.runInContext(readFileSync(src, "utf8"), ctx, { filename: fileURLToPath(src) });
const { bulkState } = vm.runInContext("({bulkState})", ctx);
const plain = o => JSON.parse(JSON.stringify(o));

test("none selected and fits: add, enabled", () => {
  assert.deepEqual(plain(bulkState(["a", "b", "c"], new Set(), 60)), { mode: "add", need: 3, left: 60, disabled: false });
});
test("partially selected: add only the unselected", () => {
  assert.deepEqual(plain(bulkState(["a", "b", "c"], new Set(["a", "x"]), 60)), { mode: "add", need: 2, left: 58, disabled: false });
});
test("all shown selected: remove, never disabled even when full", () => {
  assert.deepEqual(plain(bulkState(["a", "b"], new Set(["a", "b"]), 2)), { mode: "remove", need: 0, left: 0, disabled: false });
});
test("need greater than left: add disabled", () => {
  const sel = new Set(Array.from({ length: 55 }, (_, i) => "s" + i));
  const ids = Array.from({ length: 8 }, (_, i) => "o" + i);
  assert.deepEqual(plain(bulkState(ids, sel, 60)), { mode: "add", need: 8, left: 5, disabled: true });
});
test("need equal to left: add enabled", () => {
  const sel = new Set(Array.from({ length: 55 }, (_, i) => "s" + i));
  const ids = Array.from({ length: 5 }, (_, i) => "c" + i);
  assert.deepEqual(plain(bulkState(ids, sel, 60)), { mode: "add", need: 5, left: 5, disabled: false });
});
test("empty list: add with nothing to add, disabled", () => {
  assert.deepEqual(plain(bulkState([], new Set(["a"]), 60)), { mode: "add", need: 0, left: 59, disabled: true });
});
