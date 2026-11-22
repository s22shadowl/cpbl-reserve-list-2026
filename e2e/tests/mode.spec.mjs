// 挑選／刪減 list modes: cut (the default) starts with the whole team kept, pick starts empty. Switching through the
// count button or the mode hint; an edited list needs a second press within 3 s. Each test = a fresh voter.
import { test, expect } from "@playwright/test";
import { data, open, cutTo60, usePickMode, submit } from "./helpers.mjs";

const TEAMS_JSON = data("teams.json").teams;
const N = TEAMS_JSON.AEO.players.length;
const LIMIT = 60;

test("default is 刪減: whole team kept, over 60 blocks submit/copy/image", async ({ page }) => {
  test.skip(N <= LIMIT, "roster not over the limit");
  await open(page);
  await expect(page.locator("#selN")).toHaveText(String(N));
  await expect(page.locator("#modeName")).toContainText("刪減");
  await expect(page.locator("#moveN")).toHaveText(`移出 ${N - LIMIT} 人`);
  await expect(page.locator("#moveN")).toBeVisible();
  let posted = 0;
  page.on("request", r => { if (r.method() === "POST" && r.url().includes("/picks")) posted++; });
  for (const id of ["#save", "#copyTxt", "#mkImg"]) {
    await expect(page.locator(id)).toHaveAttribute("aria-disabled", "true");
    await expect(page.locator(id)).toHaveJSProperty("disabled", false); // toBeEnabled() counts aria-disabled as disabled
  }
  await page.locator("#save").click({ force: true }); // Playwright waits out aria-disabled otherwise
  await expect(page.locator("#toast")).toHaveText(`移出 ${N - LIMIT} 人後才能送出`);
  await page.locator("#copyTxt").click({ force: true });
  await expect(page.locator("#toast")).toHaveText(`移出 ${N - LIMIT} 人後才能分享`);
  expect(posted).toBe(0);
  await expect(page.locator("#save")).toHaveAttribute("title", `移出 ${N - LIMIT} 人後才能送出`);
  await expect(page.locator("#save")).not.toHaveClass(/\bdirty\b/); // no reminder dot on a button that cannot be pressed
  await expect(page.locator("#modeHint")).toContainText("刪減模式");
  await expect(page.locator("#modeBtn")).toHaveAttribute("aria-label", new RegExp(`^刪減模式.*${N} / 60.*${N - LIMIT} 人`));
});

test("cut mode is not capped: tiles and 全選 go past 60", async ({ page }) => {
  await open(page);
  await cutTo60(page);
  await expect(page.locator("#moveN")).toBeHidden();
  await expect(page.locator("#save")).toHaveClass(/\bdirty\b/);
  await expect(page.locator("#save")).toBeEnabled();
  await expect(page.locator("#save")).not.toHaveAttribute("title", /移出/);

  await page.locator('.tile[aria-pressed="false"]').first().click();
  await expect(page.locator("#selN")).toHaveText("61");
  await expect(page.locator('.tile[aria-disabled="true"]')).toHaveCount(0);
  await expect(page.locator("#moveN")).toHaveText("移出 1 人");
  await expect(page.locator("#save")).toBeDisabled();

  // The group 全選 is never aria-disabled in cut mode, even past 60, and adds every shown-but-unselected player.
  const bulk = page.locator("#g-P .bulk");
  const need = await page.locator('#g-P .tile[aria-pressed="false"]').count();
  test.skip(need === 0, "every pitcher still selected");
  await expect(bulk).toHaveText("全選");
  await expect(bulk).not.toHaveAttribute("aria-disabled", "true");
  await bulk.click();
  await expect(page.locator("#selN")).toHaveText(String(61 + need));
  await expect(page.locator('#g-P .tile[aria-pressed="false"]')).toHaveCount(0);
});

test("pristine switch is immediate", async ({ page }) => {
  await open(page);
  await page.locator("#modeBtn").click();
  await expect(page.locator("#selN")).toHaveText("0");
  await expect(page.locator("#modeName")).toContainText("挑選");
  await expect(page.locator("#modeHint")).toContainText("挑選模式");
  await page.locator("#modeBtn").click();
  await expect(page.locator("#selN")).toHaveText(String(N));
  await expect(page.locator("#modeName")).toContainText("刪減");
});

