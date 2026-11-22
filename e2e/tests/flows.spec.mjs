// Smoke tests for the glue in docs/app.js (buttons, tabs, localStorage, API calls). Default 刪減 mode (whole team kept).
// Each test gets a fresh browser context = a new voter. setup.mjs seeds 50 fake lists per team; earlier tests
// may leave lists behind, so counts are compared with a baseline read at the start of each test.
import { test, expect } from "@playwright/test";
import { TEAM, API, CORS, data, open, pick60, cutTo60, usePickMode, listsSubmitted, submit } from "./helpers.mjs";

test("cut to 60, submit, stats count +1 and 'you vs most fans' shows", async ({ page }) => {
  await open(page);
  const base = await listsSubmitted(page);
  await page.locator("#tab-pick").click();
  await cutTo60(page);
  await expect(page.locator("#status")).toHaveText("尚未送出");
  await submit(page);
  await expect(page.locator("#save")).toBeDisabled();

  await expect.poll(() => listsSubmitted(page)).toBe(base + 1);
  const mine = page.locator("section.mvf");
  await expect(mine.locator("h2")).toHaveText("你和多數球迷不同");
  await expect(mine).not.toContainText("送出名單後");
  await expect(mine).not.toContainText("樣本數不足");
});

test("withdraw: clear + submit empty resets status and stats", async ({ page }) => {
  await open(page);
  const base = await listsSubmitted(page);
  await page.locator("#tab-pick").click();
  await cutTo60(page);
  await submit(page);
  await expect.poll(() => listsSubmitted(page)).toBe(base + 1);

  await page.locator("#tab-pick").click();
  await page.locator("#clear").click();
  await page.locator("#clear").click(); // second press confirms
  await expect(page.locator("#selN")).toHaveText("0");
  await expect(page.locator("#status")).toHaveText("有未送出的變更");
  await expect(page.locator("#save")).toHaveText("撤回名單");
  await page.locator("#save").click(); // withdrawing needs no confirmation
  await expect(page.locator("#toast")).toHaveText("已撤回你的名單");

  await expect(page.locator("#status")).toHaveText("點選球員加入名單");
  await expect(page.locator("#save")).toBeDisabled();
  await expect.poll(() => listsSubmitted(page)).toBe(base);
  await expect(page.locator("section.mvf")).toContainText("送出名單後");
});

test("pick mode: at 60 the unselected tiles explain the limit", async ({ page }) => {
  await open(page);
  await usePickMode(page);
  await pick60(page);
  // Full: unselected tiles stay focusable (aria-disabled, not disabled) and explain the limit when clicked.
  const capped = page.locator('.tile[aria-disabled="true"]').first();
  expect(await capped.evaluate(b => b.disabled)).toBe(false);
  await capped.focus();
  await expect(capped).toBeFocused();
  await page.keyboard.press("Enter"); // Playwright refuses to click aria-disabled; a keyboard press is the real path too
  await expect(page.locator("#toast")).toHaveText(/已達 60 人上限/);
  await expect(page.locator("#selN")).toHaveText("60");
});

test("draft survives a reload", async ({ page }) => {
  await open(page);
  const n = Number(await page.locator("#selN").textContent());
  const next = page.locator('.tile[aria-pressed="true"]').first();
  for (let i = 0; i < 3; i++) await next.click();
  await expect(page.locator("#selN")).toHaveText(String(n - 3));

  await page.reload();
  await expect(page.locator(".tile").first()).toBeVisible();
  await expect(page.locator("#selN")).toHaveText(String(n - 3));
  await expect(page.locator("#status")).toHaveText("尚未送出");
});

test("official answers (on for localhost): stats tab only, never on picker cards", async ({ page }) => {
  await open(page);
  await expect(page.locator(".tile .cd")).toHaveCount(0);

  await page.locator("#tab-stats").click();
  await expect(page.locator("section.ans:not(.mvf) h2")).toHaveText("對答案");
  await expect(page.locator(".rank .rk .cd").first()).toBeVisible();

  await page.locator("#tab-pick").click();
  await expect(page.locator(".tile").first()).toBeVisible();
  await expect(page.locator(".tile .cd")).toHaveCount(0);
});

