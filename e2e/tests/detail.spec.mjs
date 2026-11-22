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
  const capped = page.locator('.tile[aria-disabled="true"]').first();
  await capped.locator("xpath=..").locator(".info").click();
  await expect(page.locator("#toast")).not.toBeVisible();
  await expect(page.locator("#selN")).toHaveText("60");
});
