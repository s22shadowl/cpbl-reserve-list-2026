import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const root = new URL("../docs/", import.meta.url);
const ctx = vm.createContext({});
vm.runInContext(readFileSync(new URL("stats.js", root), "utf8"), ctx, { filename: "stats.js" });
const { statLevel, statLine, statTitle } = vm.runInContext("({statLevel,statLine,statTitle})", ctx);

const BAT_A = { g: 113, pa: 436, avg: "0.282", ops: "0.771", hr: 13 };
const BAT_D = { g: 52, pa: 170, avg: "0.271", ops: "1.051", hr: 7 };
const PIT_A = { g: 18, ip: "36.1", era: "1.71", whip: "1.47", so: 34 };
const PIT_D = { g: 8, ip: "36.2", era: "2.50", whip: "1.22", so: 26 };

test("batter line shows the level with more plate appearances", () => {
  assert.equal(statLine({ g: "I", s: { A: BAT_A, D: BAT_D } }), "一軍 .282 · OPS .771");
  assert.equal(statLine({ g: "O", s: { A: { ...BAT_A, pa: 10 }, D: BAT_D } }), "二軍 .271 · OPS 1.051");
});

test("pitcher line compares innings by outs, not by decimal", () => {
  assert.equal(statLine({ g: "P", s: { A: PIT_A } }), "一軍 ERA 1.71 · 36.1 局");
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
    "一軍 113 場 · 436 打席 · 打擊率 .282 · OPS .771 · 全壘打 13\n" +
    "二軍 52 場 · 170 打席 · 打擊率 .271 · OPS 1.051 · 全壘打 7");
  assert.equal(statTitle({ g: "P", s: { D: PIT_D } }), "二軍 8 場 · 36.2 局 · ERA 2.50 · WHIP 1.22 · 奪三振 26");
});