test("fewer than 60: the first press arms 送出, the second submits; it disarms after 3 s", async ({ page }) => {
  await open(page);
  await page.locator("#clear").click();
  await page.locator("#clear").click(); // second press confirms
  await expect(page.locator("#selN")).toHaveText("0");
  const next = page.locator('.tile[aria-pressed="false"]').first();
  for (let i = 0; i < 3; i++) await next.click();
  const save = page.locator("#save");
  await save.click();
  await expect(page.locator("#toast")).toHaveText("只選了 3 人，再按一次送出");
  await expect(save).toHaveText("確定送出？");
  await expect(page.locator("#status")).toHaveText("尚未送出");
  await page.waitForTimeout(3300);
  await expect(save).toHaveText("送出名單");

  await save.click();
  await expect(save).toHaveText("確定送出？");
  await save.click();
  await expect(page.locator("#status")).toHaveText(/已送出/);
  await expect(page.locator("#toast")).toHaveText("已送出 3 人名單");
});

// Official lists out: the Worker (LOCKED=true) is mocked with page.route, so the shared E2E Worker stays unlocked.
const AEO = { roster: data("teams.json").teams.AEO.players.map(p => p.id), official: data("official.sample.json").teams.AEO };
function mockLocked(page, ids) {
  return Promise.all([
    page.route(`${API}/mine?**`, r => r.fulfill({ json: { ids, at: ids ? "2026-11-20T04:00:00.000Z" : undefined, locked: true }, headers: CORS })),
    page.route(`${API}/picks`, r => r.fulfill({ status: 403, json: { error: "locked" }, headers: CORS })),
  ]);
}

test("locked: submit off, picking and sharing still work, hit rate from the submitted list only", async ({ page }) => {
  const kept = AEO.official.slice(0, 30), extra = AEO.roster.filter(id => !AEO.official.includes(id)).slice(0, 10);
  await mockLocked(page, [...kept, ...extra]);
  await open(page);
  await expect(page.locator("#status")).toHaveText("官方名單已公布，送出已截止");
  await expect(page.locator("#save")).toBeDisabled();
  await expect(page.locator("#save")).toHaveText("已截止");
  await expect(page.locator("#heroOff")).toContainText("送出已截止");

  // No local draft: the submitted 40 become the draft; picking more still works and is kept locally.
  await expect(page.locator("#selN")).toHaveText("40");
  await page.locator('.tile[aria-pressed="false"]').first().click();
  await expect(page.locator("#selN")).toHaveText("41");
  await expect(page.locator("#save")).toBeDisabled();
  await expect(page.locator("#copyTxt")).toBeEnabled();
  await expect(page.locator("#mkImg")).toBeEnabled();
  expect(JSON.parse(await page.evaluate(() => localStorage.getItem("rl-draft-AEO")))).toHaveLength(41);

  // Hit rate compares the submitted 40, not the 41-player draft.
  await page.locator("#tab-stats").click();
  const ans = page.locator("section.ans:not(.mvf)");
  await expect(ans.locator(".hit .big").first()).toHaveText("你的名單和球團重疊 30 / 40 人");
  await expect(ans).toContainText("球迷平均重疊");
  await expect(ans).toContainText("球迷保留、球團放生");
});

test("locked without a submitted list: hint instead of a hit rate", async ({ page }) => {
  await mockLocked(page, null);
  await open(page);
  await page.locator('.tile[aria-pressed="true"]').first().click();
  await page.locator("#tab-stats").click();
  await expect(page.locator("section.ans:not(.mvf) .hit")).toContainText("公布前未送出名單");
});

test("submit refused as locked: toast and the button switches to 已截止", async ({ page }) => {
  let lockedNow = false;
  await page.route(`${API}/mine?**`, r => r.fulfill({ json: { ids: null, locked: lockedNow }, headers: CORS }));
  await page.route(`${API}/picks`, r => { lockedNow = true; return r.fulfill({ status: 403, json: { error: "locked" }, headers: CORS }); });
  await open(page);
  await cutTo60(page);
  await page.locator("#save").click();
  await expect(page.locator("#toast")).toHaveText("送出已截止");
  await expect(page.locator("#status")).toHaveText("官方名單已公布，送出已截止");
  await expect(page.locator("#save")).toBeDisabled();
});

