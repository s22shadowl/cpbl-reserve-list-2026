// Tile ⓘ details button and the centred kept check (mobile-hints). Default team 富邦, cut mode (whole team kept).
import { test, expect } from "@playwright/test";
import { open, usePickMode, pick60 } from "./helpers.mjs";

test("every tile has an info button and no corner check", async ({ page }) => {
  await open(page);
  const tiles = await page.locator(".tile").count();
  expect(await page.locator(".tw .info").count()).toBe(tiles);
  expect(await page.locator(".tile .ck").count()).toBe(0);
  await expect(page.locator('.tile[data-id] + .info[aria-label="劉俊豪 詳細資料"]')).toHaveCount(1);
});

test("kept tile shows the centred check", async ({ page }) => {
  await open(page);
  const id = await page.locator('.tile[aria-pressed="true"]').first().getAttribute("data-id");
  const tile = page.locator(`.tile[data-id="${id}"]`), tw = tile.locator("xpath=..");
  await expect(tw).toHaveClass(/\bon\b/);
  await expect(tw.locator(".big svg")).toHaveCount(1);
  await tile.click();
  await expect(tile).toHaveAttribute("aria-pressed", "false");
  await expect(tw).not.toHaveClass(/\bon\b/);
});

test("info works on a capped tile", async ({ page }) => {
  await open(page);
  await usePickMode(page);
  await pick60(page);
  const id = await page.locator('.tile[aria-disabled="true"]').first().getAttribute("data-id");
  const capped = page.locator(`.tile[data-id="${id}"]`);
  const pressed = await capped.getAttribute("aria-pressed"), n = await page.locator("#selN").textContent();
  await capped.locator("xpath=..").locator(".info").click();
  await expect(page.locator("#detail")).toBeVisible();
  await expect(page.locator("#toast")).not.toBeVisible();
  await expect(capped).toHaveAttribute("aria-pressed", pressed);
  await expect(page.locator("#selN")).toHaveText(n);
});

const LIU = '.info[aria-label="劉俊豪 詳細資料"]', PSL = '.info[aria-label="帕蘇拉塔基斯利尼安 詳細資料"]';

test("info opens the dialog with stats", async ({ page }) => {
  await open(page);
  const n = await page.locator("#selN").textContent();
  await page.locator(LIU).click();
  const d = page.locator("#detail");
  await expect(d).toBeVisible();
  await expect(d.locator("#detailT")).toHaveText("85劉俊豪");
  await expect(d.locator("#detailT .n")).toHaveText("85");
  await expect(d.locator(".meta li")).toHaveText(["游擊手", "一軍", /\d+ 歲/]);
  await expect(d.locator('thead th[scope="col"]')).toHaveText(["一軍", "二軍"]);
  await expect(page.locator("#selN")).toHaveText(n);
});

test("dialog links to the CPBL player page", async ({ page }) => {
  await open(page);
  await page.locator(LIU).click();
  const a = page.locator("#detail a.ext");
  await expect(a).toHaveAttribute("href", "https://www.cpbl.com.tw/team/person?Acnt=0000006743");
  await expect(a).toHaveAttribute("target", "_blank");
  await expect(a).toHaveAttribute("rel", "noopener");
  await expect(a).toHaveText("中職官網球員頁");
});

test("long name stays on one line", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 640 });
  await open(page);
  await page.locator(PSL).click();
  const h = page.locator("#detailT");
  await expect(h).toHaveClass(/\blong\b/);
  expect((await h.boundingBox()).height).toBeLessThan(30);
  await expect(page.locator("#detail .bd")).toContainText("本季未出賽");
  await expect(page.locator("#detail table")).toHaveCount(0);
});

test("dialog closes and returns focus", async ({ page }) => {
  await open(page);
  const info = page.locator(LIU), d = page.locator("#detail");
  await info.click();
  await expect(d).toBeVisible();
  await expect(d.locator(".detail-x")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(d).toBeHidden();
  await expect(info).toBeFocused();
  await info.click();
  await d.locator(".detail-x").click();
  await expect(d).toBeHidden();
  await info.click();
  await d.click({ position: { x: 5, y: 5 } });
  await expect(d).toBeHidden();
});

test("Tab stays inside the dialog", async ({ page }) => {
  await open(page);
  await page.locator(LIU).click();
  const d = page.locator("#detail");
  for (let i = 0; i < 3; i++) await page.keyboard.press("Tab");
  expect(await d.evaluate(x => x.contains(document.activeElement))).toBe(true);
  await page.keyboard.press("Shift+Tab");
  expect(await d.evaluate(x => x.contains(document.activeElement))).toBe(true);
});

async function touch(page, sel, type, dx = 0) {
  await page.locator(sel).evaluate((t, [type, dx]) => {
    const r = t.getBoundingClientRect();
    t.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 7, pointerType: "touch", isPrimary: true, clientX: r.x + 20 + dx, clientY: r.y + 20 }));
  }, [type, dx]);
}

test("long press opens details without toggling", async ({ page }) => {
  await open(page);
  const id = await page.locator('.tile[aria-pressed="true"]').first().getAttribute("data-id");
  const sel = `.tile[data-id="${id}"]`, n = await page.locator("#selN").textContent();
  await touch(page, sel, "pointerdown");
  await page.waitForTimeout(600);
  await touch(page, sel, "pointerup");
  await page.locator(sel).evaluate(t => t.click());
  await expect(page.locator("#detail")).toBeVisible();
  await expect(page.locator(sel)).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#selN")).toHaveText(n);
});

test("moving finger cancels long press", async ({ page }) => {
  await open(page);
  const sel = `.tile[data-id="${await page.locator(".tile").first().getAttribute("data-id")}"]`;
  await touch(page, sel, "pointerdown");
  await page.waitForTimeout(50);
  await touch(page, sel, "pointermove", 30);
  await page.waitForTimeout(600);
  await expect(page.locator("#detail")).toBeHidden();
});

test("a short tap still toggles the tile", async ({ page }) => {
  await open(page);
  const sel = `.tile[data-id="${await page.locator('.tile[aria-pressed="true"]').first().getAttribute("data-id")}"]`;
  await touch(page, sel, "pointerdown");
  await touch(page, sel, "pointerup");
  await page.locator(sel).evaluate(t => t.click());
  await expect(page.locator(sel)).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator("#detail")).toBeHidden();
});