test("edited switch needs a second press within 3 s; editing disarms it", async ({ page }) => {
  await open(page);
  const kept = page.locator('.tile[aria-pressed="true"]').first(), name = page.locator("#modeName");
  await kept.click();
  await page.locator("#modeHint").click();
  // The message names what the switch does: to 挑選 the list is emptied (the other direction is checked below).
  await expect(page.locator("#toast")).toHaveText("再按一次切換，名單會清空");
  await expect(name).toHaveText("確定？");
  await expect(page.locator("#modeBtn")).toHaveAttribute("aria-label", /^確定？/);
  await expect(page.locator("#modeHint")).toHaveClass(/\barm\b/);
  await expect(page.locator("#modeHint")).toContainText("清空");
  await expect(page.locator("#selN")).toHaveText(String(N - 1));

  await kept.click(); // an edit cancels the confirmation
  await expect(page.locator("#selN")).toHaveText(String(N - 2));
  await expect(name).toContainText("刪減");
  await expect(page.locator("#modeBtn")).toHaveAttribute("aria-label", /^刪減模式，已保留 /);

  await page.locator("#modeHint").click();
  await expect(name).toHaveText("確定？");
  await page.waitForTimeout(3500);
  await expect(name).toContainText("刪減");
  await expect(page.locator("#selN")).toHaveText(String(N - 2));

  await page.locator("#modeBtn").click();
  await page.locator("#modeBtn").click();
  await expect(page.locator("#selN")).toHaveText("0");
  await expect(name).toContainText("挑選");

  // Back to 刪減 from an edited pick list: the whole team is kept, not emptied (the old message said 清空 both ways).
  await page.locator('.tile[aria-pressed="false"]').first().click();
  await page.locator("#modeBtn").click();
  await expect(page.locator("#toast")).toHaveText("再按一次切換，改為整隊保留");
  await expect(name).toHaveText("確定？");
  await expect(page.locator("#modeHint")).toContainText("整隊保留");
  await page.locator("#modeBtn").click();
  await expect(page.locator("#selN")).toHaveText(String(N));
  await expect(name).toContainText("刪減");
});

test("mode is remembered per team", async ({ page }) => {
  await open(page);
  await usePickMode(page);
  await page.reload();
  await expect(page.locator(".tile").first()).toBeVisible();
  await expect(page.locator("#modeName")).toContainText("挑選");
  await expect(page.locator("#selN")).toHaveText("0");

  await open(page, "/#brothers");
  await expect(page.locator("#modeName")).toContainText("刪減");
  await expect(page.locator("#selN")).toHaveText(String(TEAMS_JSON.ACN.players.length));
});

test("a submitted list is loaded instead of the whole team", async ({ page }) => {
  await open(page);
  await cutTo60(page);
  await submit(page);
  await page.evaluate(() => localStorage.removeItem("rl-draft-AEO"));
  await page.reload();
  await expect(page.locator(".tile").first()).toBeVisible();
  await expect(page.locator("#status")).toHaveText(/已送出/);
  await expect(page.locator("#selN")).toHaveText("60");
  await expect(page.locator("#modeName")).toContainText("刪減");
});

test("stats tab hides the mode hint, keeps the status", async ({ page }) => {
  await open(page);
  await expect(page.locator("#modeHint")).toBeVisible();
  await page.locator("#tab-stats").click();
  await expect(page.locator("#modeHint")).toBeHidden();
  await expect(page.locator("#status")).toBeVisible();
  await expect(page.locator("#modeBtn")).toBeVisible();
});

test("two tabs: switching mode in one shows up in the other", async ({ context }) => {
  const a = await context.newPage(), b = await context.newPage();
  await open(a);
  await open(b);
  await usePickMode(a);
  await expect(b.locator("#modeName")).toContainText("挑選");
  await expect(b.locator("#selN")).toHaveText("0");
});

test("empty list: share buttons explain", async ({ page }) => {
  await open(page);
  await page.locator("#clear").click();
  await page.locator("#clear").click(); // second press confirms
  await expect(page.locator("#selN")).toHaveText("0");
  await page.locator("#mkImg").click({ force: true });
  await expect(page.locator("#toast")).toHaveText("名單是空的");
  await expect(page.locator("#sheet")).toBeHidden();
});
