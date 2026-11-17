// Colour-mode cycling. Run: node --test tests/frontend/*.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const src = new URL("../../docs/prefs.js", import.meta.url);

const ctx = vm.createContext({});
vm.runInContext(readFileSync(src, "utf8"), ctx, { filename: fileURLToPath(src) });
const { nextMode, normMode } = vm.runInContext("({nextMode,normMode})", ctx);

test("cycles auto -> light -> dark -> auto", () => {
  assert.equal(nextMode("auto"), "light");
  assert.equal(nextMode("light"), "dark");
  assert.equal(nextMode("dark"), "auto");
});
test("unknown or missing stored values count as auto", () => {
  for (const v of [null, undefined, "", "blue", 3]) {
    assert.equal(normMode(v), "auto");
    assert.equal(nextMode(v), "light");
  }
});
