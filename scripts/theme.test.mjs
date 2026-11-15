// Contrast + consistency checks for per-team theming. Run: node --test scripts/
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const root = new URL("../docs/", import.meta.url);
const ctx = vm.createContext({});
vm.runInContext(readFileSync(new URL("theme.js", root), "utf8"), ctx, { filename: "theme.js" });
const { TEAMS, NEUTRAL, deriveTheme } = vm.runInContext("({TEAMS,NEUTRAL,deriveTheme})", ctx);

function lum(hex) {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  assert.ok(m, `not a #rrggbb colour: ${hex}`);
  const [r, g, b] = [0, 2, 4].map((i) => {
    const c = parseInt(m[1].slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a, b) {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

const PAIRS = [
  ["--text", "--page"], ["--text", "--paper"], ["--ink", "--page"], ["--muted", "--paper"],
  ["--acc-ink", "--paper"], ["--on-band", "--band"], ["--band-muted", "--band"],
  ["--on-acc", "--acc"], ["--tab-ink", "--tab"],
];
const PALETTES = [...TEAMS.map((t) => [t.slug, t]), ["NEUTRAL", NEUTRAL]];

test("seven palettes are defined", () => {
  assert.equal(TEAMS.length, 6);
  assert.equal(NEUTRAL.band.toLowerCase(), "#111214");
});

for (const [name, base] of PALETTES) {
  for (const mode of ["light", "dark"]) {
    test(`${name} ${mode}: WCAG contrast >= 4.5`, () => {
      const th = deriveTheme(base)[mode];
      const fails = PAIRS.map(([fg, bg]) => [fg, bg, contrast(th[fg], th[bg])])
        .filter(([, , c]) => c < 4.5)
        .map(([fg, bg, c]) => `${fg} ${th[fg]} on ${bg} ${th[bg]} = ${c.toFixed(2)}`);
      assert.deepEqual(fails, []);
    });
  }
}

test("deriveTheme is pure and returns hex for colour tokens", () => {
  const base = { ...TEAMS[0] };
  const a = deriveTheme(base), b = deriveTheme(base);
  assert.deepEqual(a, b);
  assert.deepEqual(base, { ...TEAMS[0] });
  for (const mode of ["light", "dark"]) {
    for (const [k, v] of Object.entries(a[mode])) {
      if (k === "--scrim" || k === "--shade-rgb") continue;
      assert.match(v, /^#[0-9a-f]{6}$/i, `${mode} ${k}=${v}`);
    }
  }
});

// style.css :root defaults must equal deriveTheme(NEUTRAL) so nothing flashes navy before JS runs.
const css = readFileSync(new URL("style.css", root), "utf8");
function block(re) {
  const m = re.exec(css);
  assert.ok(m, `block not found: ${re}`);
  const out = {};
  for (const [, k, v] of m[1].matchAll(/(--[a-z-]+)\s*:\s*([^;]+?)\s*(?:;|$)/g)) out[k] = v;
  return out;
}
const SKIP = new Set(["--warn", "--over", "--f-body", "--f-num"]);
const strip = (o) => Object.fromEntries(Object.entries(o).filter(([k]) => !SKIP.has(k)).map(([k, v]) => [k, v.toLowerCase()]));
const lower = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, v.toLowerCase()]));
const N = deriveTheme(NEUTRAL);

test("style.css light :root equals deriveTheme(NEUTRAL).light", () => {
  assert.deepEqual(strip(block(/^:root\{([^}]*)\}/m)), lower(N.light));
});
test("style.css prefers-color-scheme dark block equals deriveTheme(NEUTRAL).dark", () => {
  assert.deepEqual(strip(block(/prefers-color-scheme: dark\)\{:root:not\(\[data-theme="light"\]\)\{([^}]*)\}/)), lower(N.dark));
});
test('style.css [data-theme="dark"] block equals deriveTheme(NEUTRAL).dark', () => {
  assert.deepEqual(strip(block(/^:root\[data-theme="dark"\]\{([^}]*)\}/m)), lower(N.dark));
});
test("style.css has no self-referencing custom properties", () => {
  for (const [, k, v] of css.matchAll(/(--[a-z-]+)\s*:\s*var\((--[a-z-]+)\)/g)) assert.notEqual(k, v);
});
