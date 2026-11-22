// UI behaviour without a server round trip: team switch menu, toast, stats ranking toggle, position rail counts,
// group bulk select. Expected numbers come from docs/data/teams.json, docs/theme.js or the DOM, never hard-coded.
import { test, expect } from "@playwright/test";
import { TEAMS, data, open, usePickMode } from "./helpers.mjs";

const TEAMS_JSON = data("teams.json").teams;
const AVAIL = TEAMS.filter(t => TEAMS_JSON[t.code]); // menu order (app.js: TEAMS filtered by teams.json)
const AEO = TEAMS_JSON.AEO.players;
const LIMIT = 60;
const GORD = ["P", "C", "I", "O"];
const isRookie = p => p.rk === "d" || p.rk === "c";
// The most common surname among pitchers: a search term that hits several (but not all) pitchers.
const SURNAME = (() => {
  const c = {};
  for (const p of AEO) if (p.g === "P") c[p.n[0]] = (c[p.n[0]] || 0) + 1;
  return Object.entries(c).sort((a, b) => b[1] - a[1])[0][0];
})();
const rgb = hex => `rgb(${[1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)).join(", ")})`;

test.use({ colorScheme: "light" }); // toast / theme colours are checked against the light palette

// ---------- a. team switch menu ----------
async function expectTeam(page, t) {
  await expect(page).toHaveURL(new RegExp("#" + t.slug + "$"));
  await expect(page.locator("#h1")).toHaveText(`排出你的${t.name} 60 人契約保留名單`);
  await expect(page.locator("#teamSw")).toHaveText(t.name);
  await expect(page.locator("#teamSw")).toHaveAttribute("aria-label", "切換球隊，目前：" + t.name);
  await expect(page).toHaveTitle(new RegExp("^" + t.short));
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute("content", t.band);
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--band").trim())).toBe(t.band);
  await expect(page.locator(".tile")).toHaveCount(TEAMS_JSON[t.code].players.length);
}

test("team menu: click opens it, Escape and an outside click close it, clicking a team switches", async ({ page }) => {
  const sw = page.locator("#teamSw"), menu = page.locator("#teamMenu");
  const here = AVAIL.find(t => t.code === "AEO"), other = AVAIL.find(t => t.code !== "AEO");
  await open(page);
  await expect(menu).toBeHidden();
  await expect(sw).toHaveAttribute("aria-expanded", "false");

  await sw.click();
  await expect(menu).toBeVisible();
  await expect(sw).toHaveAttribute("aria-expanded", "true");
  await expect(menu.getByRole("menuitemradio")).toHaveText(AVAIL.map(t => t.name));
  await expect(menu.locator('[aria-checked="true"]')).toHaveText(here.name);
  await page.keyboard.press("Escape"); // a mouse-opened menu keeps focus on the button
  await expect(menu).toBeHidden();
  await expect(sw).toHaveAttribute("aria-expanded", "false");

  await sw.click();
  await expect(menu).toBeVisible();
  await page.locator("#h1").click(); // pointerdown outside the menu
  await expect(menu).toBeHidden();
  await expectTeam(page, here);

  await sw.click();
  await menu.getByRole("menuitemradio", { name: other.name }).click();
  await expect(menu).toBeHidden();
  await expectTeam(page, other);
  await sw.click();
  await expect(menu.locator('[aria-checked="true"]')).toHaveText(other.name);
});

