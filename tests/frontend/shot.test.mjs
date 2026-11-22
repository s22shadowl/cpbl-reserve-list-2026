// Share-image layout helpers. Run: node --test tests/frontend/shot.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const src = new URL("../../docs/shot.js", import.meta.url);
const ctx = vm.createContext({});
vm.runInContext(readFileSync(src, "utf8"), ctx, { filename: fileURLToPath(src) });
const { shotCells, shotRowHeights } = vm.runInContext("({shotCells,shotRowHeights})", ctx);
const plain = o => JSON.parse(JSON.stringify(o));
const pos = res => res.cells.map(c => `${c.n}@${c.r},${c.k}x${c.sp}`);
const fitsNot = (...longs) => n => !longs.includes(n);
const names = n => Array.from({ length: n }, (_, i) => "s" + i);

test("shotCells: simple row", () => {
  const r = plain(shotCells(["a", "b", "c"], 5, () => true));
  assert.equal(r.rows, 1);
  assert.deepEqual(r.cells.map(c => [c.k, c.sp]), [[0, 1], [1, 1], [2, 1]]);
});
test("shotCells: long fits in the last row's free cells", () => {
  const r = shotCells([...names(7), "L"], 5, fitsNot("L"));
  assert.equal(r.rows, 2);
  assert.equal(pos(r).at(-1), "L@1,2x2");
  assert.equal(pos(r)[5], "s5@1,0x1");
});
test("shotCells: full last row pushes long to a new row", () => {
  const r = shotCells([...names(5), "L"], 5, fitsNot("L"));
  assert.equal(r.rows, 2);
  assert.equal(pos(r).at(-1), "L@1,0x2");
});
test("shotCells: one free cell is not enough", () => {
  const r = shotCells([...names(4), "L"], 5, fitsNot("L"));
  assert.equal(r.rows, 2);
  assert.equal(pos(r).at(-1), "L@1,0x2");
});
test("shotCells: long given first ends up last", () => {
  const r = shotCells(["L", "a", "b"], 5, fitsNot("L"));
  assert.deepEqual(r.cells.map(c => c.n), ["a", "b", "L"]);
  assert.equal(pos(r).at(-1), "L@0,2x2");
});
test("shotCells: two longs, no shorts", () => {
  const r = shotCells(["L1", "L2"], 5, () => false);
  assert.equal(r.rows, 1);
  assert.deepEqual(pos(r), ["L1@0,0x2", "L2@0,2x2"]);
});
test("shotCells: empty", () => {
  assert.deepEqual(plain(shotCells([], 5, () => true)), { cells: [], rows: 0 });
});

test("shotRowHeights: crowded team", () => {
  const { rH, dH } = shotRowHeights(13, 5, 4);
  assert.ok(Math.abs(rH - (1314 - 24 - 221 - 104 - 26) / 16.75) < 1e-9);
  assert.ok(Math.abs(rH - 56.06) < 0.01);
  assert.equal(dH, 0.75 * rH);
});
test("shotRowHeights: clamped to 72 / 48", () => {
  const { rH, dH } = shotRowHeights(2, 0, 1);
  assert.equal(rH, 72);
  assert.equal(dH, 48);
});
test("shotRowHeights: no dropped block reserves nothing", () => {
  const { rH } = shotRowHeights(10, 0, 4);
  assert.equal(rH, Math.min(72, (1314 - 24 - 221 - 104) / 10));
});
test("shotRowHeights: one dropped row counts as two (R1)", () => {
  assert.deepEqual(plain(shotRowHeights(13, 1, 4)), plain(shotRowHeights(13, 2, 4)));
});
