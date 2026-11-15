// Submit-button / status decision. Run: node --test scripts/
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const ctx = vm.createContext({});
vm.runInContext(readFileSync(new URL("../docs/status.js", import.meta.url), "utf8"), ctx, { filename: "status.js" });
const { saveState } = vm.runInContext("({saveState})", ctx);
const S = (...ids) => new Set(ids);
const plain = o => JSON.parse(JSON.stringify(o));
const st = o => plain(saveState({ saving: false, online: true, saved: S(), sel: S(), ...o }));

test("saving: locked", () => {
  assert.deepEqual(st({ saving: true, sel: S("a") }), { kind: "saving", disabled: true });
});
test("still connecting: enabled only with a selection", () => {
  assert.deepEqual(st({ online: false, saved: null }), { kind: "connecting", disabled: true });
  assert.deepEqual(st({ online: false, saved: null, sel: S("a") }), { kind: "connecting", disabled: false });
});
test("nothing selected and nothing submitted: locked", () => {
  assert.deepEqual(st({}), { kind: "empty", disabled: true });
  assert.deepEqual(st({ saved: null }), { kind: "empty", disabled: true });
});
test("new selection not yet submitted: enabled", () => {
  assert.deepEqual(st({ sel: S("a") }), { kind: "unsent", disabled: false });
});
test("edited after submitting: enabled", () => {
  assert.deepEqual(st({ saved: S("a"), sel: S("a", "b") }), { kind: "changed", disabled: false });
});
test("regression: cleared after submitting must allow withdrawing", () => {
  assert.deepEqual(st({ saved: S("a", "b"), sel: S() }), { kind: "changed", disabled: false });
});
test("regression: cleared after submitting while offline still allows withdrawing", () => {
  assert.deepEqual(st({ online: false, saved: S("a"), sel: S() }), { kind: "changed", disabled: false });
});
test("matches what was submitted: locked", () => {
  assert.deepEqual(st({ saved: S("a", "b"), sel: S("b", "a") }), { kind: "sent", disabled: true });
});
