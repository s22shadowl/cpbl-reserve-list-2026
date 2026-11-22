// Long-press helper (docs/press.js) with a fake element and fake timers. Run: node --test tests/frontend/press.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const src = new URL("../../docs/press.js", import.meta.url);
let timers = [];
const ctx = vm.createContext({
  Math,
  setTimeout: (f, ms) => { timers.push({ f, ms }); return timers.length; },
  clearTimeout: id => { if (id) timers[id - 1] = null; },
});
vm.runInContext(readFileSync(src, "utf8"), ctx, { filename: fileURLToPath(src) });
const longPress = vm.runInContext("longPress", ctx);

function setup() {
  timers = [];
  const el = new EventTarget(), log = { long: 0, clicks: 0 };
  longPress(el, () => log.long++);
  el.addEventListener("click", () => log.clicks++);
  const fire = (type, o = {}) => {
    const e = new Event(type, { cancelable: true });
    Object.assign(e, { pointerType: "touch", isPrimary: true, clientX: 0, clientY: 0, ...o });
    el.dispatchEvent(e);
    return e;
  };
  const run = () => { const t = timers.filter(Boolean); timers = []; t.forEach(x => x.f()); };
  return { fire, run, log };
}

test("fires after the delay and swallows the click that ends the press", () => {
  const { fire, run, log } = setup();
  fire("pointerdown");
  assert.equal(timers[0].ms, 500);
  run();
  fire("pointerup");
  const c = fire("click");
  assert.deepEqual([log.long, log.clicks, c.defaultPrevented], [1, 0, true]);
  fire("click");
  assert.equal(log.clicks, 1);
});

test("short tap clicks normally", () => {
  const { fire, run, log } = setup();
  fire("pointerdown"); fire("pointerup"); run(); fire("click");
  assert.deepEqual([log.long, log.clicks], [0, 1]);
});

test("mouse presses are ignored", () => {
  const { fire, run, log } = setup();
  fire("pointerdown", { pointerType: "mouse" }); run();
  assert.equal(log.long, 0);
});

test("moving beyond the slop cancels; small jitter does not", () => {
  const a = setup();
  a.fire("pointerdown"); a.fire("pointermove", { clientX: 11 }); a.run();
  assert.equal(a.log.long, 0);
  const b = setup();
  b.fire("pointerdown"); b.fire("pointermove", { clientX: 6, clientY: 6 }); b.run();
  assert.equal(b.log.long, 1);
});

test("a long press whose click never came does not eat the next tap", () => {
  const { fire, run, log } = setup();
  fire("pointerdown"); run(); fire("pointercancel");
  fire("pointerdown"); fire("pointerup"); fire("click");
  assert.equal(log.clicks, 1);
});

test("an armed swallow expires 400 ms after the lift (a later keyboard Enter still clicks)", () => {
  const { fire, run, log } = setup();
  fire("pointerdown"); run(); fire("pointerup");
  assert.equal(timers.filter(Boolean)[0]?.ms, 400);
  run(); fire("click");
  assert.equal(log.clicks, 1);
});

test("context menu is suppressed", () => {
  const { fire } = setup();
  assert.equal(fire("contextmenu").defaultPrevented, true);
});
