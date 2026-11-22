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

// The 1350px image as drawCard() stacks it: the grid starts under the header band (y 221) and must end above the
// footer band (y 1314) with a 24px gap. Each position group adds 26px of spacing; a dropped block adds 26px and, because its label is
// ~90px tall, takes at least two of its rows.
const TOP = 221, END = 1314 - 24;
const bottom = (kRows, dRows, groups) => {
  const { rH, dH } = shotRowHeights(kRows, dRows, groups);
  return TOP + groups * 26 + kRows * rH + (dRows ? 26 + Math.max(dRows, 2) * dH : 0);
};
const shapes = [];
for (let g = 1; g <= 4; g++) for (let k = g; k <= 20; k++) for (let d = 0; d <= 6; d++) shapes.push([k, d, g]);

test("shotRowHeights: the grid always ends above the footer band, whatever the shape", () => {
  for (const s of shapes) assert.ok(bottom(...s) <= END + 1e-9, String(s));
});
test("shotRowHeights: a crowded image uses the whole space down to the footer", () => {
  for (const s of shapes) {
    const { rH, dH } = shotRowHeights(...s);
    if (rH < 72 && (s[1] === 0 || dH < 48)) assert.ok(Math.abs(bottom(...s) - END) < 1e-6, String(s));
  }
});
test("shotRowHeights: rows are capped at 72 (dropped at 48) when there is room", () => {
  for (const s of shapes) {
    const { rH, dH } = shotRowHeights(...s);
    assert.ok(rH <= 72 && dH <= 48, String(s));
  }
  assert.equal(shotRowHeights(2, 0, 1).rH, 72);
  assert.equal(shotRowHeights(2, 1, 1).dH, 48);
});
test("shotRowHeights: dropped rows are 0.75× a kept row", () => {
  const { rH, dH } = shotRowHeights(13, 5, 4);
  assert.ok(rH < 72);
  assert.equal(dH, 0.75 * rH);
});
test("shotRowHeights: one dropped row counts as two (R1)", () => {
  assert.deepEqual(plain(shotRowHeights(13, 1, 4)), plain(shotRowHeights(13, 2, 4)));
});
