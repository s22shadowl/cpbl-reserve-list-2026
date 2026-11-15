// Player-card corner helpers (age, badge, description). Run: node --test scripts/card.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const ctx = vm.createContext({});
vm.runInContext(readFileSync(new URL("../docs/card.js", import.meta.url), "utf8"), ctx, { filename: "card.js" });
const { ageOn, cornerBadge, cardNote, nameTag, isRookie } = vm.runInContext("({ageOn,cornerBadge,cardNote,nameTag,isRookie})", ctx);
const plain = o => JSON.parse(JSON.stringify(o));
const REF = "2026-11-15";

test("ageOn: birthday already passed this year", () => {
  assert.equal(ageOn("1999-03-01", REF), 27);
});
test("ageOn: birthday not reached yet", () => {
  assert.equal(ageOn("1999-12-01", REF), 26);
  assert.equal(ageOn("1999-11-16", REF), 26);
});
test("ageOn: birthday is the reference day", () => {
  assert.equal(ageOn("1999-11-15", REF), 27);
});
test("ageOn: leap day birth", () => {
  assert.equal(ageOn("2004-02-29", "2026-02-28"), 21);
  assert.equal(ageOn("2004-02-29", "2026-03-01"), 22);
});
test("ageOn: missing or malformed input gives null", () => {
  for (const b of [undefined, null, "", "abc", "1999-13-01", 1999]) assert.equal(ageOn(b, REF), null);
  assert.equal(ageOn("1999-03-01", undefined), null);
  assert.equal(ageOn("1999-03-01", "bad"), null);
  assert.equal(ageOn("2030-01-01", REF), null);
});

test("cornerBadge: rookie beats FA and draft year", () => {
  assert.deepEqual(plain(cornerBadge({ rk: "d", tag: "FA", dy: 2026 })), { kind: "rookie", text: "新人" });
  assert.deepEqual(plain(cornerBadge({ rk: "c" })), { kind: "rookie", text: "新人" });
});
test("cornerBadge: FA beats draft year and uses the tag label", () => {
  assert.deepEqual(plain(cornerBadge({ tag: "FA", dy: 2019 })), { kind: "fa", text: "FA" });
});
test("cornerBadge: draft year shown as year plus small suffix", () => {
  assert.deepEqual(plain(cornerBadge({ dy: 2019, dr: 3 })), { kind: "dy", text: "2019", small: "選秀" });
});
test("cornerBadge: nothing for undrafted players", () => {
  assert.equal(cornerBadge({ n: "甲" }), null);
});

test("cardNote: drafted veteran", () => {
  assert.equal(cardNote({ b: "1999-03-01", dy: 2019, dr: 3 }, REF), "27 歲 · 2019 年選秀第 3 輪");
});
test("cardNote: draft rookie and converted rookie", () => {
  assert.equal(cardNote({ b: "2004-05-01", rk: "d", dy: 2026, dr: 4 }, REF), "22 歲 · 新人：2026 年選秀第 4 輪");
  assert.equal(cardNote({ b: "2004-05-01", rk: "c" }, REF), "22 歲 · 新人：今年自培轉正");
});
test("cardNote: a tagged rookie keeps the tag in the note", () => {
  assert.equal(cardNote({ b: "2004-05-01", rk: "c", tag: "FA" }, REF), "22 歲 · 新人：今年自培轉正 · FA");
});
test("cardNote: missing pieces are skipped", () => {
  assert.equal(cardNote({ dy: 2019 }, REF), "2019 年選秀");
  assert.equal(cardNote({ b: "1999-03-01" }, REF), "27 歲");
  assert.equal(cardNote({}, REF), "");
  assert.equal(cardNote({ rk: "d", dy: 2026 }, REF), "新人：2026 年選秀");
});

test("nameTag and isRookie", () => {
  assert.equal(nameTag({ rk: "c", tag: "FA" }), "新人");
  assert.equal(nameTag({ tag: "FA" }), "FA");
  assert.equal(nameTag({}), null);
  assert.equal(isRookie({ rk: "d" }), true);
  assert.equal(isRookie({}), false);
});
