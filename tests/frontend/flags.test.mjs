import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const src = new URL("../../docs/flags.js", import.meta.url);

function flagsOn(hostname) {
  const ctx = vm.createContext({ location: { hostname } });
  vm.runInContext(readFileSync(src, "utf8"), ctx, { filename: fileURLToPath(src) });
  return vm.runInContext("FLAGS", ctx);
}
test("official is on for localhost and 127.0.0.1", () => {
  assert.equal(flagsOn("localhost").official, true);
  assert.equal(flagsOn("127.0.0.1").official, true);
});
test("official is off on the production site and other hosts", () => {
  assert.equal(flagsOn("s22shadowl.github.io").official, false);
  assert.equal(flagsOn("127.0.0.2").official, false);
  assert.equal(flagsOn("").official, false);
});
function isLocal(hostname) {
  const ctx = vm.createContext({ location: { hostname } });
  vm.runInContext(readFileSync(src, "utf8"), ctx, { filename: fileURLToPath(src) });
  return vm.runInContext("IS_LOCAL", ctx);
}
// IS_LOCAL picks the API (local Worker) and the official file (sample), independent of FLAGS.official.
test("IS_LOCAL is true for localhost and 127.0.0.1 only", () => {
  assert.equal(isLocal("localhost"), true);
  assert.equal(isLocal("127.0.0.1"), true);
  assert.equal(isLocal("s22shadowl.github.io"), false);
  assert.equal(isLocal("example.com"), false);
});

// flags.js decides IS_LOCAL; no other script may test the hostname itself (app.js only reads IS_LOCAL, plus the
// local Worker URL it points to when IS_LOCAL is true).
test("only flags.js decides whether the page is local", () => {
  const dir = new URL("../../docs/", import.meta.url);
  const offenders = [];
  for (const f of readdirSync(dir).filter((f) => f.endsWith(".js") && f !== "flags.js")) {
    const code = readFileSync(new URL(f, dir), "utf8").replace(/http:\/\/localhost:8787/g, "");
    if (/location\.hostname|LOCAL_HOSTS|["'`](localhost|127\.0\.0\.1)["'`]/.test(code)) offenders.push(f);
  }
  assert.deepEqual(offenders, []);
});

test("isInAppBrowser: LINE, Facebook, Instagram and Threads in-app browsers", () => {
  const ctx = vm.createContext({ location: { hostname: "x" } });
  vm.runInContext(readFileSync(src, "utf8"), ctx, { filename: fileURLToPath(src) });
  const isInApp = vm.runInContext("isInAppBrowser", ctx);
  const ios = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148";
  const android = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/130.0.0.0 Mobile Safari/537.36";
  for (const ua of [
    ios + " Safari Line/14.19.0",
    android + " Line/14.19.0/IAB",
    ios + " [FBAN/FBIOS;FBAV/480.0.0.0;FBBV/1;FBDV/iPhone15,2]",
    android + " [FB_IAB/FB4A;FBAV/480.0.0.0;]",
    ios + " Instagram 350.0.0.0 (iPhone15,2; iOS 18_0)",
    ios + " Barcelona 350.0.0.0 (iPhone15,2; iOS 18_0)",
    android + " Threads 350.0.0.0",
  ]) assert.equal(isInApp(ua), true, ua);
  for (const ua of [
    ios + " Version/18.0 Safari/604.1",
    android,
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64; rv:130.0) Gecko/20100101 Firefox/130.0",
    "",
    undefined,
  ]) assert.equal(isInApp(ua), false, String(ua));
});
