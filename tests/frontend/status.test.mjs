// Submit-button / status decision. Run: node --test tests/frontend/*.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const src = new URL("../../docs/status.js", import.meta.url);

const ctx = vm.createContext({});
vm.runInContext(readFileSync(src, "utf8"), ctx, { filename: fileURLToPath(src) });
const { saveState, sameTally, needsConfirm, submitError, statsStale, hhmm, STATS_STALE_MS } =
  vm.runInContext("({saveState,sameTally,needsConfirm,submitError,statsStale,hhmm,STATS_STALE_MS})", ctx);
const S = (...ids) => new Set(ids);
const plain = o => JSON.parse(JSON.stringify(o));
const st = o => plain(saveState({ saving: false, saved: S(), sel: S(), ...o }));
const SEND = "送出名單", WITHDRAW = "撤回名單";

test("saving: locked", () => {
  assert.deepEqual(st({ saving: true, sel: S("a") }), { kind: "saving", disabled: true, label: SEND, over: 0 });
});
test("still connecting: enabled only with a selection", () => {
  assert.deepEqual(st({ saved: null }), { kind: "connecting", disabled: true, label: SEND, over: 0 });
  assert.deepEqual(st({ saved: null, sel: S("a") }), { kind: "connecting", disabled: false, label: SEND, over: 0 });
});
test("/mine failed: unknown, still enabled with a selection", () => {
  assert.deepEqual(st({ saved: null, mineFailed: true }), { kind: "unknown", disabled: true, label: SEND, over: 0 });
  assert.deepEqual(st({ saved: null, mineFailed: true, sel: S("a") }), { kind: "unknown", disabled: false, label: SEND, over: 0 });
});
test("nothing selected and nothing submitted: locked", () => {
  assert.deepEqual(st({}), { kind: "empty", disabled: true, label: SEND, over: 0 });
});
test("new selection not yet submitted: enabled", () => {
  assert.deepEqual(st({ sel: S("a") }), { kind: "unsent", disabled: false, label: SEND, over: 0 });
});
test("edited after submitting: enabled", () => {
  assert.deepEqual(st({ saved: S("a"), sel: S("a", "b") }), { kind: "changed", disabled: false, label: SEND, over: 0 });
});
test("regression: cleared after submitting must allow withdrawing, labelled 撤回名單", () => {
  assert.deepEqual(st({ saved: S("a", "b"), sel: S() }), { kind: "changed", disabled: false, label: WITHDRAW, over: 0 });
  assert.equal(st({ saving: true, saved: S("a"), sel: S() }).label, WITHDRAW);
});
test("matches what was submitted: locked", () => {
  assert.deepEqual(st({ saved: S("a", "b"), sel: S("b", "a") }), { kind: "sent", disabled: true, label: SEND, over: 0 });
});
test("official lists out (Worker locked): always disabled, whatever is selected or submitted", () => {
  const locked = { kind: "locked", disabled: true, label: "已截止", over: 0 };
  assert.deepEqual(st({ locked: true }), locked);
  assert.deepEqual(st({ locked: true, sel: S("a") }), locked);
  assert.deepEqual(st({ locked: true, saved: S("a"), sel: S() }), locked);
  assert.deepEqual(st({ locked: true, saved: null, sel: S("a") }), locked);
  assert.equal(st({ locked: true, saving: true }).kind, "saving");
});

test("needsConfirm: only a partial list (1..limit-1) needs a second press", () => {
  assert.equal(needsConfirm(0, 60), false);
  assert.equal(needsConfirm(1, 60), true);
  assert.equal(needsConfirm(59, 60), true);
  assert.equal(needsConfirm(60, 60), false);
});

test("submitError maps the Worker error code to a message", () => {
  assert.equal(submitError("rate_limited", 429), "今日已達到送出次數上限");
  assert.equal(submitError(undefined, 429), "今日已達到送出次數上限");
  assert.equal(submitError("bad_ids", 400), "名單已更新，請重新整理");
  assert.equal(submitError("locked", 403), "送出已截止");
  for (const [code, status] of [[undefined, undefined], ["server_error", 500], ["bad_json", 400]])
    assert.equal(submitError(code, status), "請稍後再試");
});

// loadStats() skips re-rendering when /stats returns what is already shown.
test("sameTally: equal n and counts regardless of key order", () => {
  assert.equal(sameTally({ n: 2, counts: { a: 1, b: 2 } }, { n: 2, counts: { b: 2, a: 1 } }), true);
  assert.equal(sameTally({ n: 0, counts: {} }, { n: 0, counts: {} }), true);
});
test("sameTally: any difference, a missing side or an error placeholder means changed", () => {
  assert.equal(sameTally({ n: 2, counts: { a: 1 } }, { n: 3, counts: { a: 1 } }), false);
  assert.equal(sameTally({ n: 2, counts: { a: 1 } }, { n: 2, counts: { a: 2 } }), false);
  assert.equal(sameTally({ n: 2, counts: { a: 1 } }, { n: 2, counts: { a: 1, b: 0 } }), false);
  assert.equal(sameTally(null, { n: 0, counts: {} }), false);
  assert.equal(sameTally({ error: true }, { n: 0, counts: {} }), false);
});

test("statsStale: never loaded or older than 60 s", () => {
  assert.equal(STATS_STALE_MS, 60000);
  assert.equal(statsStale(0, 1000), true);
  assert.equal(statsStale(1000, 1000 + 60000), false);
  assert.equal(statsStale(1000, 1000 + 60001), true);
  assert.equal(statsStale(1000, 2000, 500), true);
});

test("hhmm: zero-padded local time, empty for missing or invalid input", () => {
  assert.equal(hhmm(new Date(2026, 10, 30, 9, 5).getTime()), "09:05");
  assert.equal(hhmm(new Date(2026, 10, 30, 23, 59).getTime()), "23:59");
  assert.equal(hhmm(null), "");
  assert.equal(hhmm(undefined), "");
  assert.equal(hhmm("nope"), "");
});

test("limit: over the cap disables send but keeps the kind; saving/locked keep priority", () => {
  const ids = n => S(...Array.from({ length: n }, (_, i) => "p" + i));
  assert.deepEqual(st({ sel: ids(61), limit: 60 }), { kind: "unsent", disabled: true, label: SEND, over: 1 });
  assert.deepEqual(st({ sel: ids(61), limit: 60, locked: true }), { kind: "locked", disabled: true, label: "已截止", over: 1 });
  assert.equal(st({ sel: ids(61), limit: 60, saving: true }).kind, "saving");
  assert.deepEqual(st({ sel: ids(60), limit: 60 }), { kind: "unsent", disabled: false, label: SEND, over: 0 });
  assert.deepEqual(st({ sel: ids(61) }), { kind: "unsent", disabled: false, label: SEND, over: 0 });
  assert.deepEqual(st({ saved: null, sel: ids(61), limit: 60 }), { kind: "connecting", disabled: true, label: SEND, over: 1 });
});
