import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = new URL("../../docs/", import.meta.url);
const ctx = vm.createContext({});
for (const f of ["limit.js", "stats.js"]) vm.runInContext(readFileSync(new URL(f, root), "utf8"), ctx, { filename: fileURLToPath(new URL(f, root)) });
const { statLevel, statLine, statTier, statTitle, statsShown, tileTitle, playerHead } = vm.runInContext("({statLevel,statLine,statTier,statTitle,statsShown,tileTitle,playerHead})", ctx);

const BAT_A = { g: 113, pa: 436, avg: "0.282", ops: "0.771", hr: 13 };
const BAT_D = { g: 52, pa: 170, avg: "0.271", ops: "1.051", hr: 7 };
const PIT_A = { g: 18, ip: "36.1", era: "1.71", whip: "1.47", so: 34 };
const PIT_D = { g: 8, ip: "36.2", era: "2.50", whip: "1.22", so: 26 };

test("batter line shows the level with more plate appearances", () => {
  assert.equal(statLine({ g: "I", s: { A: BAT_A, D: BAT_D } }), "一軍 OPS .771");
  assert.equal(statLine({ g: "O", s: { A: { ...BAT_A, pa: 10 }, D: BAT_D } }), "二軍 OPS 1.051");
});

test("pitcher line compares innings by outs, not by decimal", () => {
  assert.equal(statLine({ g: "P", s: { A: PIT_A } }), "一軍 ERA 1.71");
  assert.equal(statLevel({ g: "P", s: { A: PIT_A, D: PIT_D } }), "D"); // 36.2 > 36.1
  assert.equal(statLevel({ g: "P", s: { A: { ...PIT_A, ip: "12.0" }, D: { ...PIT_D, ip: "11.2" } } }), "A");
});

test("ties go to 一軍", () => {
  assert.equal(statLevel({ g: "C", s: { A: BAT_A, D: { ...BAT_D, pa: BAT_A.pa } } }), "A");
});

test("no s means no games this season", () => {
  assert.equal(statLevel({ g: "P" }), null);
  assert.equal(statLine({ g: "P" }), "本季未出賽");
  assert.equal(statTitle({ g: "I" }), "本季未出賽");
});

test("title lists every level with full numbers", () => {
  assert.equal(statTitle({ g: "I", s: { A: BAT_A, D: BAT_D } }),
    "一軍 113 場 · 436 打席 · 打擊率 .282 · OPS .771 · 全壘打 13（一軍主力）\n" +
    "二軍 52 場 · 170 打席 · 打擊率 .271 · OPS 1.051 · 全壘打 7");
  assert.equal(statTitle({ g: "P", s: { D: PIT_D } }), "二軍 8 場 · 36.2 局 · ERA 2.50 · WHIP 1.22 · 奪三振 26");
});

test("missing keys (blank or dash cells on the site) do not crash", () => {
  assert.equal(statLine({ g: "P", s: { A: { g: 1, ip: "1.0" } } }), "一軍 ERA –");
  assert.equal(statLine({ g: "I", s: { A: { g: 1 }, D: { g: 2, pa: 3, avg: "0.333" } } }), "二軍 OPS –");
  assert.equal(statTitle({ g: "P", s: { D: { g: 2 } } }), "二軍 2 場 · – 局 · ERA – · WHIP – · 奪三振 –（樣本少）");
});

test("stats show only for teams whose stats were scraped", () => {
  assert.equal(statsShown({ stats: true }), true);
  assert.equal(statsShown({ stats: false }), false);
  assert.equal(statsShown({}), false);
});

test("tile title keeps stats when the 60-man cap disables the tile", () => {
  const p = { no: "12", n: "江國豪", g: "P", s: { A: PIT_A } };
  const full = "一軍 18 場 · 36.1 局 · ERA 1.71 · WHIP 1.47 · 奪三振 34";
  assert.equal(tileTitle(p, true, false), "12 江國豪\n" + full);
  assert.equal(tileTitle(p, true, true), "已達 60 人上限，先移除一位才能再加入\n" + full);
  assert.equal(tileTitle(p, false, false), "12 江國豪");
  assert.equal(tileTitle({ no: "1", n: "甲", g: "I" }, true, false), "1 甲\n本季未出賽");
});

test("player head carries the override tag for title and aria-label", () => {
  assert.equal(playerHead({ no: "8", n: "王威晨" }), "8 王威晨");
  assert.equal(playerHead({ no: "8", n: "王威晨", tag: "FA" }), "8 王威晨 FA");
  assert.equal(tileTitle({ no: "8", n: "王威晨", g: "I", tag: "FA" }, false, false), "8 王威晨 FA");
});

const pit = (ip, lv = "A") => ({ g: "P", s: { [lv]: { g: 5, ip } } });
const bat = (pa, lv = "A") => ({ g: "I", s: { [lv]: { g: 5, pa } } });

test("tier: pitchers low under 10 IP, boundary 10.0 is normal", () => {
  assert.equal(statTier(pit("9.2")), "low");
  assert.equal(statTier(pit("10.0")), null);
  assert.equal(statTier(pit("0.1", "D")), "low");
  assert.equal(statTier(pit("9.2", "D")), "low");
});

test("tier: hitters low under 30 PA, boundary 30 is normal", () => {
  assert.equal(statTier(bat(29)), "low");
  assert.equal(statTier(bat(30)), null);
  assert.equal(statTier(bat(5, "D")), "low");
});

test("tier: pitcher core from 40.0 IP in 一軍 only", () => {
  assert.equal(statTier(pit("39.2")), null);
  assert.equal(statTier(pit("40.0")), "core");
  assert.equal(statTier(pit("80.1", "D")), null);
});

test("tier: hitter core from 250 PA in 一軍 only", () => {
  assert.equal(statTier(bat(249)), null);
  assert.equal(statTier(bat(250)), "core");
  assert.equal(statTier(bat(300, "D")), null);
});

test("tier uses the shown level; no games or no s is null", () => {
  assert.equal(statTier({ g: "P" }), null);
  assert.equal(statTier({ g: "I", s: {} }), null);
  // 一軍 5 IP but 二軍 50 IP: shown level is D with plenty of work, not low, not core
  assert.equal(statTier({ g: "P", s: { A: { ip: "5.0" }, D: { ip: "50.0" } } }), null);
  // missing pa/ip counts as zero workload
  assert.equal(statTier({ g: "I", s: { A: { g: 1 } } }), "low");
});

test("title carries a tier hint so it is not colour-only", () => {
  assert.ok(statTitle(bat(10)).endsWith("（樣本少）"));
  assert.ok(statTitle(bat(300)).endsWith("（一軍主力）"));
  assert.ok(!/（/.test(statTitle(bat(100))));
});
