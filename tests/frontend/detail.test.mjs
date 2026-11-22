// Player-detail dialog helpers (chips, stat table, tier note). Run: node --test tests/frontend/detail.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ctx = vm.createContext({});
for (const f of ["limit.js", "card.js", "stats.js", "detail.js"]) {
  const src = new URL("../../docs/" + f, import.meta.url);
  vm.runInContext(readFileSync(src, "utf8"), ctx, { filename: fileURLToPath(src) });
}
const { detailChips, detailTable, tierNote, isLongName, playerUrl } =
  vm.runInContext("({detailChips,detailTable,tierNote,isLongName,playerUrl})", ctx);
const plain = o => JSON.parse(JSON.stringify(o));
const REF = "2026-11-15";

const paz = { n:"帕蘇拉塔基斯利尼安", no:"119", g:"O", l:"二軍", b:"2008-01-10", dy:2026, dr:4, rk:"d" };
const liu = { n:"劉俊豪", no:"85", g:"I", p:"游擊手", l:"一軍", b:"2002-03-01",
  s:{ A:{g:57,pa:90,avg:"0.198",ops:"0.451",hr:0}, D:{g:21,pa:70,avg:"0.276",ops:"0.673",hr:0} } };
const pit = { n:"X", no:"1", g:"P", l:"一軍", b:"1997-06-17", dy:2019, dr:2,
  s:{ A:{g:20,ip:"26.0",era:"5.54",whip:"1.77",so:10} } };

test("detailChips order and kinds", () => {
  assert.deepEqual(plain(detailChips(paz, REF, "中外野手")).map(c => [c.text, c.kind]),
    [["中外野手","k"],["二軍",""],["18 歲",""],["新人","tg"],["2026 年選秀第 4 輪",""]]);
  assert.deepEqual(plain(detailChips(liu, REF, "游擊手")).map(c => c.text), ["游擊手","一軍","24 歲"]);
  assert.deepEqual(plain(detailChips({ ...liu, rk:"c" }, REF, "游擊手")).map(c => c.text), ["游擊手","一軍","24 歲","新人","今年自培轉正"]);
  assert.deepEqual(plain(detailChips({ ...liu, tag:"旅外FA" }, REF, "游擊手")).at(-1), { text:"旅外FA", kind:"tg" });
});
test("detailTable: transposed, shown column only with two levels", () => {
  assert.equal(detailTable(paz), null);
  const t = plain(detailTable(liu));
  assert.deepEqual(t.levels.map(l => [l.name, l.shown]), [["一軍", true], ["二軍", false]]);
  assert.deepEqual(t.rows.map(r => r.label), ["出賽","打席","打擊率","OPS","全壘打"]);
  assert.deepEqual(t.rows[2].values, [".198", ".276"]);
  const u = plain(detailTable(pit));
  assert.deepEqual(u.levels.map(l => l.shown), [false]);
  assert.deepEqual(u.rows.map(r => r.label), ["出賽","局數","ERA","WHIP","奪三振"]);
});
test("tierNote", () => {
  assert.equal(tierNote(paz), null);
  assert.equal(tierNote({ ...pit, s:{ A:{ g:3, ip:"5.0", era:"1", whip:"1", so:1 } } }), "樣本少：不到 10 局，卡片上以淡色顯示");
  assert.equal(tierNote({ ...pit, s:{ A:{ g:40, ip:"42.1", era:"1", whip:"1", so:1 } } }), "一軍主力：40 局以上，卡片上以粗體顯示");
  assert.equal(tierNote({ ...liu, s:{ D:{ g:5, pa:12 } } }), "樣本少：不到 30 打席，卡片上以淡色顯示");
});
test("playerUrl", () => assert.equal(playerUrl({ id:"0000006743" }), "https://www.cpbl.com.tw/team/person?Acnt=0000006743"));
test("isLongName", () => { assert.equal(isLongName("帕蘇拉塔基斯利尼安"), true); assert.equal(isLongName("林安可"), false); assert.equal(isLongName("12345678"), true); });
