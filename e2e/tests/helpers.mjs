// Shared helpers for the E2E specs (not a spec itself: Playwright only runs *.spec.mjs).
import { expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import vm from "node:vm";

export const TEAM = "/#guardians";
export const API = "http://localhost:8787";
export const CORS = { "Access-Control-Allow-Origin": "*" };
export const data = file => JSON.parse(readFileSync(new URL("../../docs/data/" + file, import.meta.url), "utf8"));

// TEAMS (names, slugs, band colours) straight from docs/theme.js, so tests follow palette edits.
export const TEAMS = (() => {
  const ctx = vm.createContext({});
  vm.runInContext(readFileSync(new URL("../../docs/theme.js", import.meta.url), "utf8"), ctx);
  return JSON.parse(JSON.stringify(vm.runInContext("TEAMS", ctx)));
})();

export async function open(page, hash = TEAM) {
  await page.goto(hash);
  await expect(page.locator(".tile").first()).toBeVisible();
  await expect(page.locator("#status")).not.toHaveText(/連線中/);
}

export async function pick60(page) {
  const next = page.locator('.tile[aria-pressed="false"]:not([aria-disabled="true"])').first();
  while (Number(await page.locator("#selN").textContent()) < 60) await next.click();
  await expect(page.locator("#selN")).toHaveText("60");
}

export async function listsSubmitted(page) {
  await page.locator("#tab-stats").click();
  const v = page.locator(".kpi .v").first();
  await expect(v).toBeVisible();
  return Number(await v.textContent());
}

export async function submit(page) {
  await page.locator("#save").click();
  await expect(page.locator("#status")).toHaveText(/已送出/);
}
