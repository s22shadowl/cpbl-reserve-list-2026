// Contrast + consistency checks for per-team theming. Run: node --test tests/frontend/*.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = new URL("../../docs/", import.meta.url);
const ctx = vm.createContext({});
vm.runInContext(readFileSync(new URL("theme.js", root), "utf8"), ctx, { filename: fileURLToPath(new URL("theme.js", root)) });
const { TEAMS, NEUTRAL, deriveTheme, cardColors } = vm.runInContext("({TEAMS,NEUTRAL,deriveTheme,cardColors})", ctx);

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
  ["--on-acc", "--acc"], ["--on-acc", "--acc-hover"], ["--tab-ink", "--tab"],
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
// Not derived from the team palette: status colours, colours on the (always dark) band, fonts.
const SKIP = new Set(["--warn", "--over", "--band-over", "--band-warn", "--band-dot", "--f-body", "--f-num"]);
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

// Non-text contrast: dark-mode accent fills must stand out from the card background (guards liftAccent).
for (const [name, base] of PALETTES) {
  test(`${name} dark: --acc vs --paper >= 3 (UI contrast)`, () => {
    const d = deriveTheme(base).dark;
    assert.ok(contrast(d["--acc"], d["--paper"]) >= 3, `${d["--acc"]} on ${d["--paper"]}`);
  });
  // drawCard() paints --ink / --muted / --acc-ink text on the light --page background.
  test(`${name} share card: text on light --page >= 4.5`, () => {
    const l = deriveTheme(base).light;
    for (const k of ["--ink", "--muted", "--acc-ink"]) {
      assert.ok(contrast(l[k], l["--page"]) >= 4.5, `${k} ${l[k]} on --page ${l["--page"]}`);
    }
  });
}

test("app.js has no hard-coded navy palette left (colours come from theme.js)", () => {
  const app = readFileSync(new URL("app.js", root), "utf8");
  const navy = ["#1A2233", "#F2F4F7", "#66738A", "#DDE2EA", "#002255", "#004B90"];
  assert.deepEqual(navy.filter((h) => app.toUpperCase().includes(h)), []);
});

// Picker cards: Brothers, Lions and Dragons read better on their accent colour (yellow / orange / red) than on the dark band.
test("Brothers, Lions and Dragons swap picker card colours", () => {
  assert.deepEqual([...TEAMS.filter((t) => t.cardSwap).map((t) => t.code)], ["ACN", "ADD", "AAA"]);
});
// The team picker (NEUTRAL) uses a softer page colour than the near-white / near-black a 5% / 45% band mix gives.
test("NEUTRAL page colour is the softened picker background", () => {
  const n = deriveTheme(NEUTRAL);
  assert.equal(n.light["--page"], "#DCDDE0");
  assert.equal(n.dark["--page"], "#1E1F23");
  for (const t of TEAMS) assert.equal(t.page, undefined, `${t.slug} keeps the derived page colour`);
});
// With a custom page colour the light --line is derived from it, so rules (── 選一支球隊 ──, footer) stay visible.
test("NEUTRAL light --line is darker than its page", () => {
  const l = deriveTheme(NEUTRAL).light;
  assert.ok(lum(l["--line"]) < lum(l["--page"]), `${l["--line"]} vs ${l["--page"]}`);
  assert.ok(contrast(l["--line"], l["--page"]) >= 1.15, `${l["--line"]} on ${l["--page"]}`);
});
for (const t of TEAMS) {
  test(`${t.slug} picker card: colours follow cardSwap and text >= 4.5`, () => {
    const c = { ...cardColors(t) };
    assert.deepEqual(c, t.cardSwap ? { bg: t.acc, fg: t.on, stripe: t.band } : { bg: t.band, fg: "#FFFFFF", stripe: t.acc });
    assert.ok(contrast(c.fg, c.bg) >= 4.5, `${c.fg} on ${c.bg}`);
  });
}

// --warn (意見分歧, 爆冷) is a shared orange from style.css; Lions' accent is orange too, so Lions alone overrides it.
test("only Lions overrides --warn; others keep the style.css default", () => {
  assert.deepEqual([...TEAMS.filter((t) => t.warn).map((t) => t.code)], ["ADD"]);
  for (const t of TEAMS.filter((x) => !x.warn)) for (const mode of ["light", "dark"]) assert.equal(deriveTheme(t)[mode]["--warn"], undefined);
  assert.equal(deriveTheme(NEUTRAL).light["--warn"], undefined);
});
test("Lions --warn: readable on paper and clearly not the team orange", () => {
  const t = TEAMS.find((x) => x.code === "ADD"), th = deriveTheme(t);
  const hue = (hex) => {
    const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(1 + i, 3 + i), 16) / 255);
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
    const h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return (h * 60 + 360) % 360;
  };
  const gap = (a, b) => { const x = Math.abs(hue(a) - hue(b)) % 360; return Math.min(x, 360 - x); };
  for (const mode of ["light", "dark"]) {
    const w = th[mode]["--warn"];
    assert.ok(contrast(w, th[mode]["--paper"]) >= 4.5, `${mode} ${w} on paper`);
    const ink = th[mode]["--acc-ink"], dflt = mode === "light" ? "#C2611B" : "#F09A5C"; // style.css default --warn
    assert.ok(gap(w, ink) >= 45, `${mode} ${w} vs acc-ink ${ink}`);
    assert.ok(gap(w, ink) > gap(dflt, ink) + 30, `${mode} ${w} should sit further from the team orange than the default`);
  }
});
test("warnWord names the --warn colour for the copy: 桃紅色 for Lions, 橘色 otherwise", () => {
  const warnWord = vm.runInContext("warnWord", ctx);
  assert.equal(warnWord(TEAMS.find((t) => t.code === "ADD")), "桃紅色");
  for (const t of TEAMS.filter((x) => x.code !== "ADD")) assert.equal(warnWord(t), "橘色");
  assert.equal(warnWord(null), "橘色");
});