test("team menu: arrow keys open it on the current team, Enter switches, Escape returns focus", async ({ page }) => {
  const sw = page.locator("#teamSw"), menu = page.locator("#teamMenu");
  const i = AVAIL.findIndex(t => t.code === "AEO"), next = AVAIL[(i + 1) % AVAIL.length];
  await open(page);

  await sw.focus();
  await page.keyboard.press("ArrowDown");
  await expect(menu).toBeVisible();
  await expect(menu.getByRole("menuitemradio", { name: AVAIL[i].name })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
  await expect(sw).toBeFocused();
  await expectTeam(page, AVAIL[i]);

  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("End");
  await expect(menu.getByRole("menuitemradio", { name: AVAIL.at(-1).name })).toBeFocused();
  await page.keyboard.press("Home");
  await expect(menu.getByRole("menuitemradio", { name: AVAIL[0].name })).toBeFocused();
  for (let k = 0; k <= i; k++) await page.keyboard.press("ArrowDown"); // Home + (i+1) downs = the team after AEO
  await expect(menu.getByRole("menuitemradio", { name: next.name })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(menu).toBeHidden();
  await expectTeam(page, next);
  await expect(sw).toBeFocused();
});

// ---------- b. toast ----------
test("toast: team-coloured bar shows the message, the next one replaces it, then it goes away", async ({ page }) => {
  const toast = page.locator("#toast"), band = AVAIL.find(t => t.code === "AEO").band;
  await open(page);
  await expect(toast).toBeHidden();
  for (let k = 0; k < 2; k++) await page.locator('.tile[aria-pressed="true"]').first().click();

  await page.locator("#clear").click();
  await expect(toast).toBeVisible();
  await expect(toast).toHaveText("再按一次清空名單");
  await expect(toast).toHaveAttribute("role", "status");
  await expect(toast.locator("svg")).toHaveCount(1);
  await expect(toast).toHaveCSS("background-color", rgb(band));

  await page.locator("#clear").click();
  await expect(toast).toHaveText("已清空名單（尚未送出）");
  await expect(page.locator("#selN")).toHaveText("0");
  await expect(toast).toBeHidden({ timeout: 6000 }); // stays up max(2.4 s, 90 ms per character)
});

test("theme button announces its mode in a toast", async ({ page }) => {
  await open(page);
  for (const t of ["配色：淺色", "配色：深色", "配色：自動（跟隨系統）"]) {
    await page.locator("#themeBtn").click();
    await expect(page.locator("#toast")).toHaveText(t);
  }
});

// ---------- c. stats ranking ----------
test("stats ranking: top 20 by default, the toggle reveals 21–60 and collapses again", async ({ page }) => {
  const n = AEO.length, preview = 20, b = Math.min(LIMIT, n);
  test.skip(n <= preview, "roster too small for a toggle");
  const range = (a, z) => Array.from({ length: Math.max(0, z - a + 1) }, (_, k) => a + k);
  const shownRanks = () => page.evaluate(() =>
    [...document.querySelectorAll(".rank .rk")].filter(e => e.checkVisibility()).map(e => Number(e.querySelector(".r").textContent)));
  await open(page);
  await page.locator("#tab-stats").click();
  const more = page.locator("#rankMore");
  await expect(more).toBeVisible();

  await expect(more).toHaveText(`展開第 ${preview + 1}～${b} 名`);
  await expect(more).toHaveAttribute("aria-expanded", "false");
  await expect(more).toHaveAttribute("aria-controls", "rankMid");
  await expect(page.locator("#rankMid")).toBeHidden();
  expect(await shownRanks()).toEqual([...range(1, preview), ...range(LIMIT + 1, n)]); // past the limit stays under the cut row
  await expect(page.locator(".rank .cut")).toHaveCount(n > LIMIT ? 1 : 0);

  await more.click();
  await expect(more).toHaveAttribute("aria-expanded", "true");
  await expect(more).toHaveText(`收起第 ${preview + 1}～${b} 名`);
  await expect(page.locator("#rankMid")).toBeVisible();
  await expect(page.locator("#rankMid .rk")).toHaveCount(b - preview);
  expect(await shownRanks()).toEqual(range(1, n));

  await more.click();
  await expect(more).toHaveAttribute("aria-expanded", "false");
  await expect(more).toHaveText(`展開第 ${preview + 1}～${b} 名`);
  await expect(page.locator("#rankMid")).toBeHidden();
  expect(await shownRanks()).toEqual([...range(1, preview), ...range(LIMIT + 1, n)]);
});

// ---------- d. position rail ----------
// [kept, total] for 全部 + each position, from the rail's labels and from the visible cards.
const railAndCards = page => page.evaluate(gord => {
  const rail = [...document.querySelectorAll("#posTabs .pc-tab")]
    .map(b => b.getAttribute("aria-label").match(/：已保留 (\d+)，共 (\d+) 人$/).slice(1).map(Number));
  const cards = gord.map(g => {
    const s = document.getElementById("g-" + g);
    return s ? [s.querySelectorAll('.tile[aria-pressed="true"]').length, s.querySelectorAll(".tile").length] : [0, 0];
  });
  return { rail, cards };
}, GORD);
async function expectRailMatchesCards(page) {
  const { rail, cards } = await railAndCards(page);
  const all = cards.reduce(([k, t], [a, b]) => [k + a, t + b], [0, 0]);
  expect(rail).toEqual([all, ...cards]);
  return all;
}

test("position rail: counts follow the 顯示 filter and the search, matching the visible cards", async ({ page }) => {
  await open(page);
  // Cut mode starts with the whole team: drop 4.
  for (const g of ["P", "P", "C", "I"]) await page.locator(`#g-${g} .tile[aria-pressed="true"]`).first().click();
  const n = AEO.length, kept = n - 4;
  await expect(page.locator("#selN")).toHaveText(String(kept));
  const keptIds = await page.locator('.tile[aria-pressed="true"]').evaluateAll(ts => ts.map(t => t.dataset.id));

  const show = page.locator("#showSel"), q = page.locator("#q");
  expect(await expectRailMatchesCards(page)).toEqual([kept, n]);
  await show.selectOption("kept");
  expect(await expectRailMatchesCards(page)).toEqual([kept, kept]);
  await show.selectOption("dropped");
  expect(await expectRailMatchesCards(page)).toEqual([0, n - kept]);
  await show.selectOption("new");
  expect((await expectRailMatchesCards(page))[1]).toBe(AEO.filter(isRookie).length);

  await show.selectOption("all");
  await q.fill(SURNAME);
  expect((await expectRailMatchesCards(page))[1]).toBe(AEO.filter(p => p.n.includes(SURNAME)).length);
  const no = AEO[0].no;
  await q.fill(no);
  expect((await expectRailMatchesCards(page))[1]).toBe(AEO.filter(p => p.no === no || String(+p.no) === no).length);

  await q.fill(SURNAME);
  await show.selectOption("dropped"); // filter and search together
  const [, both] = await expectRailMatchesCards(page);
  expect(both).toBe(AEO.filter(p => p.n.includes(SURNAME) && !keptIds.includes(p.id)).length);

  // The stats tab counts the whole roster, whatever the picker filters say.
  await page.locator("#tab-stats").click();
  const total = await page.locator("#posTabs .pc-tab").first().locator(".sr").textContent();
  expect(total).toBe(`全部：已保留 ${kept}，共 ${n} 人`);
});

// ---------- e. group bulk select ----------
// Cut mode starts with the whole team, so 全部取消 comes first, then 全選 puts the same players back.
test("bulk select: 全部取消 drops only the players shown by the search; 全選 takes them back", async ({ page }) => {
  const n = AEO.length;
  await open(page);
  await page.locator("#q").fill(SURNAME);
  const grp = page.locator("#g-P"), bulk = grp.locator(".bulk");
  const k = await grp.locator(".tile").count();
  expect(k).toBe(AEO.filter(p => p.g === "P" && p.n.includes(SURNAME)).length);
  await expect(bulk).toHaveText("全部取消");
  await expect(bulk).toHaveAttribute("aria-label", `全部取消投手（${k} 人）`);

  await bulk.click();
  await expect(page.locator("#selN")).toHaveText(String(n - k));
  await expect(grp.locator('.tile[aria-pressed="true"]')).toHaveCount(0);
  await expect(bulk).toHaveText("全選");

  // Without the search: only those k are dropped, and the pitchers' button offers 全選.
  await page.locator("#q").fill("");
  const names = await page.locator('.tile[aria-pressed="false"] .nm').allTextContents();
  expect(names).toHaveLength(k);
  for (const nm of names) expect(nm).toContain(SURNAME);
  await expect(bulk).toHaveText("全選");

  await page.locator("#q").fill(SURNAME);
  await bulk.click();
  await expect(page.locator("#selN")).toHaveText(String(n));
  await expect(bulk).toHaveText("全部取消");

  // With the 新人 filter: the first group that has rookies drops its rookies only.
  await page.locator("#q").fill("");
  await page.locator("#showSel").selectOption("new");
  const g = GORD.find(x => AEO.some(p => p.g === x && isRookie(p)));
  test.skip(!g, "no rookies in this roster");
  const rookies = AEO.filter(p => p.g === g && isRookie(p)).map(p => p.id).sort();
  await page.locator(`#g-${g} .bulk`).click();
  await expect(page.locator("#selN")).toHaveText(String(n - rookies.length));
  await page.locator("#showSel").selectOption("all");
  const dropped = await page.locator('.tile[aria-pressed="false"]').evaluateAll(ts => ts.map(t => t.dataset.id));
  expect(dropped.sort()).toEqual(rookies);
});

test("bulk select: not enough slots → aria-disabled and 名額不足（需 N，剩 M）; a narrower search fits", async ({ page }) => {
  const p = AEO.filter(x => x.g === "P").length, target = LIMIT + 1 - p; // left = p - 1 < need = p
  test.skip(target < 1 || target > AEO.length - p, "roster shape does not allow this setup");
  await open(page);
  await usePickMode(page); // only pick mode is capped
  const other = page.locator('#groups section:not(#g-P) .tile[aria-pressed="false"]').first();
  while (Number(await page.locator("#selN").textContent()) < target) await other.click();
  await expect(page.locator("#selN")).toHaveText(String(target));

  const bulk = page.locator("#g-P .bulk"), left = LIMIT - target;
  const msg = `名額不足（需 ${p}，剩 ${left}）`;
  await expect(bulk).toHaveText("全選");
  await expect(bulk).toHaveAttribute("aria-disabled", "true");
  await expect(bulk).toHaveAttribute("title", msg);
  expect(await bulk.evaluate(b => b.disabled)).toBe(false); // still focusable
  await bulk.focus();
  await page.keyboard.press("Enter"); // Playwright refuses to click aria-disabled; the keyboard is the real path too
  await expect(page.locator("#toast")).toHaveText(msg);
  await expect(page.locator("#selN")).toHaveText(String(target));
  await expect(page.locator('#g-P .tile[aria-pressed="true"]')).toHaveCount(0);

  // Searching narrows what 全選 needs to the shown pitchers, which now fit.
  await page.locator("#q").fill(SURNAME);
  const k = await page.locator("#g-P .tile").count();
  test.skip(k > left, "search still needs too many slots");
  await expect(bulk).not.toHaveAttribute("aria-disabled", "true");
  await bulk.click();
  await expect(page.locator("#selN")).toHaveText(String(target + k));
});
