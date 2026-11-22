// Link-preview image (og:image, 1200×630) in the current design: the neutral D1 hero band and the six picker cards.
// Colours come from docs/theme.js (loaded with node:vm, as the frontend tests do), so the image follows the tokens.
// Run from the repo root (needs `cd e2e && npm install && npm run install-browser` once):
//   node scripts/og.mjs                 → docs/og.png
//   node scripts/og.mjs /path/out.png   → somewhere else (preview before replacing the live image)
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { chromium } from "../e2e/node_modules/@playwright/test/index.mjs";

const root = new URL("../", import.meta.url);
const themeSrc = new URL("docs/theme.js", root);
const ctx = vm.createContext({});
vm.runInContext(readFileSync(themeSrc, "utf8"), ctx, { filename: fileURLToPath(themeSrc) });
const { TEAMS, NEUTRAL, light } = vm.runInContext("({TEAMS,NEUTRAL,light:deriveTheme(NEUTRAL).light})", ctx);
const cardColors = vm.runInContext("cardColors", ctx);

const out = process.argv[2] || fileURLToPath(new URL("docs/og.png", root));
const W = 1200, H = 630;
const KICKER = "CPBL · 2027 Reserve List", TITLE = "2027 中職 60 人名單模擬器";
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

const cards = TEAMS.map(t => {
  const c = cardColors(t);
  return `<div class="card" style="background:${c.bg};color:${c.fg};box-shadow:inset 0 -3px 0 ${c.stripe}">
    <i class="wm">${esc(t.en.split(" ").pop())}</i><span>${esc(t.en)}</span><b>${esc(t.name)}</b></div>`;
}).join("");

const html = `<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@700&family=Rajdhani:wght@600;700&display=block">
<style>
*{box-sizing:border-box}
html,body{margin:0;width:${W}px;height:${H}px;overflow:hidden}
body{font-family:"Noto Sans TC",sans-serif;color:${light["--on-band"]};
  background:repeating-linear-gradient(135deg,rgba(255,255,255,.06) 0 2px,transparent 2px 9px),
    linear-gradient(160deg,${NEUTRAL.band},color-mix(in srgb,${NEUTRAL.band} 70%,${NEUTRAL.acc}));
  border-bottom:3px solid ${NEUTRAL.acc};padding:0 64px;display:flex;flex-direction:column;justify-content:center}
.kicker{font-family:Rajdhani,sans-serif;font-weight:600;letter-spacing:.22em;font-size:26px;text-transform:uppercase;color:${light["--band-muted"]}}
h1{margin:6px 0 40px;font-size:76px;line-height:1.15;font-weight:700;letter-spacing:.01em}
.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}
.card{position:relative;container-type:inline-size;overflow:hidden;border-radius:8px;height:150px;padding:22px 24px;display:flex;flex-direction:column;justify-content:center;gap:4px}
.card>span,.card>b{position:relative;z-index:1}
.card span{font-family:Rajdhani,sans-serif;font-weight:600;letter-spacing:.12em;text-transform:uppercase;font-size:18px;opacity:.8}
.card b{font-size:34px;font-weight:700;line-height:1.2}
.wm{position:absolute;z-index:0;right:12px;bottom:6px;line-height:.8;font-family:Rajdhani,sans-serif;font-weight:700;font-style:normal;font-size:21cqi;letter-spacing:.02em;opacity:.14;white-space:nowrap}
</style></head><body>
<div class="kicker">${esc(KICKER)}</div><h1>${esc(TITLE)}</h1><div class="grid">${cards}</div>
</body></html>`;

// Every glyph drawn, per face, so the split Noto Sans TC subsets are all fetched before the shot.
const zh = TITLE + TEAMS.map(t => t.name).join("");
const latin = KICKER.toUpperCase() + TEAMS.map(t => t.en.toUpperCase() + t.en).join("");

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  await page.setContent(html, { waitUntil: "networkidle" });
  const ok = await page.evaluate(async ([zh, latin]) => {
    const faces = await Promise.all([
      document.fonts.load('700 76px "Noto Sans TC"', zh),
      document.fonts.load("600 26px Rajdhani", latin),
      document.fonts.load("700 75px Rajdhani", latin),
    ]);
    await document.fonts.ready;
    return faces.every(f => f.length > 0);
  }, [zh, latin]);
  if (!ok) throw new Error("web fonts did not load (offline?)");
  await page.screenshot({ path: out, clip: { x: 0, y: 0, width: W, height: H } });
  console.log("wrote", out);
} finally {
  await browser.close();
}
