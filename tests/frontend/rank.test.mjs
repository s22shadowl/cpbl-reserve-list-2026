// Stats ranking split (top 20, toggle, 21–60, cut row, 61+). Run: node --test tests/frontend/*.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const src = new URL("../../docs/rank.js", import.meta.url);

const ctx = vm.createContext({});
vm.runInContext(readFileSync(src, "utf8"), ctx, { filename: fileURLToPath(src) });
const { RANK_PREVIEW, rankParts, rankToggleText } = vm.runInContext("({RANK_PREVIEW,rankParts,rankToggleText})", ctx);
const rows = n => Array.from({ length: n }, (_, i) => ({ rank: i + 1 }));
const ranks = a => a.map(x => x.rank);
const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

test("RANK_PREVIEW is 20", () => assert.equal(RANK_PREVIEW, 20));
test("rankParts: 1–20 head, 21–60 behind the toggle, 61+ tail", () => {
  const p = rankParts(rows(86), 20, 60);
  assert.equal(p.more, true);
  assert.deepEqual(ranks(p.head), range(1, 20));
  assert.deepEqual(ranks(p.mid), range(21, 60));
  assert.deepEqual(ranks(p.tail), range(61, 86));
});
test("rankParts: at most the limit, nothing past the cut", () => {
  for (const n of [21, 45, 60]) {
    const p = rankParts(rows(n), 20, 60);
    assert.equal(p.more, true);
    assert.deepEqual(ranks(p.mid), range(21, n));
    assert.equal(p.tail.length, 0);
  }
  assert.deepEqual(ranks(rankParts(rows(61), 20, 60).tail), [61]);
});
test("rankParts: 20 rows or fewer need no toggle", () => {
  for (const n of [0, 5, 20]) {
    const p = rankParts(rows(n), 20, 60);
    assert.equal(p.more, false);
    assert.equal(p.head.length, n);
    assert.equal(p.mid.length + p.tail.length, 0);
  }
});
test("rankParts: does not mutate the input", () => {
  const r = rows(70);
  rankParts(r, 20, 60);
  assert.equal(r.length, 70);
});
test("rankToggleText names the hidden range", () => {
  assert.equal(rankToggleText(86, false, 60, 20), "展開第 21～60 名");
  assert.equal(rankToggleText(86, true, 60, 20), "收起第 21～60 名");
  assert.equal(rankToggleText(60, false, 60, 20), "展開第 21～60 名");
  assert.equal(rankToggleText(45, false, 60, 20), "展開第 21～45 名");
  assert.equal(rankToggleText(45, true, 60, 20), "收起第 21～45 名");
  assert.equal(rankToggleText(21, false, 60, 20), "展開第 21 名");
});
