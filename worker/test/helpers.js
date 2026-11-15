import { env } from "cloudflare:workers";
import worker from "../src/index.js";
import ROSTER from "../src/roster.json";

export const TEAM = Object.keys(ROSTER)[0];
export const OTHER_TEAM = Object.keys(ROSTER)[1];
export const roster = (team = TEAM) => ROSTER[team];
export const TEAMS = Object.keys(ROSTER);

export const uuid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`.replace(/[^0-9a-f-]/g, "0");

export async function call(path, init = {}, overrides = {}) {
  const pending = [];
  const ctx = { waitUntil: (p) => pending.push(p), passThroughOnException() {} };
  const res = await worker.fetch(new Request(`https://example.com${path}`, init), { ...env, ...overrides }, ctx);
  await Promise.all(pending);
  return res;
}

export function post(body, { ip, raw, overrides } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (ip) headers["CF-Connecting-IP"] = ip;
  return call("/picks", { method: "POST", headers, body: raw ?? JSON.stringify(body) }, overrides);
}

export const submit = (team, voter, ids, opts) => post({ team, voter, ids }, opts);
export const getStats = async (team, fresh = true) =>
  (await call(`/stats?team=${team}${fresh ? "&fresh=1" : ""}`)).json();

export async function resetDb() {
  await env.DB.batch([env.DB.prepare("DELETE FROM picks"), env.DB.prepare("DELETE FROM tally")]);
  // Start from existing tally rows so submits exercise the incremental update path.
  const now = new Date().toISOString();
  await env.DB.batch(TEAMS.map((t) => env.DB.prepare("INSERT INTO tally (team, n, counts, updated_at) VALUES (?, 0, '{}', ?)").bind(t, now)));
  for (const t of TEAMS) await caches.default.delete(new Request(`https://example.com/stats?team=${t}`));
}

// Ground truth: recount every stored pick directly.
export async function recount(team) {
  const { results } = await env.DB.prepare("SELECT ids FROM picks WHERE team = ?").bind(team).all();
  const counts = {};
  for (const r of results) for (const id of JSON.parse(r.ids)) counts[id] = (counts[id] || 0) + 1;
  return { n: results.length, counts };
}
