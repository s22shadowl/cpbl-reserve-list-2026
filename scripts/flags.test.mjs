import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

function flagsOn(hostname) {
  const ctx = vm.createContext({ location: { hostname } });
  vm.runInContext(readFileSync(new URL("../docs/flags.js", import.meta.url), "utf8"), ctx, { filename: "flags.js" });
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