test("/mine unreachable: 無法確認送出狀態, submitting still allowed, retried when back online", async ({ page, context }) => {
  let fail = true;
  await page.route(`${API}/mine?**`, r => fail ? r.abort() : r.fallback());
  await page.goto(TEAM);
  await expect(page.locator("#status")).toHaveText("無法確認送出狀態");
  await cutTo60(page);
  await expect(page.locator("#save")).toBeEnabled();
  fail = false;
  await context.setOffline(true);
  await context.setOffline(false);
  await expect(page.locator("#status")).toHaveText("尚未送出");
});

test("keyboard: tabs move with arrow keys; the image sheet traps Tab and returns focus on close", async ({ page }) => {
  await open(page);
  await page.locator("#tab-pick").focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.locator("#tab-stats")).toBeFocused();
  await expect(page.locator("#tab-stats")).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("#tab-pick")).toHaveAttribute("tabindex", "-1");
  await page.keyboard.press("ArrowLeft");
  await expect(page.locator("#tab-pick")).toHaveAttribute("aria-selected", "true");

  await cutTo60(page);
  await page.locator("#mkImg").click();
  const sheet = page.locator("#sheet");
  await expect(sheet.locator("img.shot")).toHaveAttribute("src", /^data:image\/png/);
  const dim = await sheet.locator("img.shot").evaluate(i => [i.naturalWidth, i.naturalHeight]);
  expect(dim).toEqual([1080, 1350]);
  await expect(sheet.locator("a[download]")).toHaveAttribute("href", /^blob:/);
  await expect(sheet).toHaveAttribute("aria-label", "名單圖片");
  await expect(page.locator("#sheetT")).toHaveCount(0);
  await expect(sheet.locator(".sheet-h a[download]")).toHaveAttribute("href", /^blob:/);
  await expect(page.locator("#sheetX")).toHaveAttribute("aria-label", "關閉");
  await expect(sheet.locator(".inapp")).toHaveCount(0);
  await expect(sheet.locator(".hint")).toHaveCount(0);
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press("Tab");
    expect(await page.evaluate(() => document.getElementById("sheet").contains(document.activeElement))).toBe(true);
  }
  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();
  await expect(page.locator("#mkImg")).toBeFocused();
});

test("in-app browser: the image sheet suggests opening in Safari／Chrome", async ({ browser }) => {
  const context = await browser.newContext({ userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Safari Line/14.19.0" });
  const page = await context.newPage();
  await open(page);
  await cutTo60(page);
  await page.locator("#mkImg").click();
  await expect(page.locator("#sheet .inapp")).toHaveText("長按圖片可存到相簿；無法儲存請改用 Safari／Chrome 開啟。");
  await context.close();
});

test("touch device: the image sheet hints long-press, no in-app line", async ({ browser }) => {
  const context = await browser.newContext({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await open(page);
  await cutTo60(page);
  await page.locator("#mkImg").click();
  await expect(page.locator("#sheet .hint")).toHaveText("長按圖片可存到相簿。");
  await expect(page.locator("#sheet .inapp")).toHaveCount(0);
  await context.close();
});

test("two tabs: a draft change in one shows up in the other", async ({ context }) => {
  const a = await context.newPage(), b = await context.newPage();
  await open(a);
  await open(b);
  const n = Number(await a.locator("#selN").textContent());
  for (let i = 0; i < 2; i++) await a.locator('.tile[aria-pressed="true"]').first().click();
  await expect(b.locator("#selN")).toHaveText(String(n - 2));
  await expect(b.locator('.tile[aria-pressed="true"]')).toHaveCount(n - 2);
});

test("slow /mine answering after a submit does not undo it (still 已送出)", async ({ page }) => {
  let release;
  const held = new Promise(r => { release = r; });
  // First /mine is held until after the submit, then answers "nothing submitted" (its stale view).
  await page.route(`${API}/mine?**`, async r => { await held; await r.fulfill({ json: { ids: null, locked: false }, headers: CORS }); });
  await page.goto(TEAM);
  await expect(page.locator(".tile").first()).toBeVisible();
  await cutTo60(page);
  await page.locator("#save").click();
  await expect(page.locator("#status")).toHaveText(/已送出/);
  release();
  await page.waitForTimeout(500);
  await expect(page.locator("#status")).toHaveText(/已送出/);
  await expect(page.locator("#save")).toBeDisabled();
});
