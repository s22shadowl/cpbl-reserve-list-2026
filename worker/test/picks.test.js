import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { TEAM, OTHER_TEAM, call, getStats, post, recount, resetDb, roster, submit, uuid } from "./helpers.js";

beforeEach(resetDb);

describe("validation", () => {
  it("rejects malformed json", async () => {
    const res = await post(null, { raw: "{nope" });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "bad_json" });
  });

  it("rejects a null body as unknown_team", async () => {
    const res = await post(null, { raw: "null" });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("unknown_team");
  });

  it("rejects unknown team", async () => {
    const res = await submit("ZZZ", uuid(1), []);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("unknown_team");
  });

  it.each([["not-a-uuid"], [""], [123], [null], ["00000000-0000-4000-8000-00000000000G"]])("rejects bad voter %j", async (v) => {
    const res = await submit(TEAM, v, [roster()[0]]);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("bad_voter");
  });

  it.each([
    ["string", "abc"],
    ["object", {}],
    ["missing", undefined],
    ["null", null],
  ])("rejects ids that are %s", async (_, ids) => {
    const res = await submit(TEAM, uuid(1), ids);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("bad_ids");
  });

  it("rejects more than 60 ids and accepts exactly 60", async () => {
    const ids = roster().slice(0, 61);
    expect((await submit(TEAM, uuid(1), ids)).status).toBe(400);
    expect((await submit(TEAM, uuid(1), ids.slice(0, 60))).status).toBe(200);
  });

  it("rejects duplicates", async () => {
    const [a] = roster();
    const res = await submit(TEAM, uuid(1), [a, a]);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("bad_ids");
  });

  it("rejects ids not in that team's roster", async () => {
    const foreign = roster(OTHER_TEAM).find((id) => !roster().includes(id));
    for (const ids of [["nope"], [foreign], [roster()[0], "'); DROP TABLE picks;--"], [42]]) {
      const res = await submit(TEAM, uuid(1), ids);
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe("bad_ids");
    }
    expect((await recount(TEAM)).n).toBe(0);
  });

  it("answers OPTIONS with CORS headers", async () => {
    const res = await call("/picks", { method: "OPTIONS" });
    expect(res.status).toBe(200);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(res.headers.get("Access-Control-Allow-Methods")).toContain("POST");
    expect(res.headers.get("Access-Control-Allow-Headers")).toContain("Content-Type");
  });

  it("includes CORS on normal and error responses", async () => {
    expect((await call(`/stats?team=${TEAM}`)).headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect((await call("/nope")).headers.get("Access-Control-Allow-Origin")).toBe("*");
  });

  it("returns 404 for unknown paths and wrong methods", async () => {
    const res = await call("/nope");
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "not_found" });
    expect((await call("/picks")).status).toBe(404);
    expect((await call("/stats?team=" + TEAM, { method: "POST" })).status).toBe(404);
  });

  it("validates /stats and /mine query params", async () => {
    expect((await call("/stats?team=ZZZ")).status).toBe(400);
    expect((await call("/stats")).status).toBe(400);
    expect((await call(`/mine?team=${TEAM}&voter=bad`)).status).toBe(400);
    expect((await call(`/mine?team=ZZZ&voter=${uuid(1)}`)).status).toBe(400);
  });
});

