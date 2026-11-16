// Smoke tests for the glue in docs/app.js (buttons, tabs, localStorage, API calls).
// Each test gets a fresh browser context = a new voter. setup.mjs seeds 50 fake lists per team; earlier tests
// may leave lists behind, so counts are compared with a baseline read at the start of each test.
import { test, expect } from "@playwright/test";

const TEAM = "/#guardians";

async function open(page) {
  await page.goto(TEAM);
  await expect(page.locator(".tile").first()).toBeVisible();
  await expect(page.locator("#status")).not.toHaveText(/連線中/);
}

async function pick60(page) {
  const next = page.locator('.tile[aria-pressed="false"]:not([disabled])').first();
  while (Number(await page.locator("#selN").textContent()) < 60) await next.click();
  await expect(page.locator("#selN")).toHaveText("60");
}

async function listsSubmitted(page) {
  await page.locator("#tab-stats").click();
  const v = page.locator(".kpi .v").first();
  await expect(v).toBeVisible();
  return Number(await v.textContent());
}

async function submit(page) {
  await page.locator("#save").click();
  await expect(page.locator("#status")).toHaveText(/已送出/);
}

test("pick 60, submit, stats count +1 and 'you vs most fans' shows", async ({ page }) => {
  await open(page);
  const base = await listsSubmitted(page);
  await page.locator("#tab-pick").click();
  await pick60(page);
  await expect(page.locator("#status")).toHaveText("尚未送出");
  await submit(page);
  await expect(page.locator("#save")).toBeDisabled();

  await expect.poll(() => listsSubmitted(page)).toBe(base + 1);
  const mine = page.locator("section.mvf");
  await expect(mine.locator("h2")).toHaveText("你和多數球迷不同");
  await expect(mine).not.toContainText("送出名單後");
  await expect(mine).not.toContainText("才會顯示");
});

test("withdraw: clear + submit empty resets status and stats", async ({ page }) => {
  await open(page);
  const base = await listsSubmitted(page);
  await page.locator("#tab-pick").click();
  await pick60(page);
  await submit(page);
  await expect.poll(() => listsSubmitted(page)).toBe(base + 1);

  await page.locator("#tab-pick").click();
  await page.locator("#clear").click();
  await page.locator("#clear").click(); // second press confirms
  await expect(page.locator("#selN")).toHaveText("0");
  await expect(page.locator("#status")).toHaveText("有未送出的變更");
  await page.locator("#save").click();

  await expect(page.locator("#status")).toHaveText("點選球員加入名單");
  await expect(page.locator("#save")).toBeDisabled();
  await expect.poll(() => listsSubmitted(page)).toBe(base);
  await expect(page.locator("section.mvf")).toContainText("送出名單後");
});

test("draft survives a reload", async ({ page }) => {
  await open(page);
  const next = page.locator('.tile[aria-pressed="false"]').first();
  for (let i = 0; i < 3; i++) await next.click();
  await expect(page.locator("#selN")).toHaveText("3");

  await page.reload();
  await expect(page.locator(".tile").first()).toBeVisible();
  await expect(page.locator("#selN")).toHaveText("3");
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
