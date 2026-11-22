"use strict";
// Share-image layout helpers (pure, no DOM). Used by the canvas redraw.

// Place names in a grid of `cols` cells. Names where fits(n) is false take 2 cells
// and go after all 1-cell names; a 2-cell name that does not fit in the current row starts a new row.
function shotCells(names, cols, fits) {
  const shorts = names.filter(n => fits(n));
  const longs = names.filter(n => !fits(n));
  const cells = shorts.map((n, i) => ({ n, r: Math.floor(i / cols), k: i % cols, sp: 1 }));
  let r = Math.floor(shorts.length / cols);
  let k = shorts.length % cols;
  for (const n of longs) {
    if (k + 2 > cols) { r += 1; k = 0; }
    cells.push({ n, r, k, sp: 2 });
    k += 2;
  }
  return { cells, rows: cells.length ? cells[cells.length - 1].r + 1 : 0 };
}

// Row heights for the kept grid (rH) and dropped grid (dH) in the 1350px share image.
// The dropped label is ~90px tall, so a non-empty dropped block counts as at least 2 rows.
function shotRowHeights(kRows, dRows, groupCount) {
  const d = dRows > 0 ? Math.max(dRows, 2) : 0;
  const avail = 1314 - 24 - 221 - 26 * groupCount - (d ? 26 : 0);
  const rH = Math.min(72, avail / (kRows + 0.75 * d));
  return { rH, dH: Math.min(48, 0.75 * rH) };
}