describe("picks and tally", () => {
  it("counts a new submission", async () => {
    const ids = roster().slice(0, 3);
    const res = await submit(TEAM, uuid(1), ids);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect([...body.ids].sort()).toEqual([...ids].sort());
    expect(await getStats(TEAM)).toEqual({ n: 1, counts: Object.fromEntries(ids.map((i) => [i, 1])) });

    await submit(TEAM, uuid(2), ids.slice(0, 1));
    const s = await getStats(TEAM);
    expect(s.n).toBe(2);
    expect(s.counts[ids[0]]).toBe(2);
    expect(s.counts[ids[1]]).toBe(1);
  });

  it("overwrites with correct deltas and unchanged n", async () => {
    const [a, b, c, d] = roster();
    await submit(TEAM, uuid(1), [a, b, c]);
    await submit(TEAM, uuid(2), [a]);
    await submit(TEAM, uuid(1), [b, d]);
    const s = await getStats(TEAM);
    expect(s.n).toBe(2);
    expect(s.counts).toMatchObject({ [a]: 1, [b]: 1, [d]: 1 });
    expect(s.counts[c]).toBe(0);
    expect(s).toMatchObject(await recount(TEAM).then((r) => ({ n: r.n })));
  });

  it("resubmitting identical ids changes nothing", async () => {
    const ids = roster().slice(0, 2);
    await submit(TEAM, uuid(1), ids);
    const before = await getStats(TEAM);
    await submit(TEAM, uuid(1), [...ids].reverse());
    expect(await getStats(TEAM)).toEqual(before);
  });

  it("withdraws with [] and allows resubmitting", async () => {
    const [a, b] = roster();
    await submit(TEAM, uuid(1), [a, b]);
    await submit(TEAM, uuid(2), [a]);
    const res = await submit(TEAM, uuid(1), []);
    expect(res.status).toBe(200);
    expect((await res.json()).ids).toEqual([]);
    const row = await env.DB.prepare("SELECT 1 FROM picks WHERE voter = ?").bind(uuid(1)).first();
    expect(row).toBeNull();
    let s = await getStats(TEAM);
    expect(s.n).toBe(1);
    expect(s.counts[a]).toBe(1);
    expect(s.counts[b]).toBe(0);
    expect(await (await call(`/mine?team=${TEAM}&voter=${uuid(1)}`)).json()).toEqual({ ids: null });

    await submit(TEAM, uuid(1), [b]);
    s = await getStats(TEAM);
    expect(s.n).toBe(2);
    expect(s.counts[b]).toBe(1);
  });

  it("withdrawing with [] when nothing was stored is a no-op", async () => {
    expect((await submit(TEAM, uuid(9), [])).status).toBe(200);
    expect(await getStats(TEAM)).toEqual({ n: 0, counts: {} });
  });

  it("keeps teams separate for the same voter", async () => {
    await submit(TEAM, uuid(1), [roster()[0]]);
    await submit(OTHER_TEAM, uuid(1), [roster(OTHER_TEAM)[0]]);
    expect((await getStats(TEAM)).n).toBe(1);
    expect((await getStats(OTHER_TEAM)).counts).toEqual({ [roster(OTHER_TEAM)[0]]: 1 });
  });

  it("/stats matches a full recount after a random sequence of operations", async () => {
    let seed = 12345;
    const rnd = (n) => ((seed = (seed * 1103515245 + 12345) % 2147483648), seed % n);
    const pool = roster().slice(0, 12);
    for (let i = 0; i < 80; i++) {
      const voter = uuid(rnd(6) + 1);
      const k = rnd(4) === 0 ? 0 : rnd(8);
      const ids = [...pool].sort(() => rnd(3) - 1).slice(0, k);
      expect((await submit(TEAM, voter, ids)).status).toBe(200);
    }
    const stats = await getStats(TEAM);
    const truth = await recount(TEAM);
    expect(stats.n).toBe(truth.n);
    // The running tally keeps zero entries for players everyone dropped; a recount omits them.
    const nonZero = Object.fromEntries(Object.entries(stats.counts).filter(([, c]) => c > 0));
    expect(nonZero).toEqual(truth.counts);
  });

  it("rebuilds the tally from picks when the tally row is missing", async () => {
    const [a, b] = roster();
    await submit(TEAM, uuid(1), [a, b]);
    await submit(TEAM, uuid(2), [a]);
    await env.DB.prepare("DELETE FROM tally").run();
    expect(await getStats(TEAM)).toEqual({ n: 2, counts: { [a]: 2, [b]: 1 } });
  });
});

describe("/mine", () => {
  it("returns ids and at, or null", async () => {
    const ids = roster().slice(0, 2);
    expect(await (await call(`/mine?team=${TEAM}&voter=${uuid(1)}`)).json()).toEqual({ ids: null });
    const { at } = await (await submit(TEAM, uuid(1), ids)).json();
    const mine = await (await call(`/mine?team=${TEAM}&voter=${uuid(1)}`)).json();
    expect(mine.ids.sort()).toEqual([...ids].sort());
    expect(mine.at).toBe(at);
  });
});

describe("/stats cache", () => {
  it("serves a cached value unless fresh=1", async () => {
    const [a, b] = roster();
    await submit(TEAM, uuid(1), [a]);
    const first = await (await call(`/stats?team=${TEAM}`)).json();
    expect(first.n).toBe(1);
    await submit(TEAM, uuid(2), [b]);
    // Cached copy is still the old one.
    expect((await (await call(`/stats?team=${TEAM}`)).json()).n).toBe(1);
    // fresh=1 bypasses the cache and returns the new totals.
    expect((await (await call(`/stats?team=${TEAM}&fresh=1`)).json()).n).toBe(2);
  });

  it("sets a public Cache-Control header", async () => {
    const res = await call(`/stats?team=${TEAM}&fresh=1`);
    expect(res.headers.get("Cache-Control")).toBe("public, max-age=60");
  });
});

describe("IP rate limit", () => {
  const ip = "203.0.113.7";

  it("blocks the 21st new voter from one IP, but not existing voters or other IPs", async () => {
    const ids = [roster()[0]];
    for (let i = 1; i <= 20; i++) expect((await submit(TEAM, uuid(i), ids, { ip })).status).toBe(200);
    const blocked = await submit(TEAM, uuid(21), ids, { ip });
    expect(blocked.status).toBe(429);
    expect(await blocked.json()).toEqual({ error: "rate_limited" });
    expect((await getStats(TEAM)).n).toBe(20);

    // Existing voter may still update, even withdraw.
    expect((await submit(TEAM, uuid(1), [roster()[1]], { ip })).status).toBe(200);
    expect((await submit(TEAM, uuid(2), [], { ip })).status).toBe(200);
    // A different IP and a different team are unaffected.
    expect((await submit(TEAM, uuid(21), ids, { ip: "203.0.113.8" })).status).toBe(200);
    expect((await submit(OTHER_TEAM, uuid(22), [roster(OTHER_TEAM)[0]], { ip })).status).toBe(200);
  });

  it("only counts new voters from the last 24 hours", async () => {
    const ids = [roster()[0]];
    for (let i = 1; i <= 20; i++) await submit(TEAM, uuid(i), ids, { ip });
    const old = new Date(Date.now() - 2 * 86400000).toISOString();
    await env.DB.prepare("UPDATE picks SET created_at = ?").bind(old).run();
    expect((await submit(TEAM, uuid(30), ids, { ip })).status).toBe(200);
  });
});
