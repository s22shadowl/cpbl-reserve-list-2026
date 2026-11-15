import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

function flagsOn(hostname) {
  const ctx = vm.createContext({ location: { hostname } });
  vm.runInContext(readFileSync(new URL("../docs/flags.js", import.meta.url), "utf8"), ctx, { filename: "flags.js" });
  return vm.runInContext("FLAGS", ctx);
}
function localHosts() {
  const ctx = vm.createContext({ location: { hostname: "x" } });
  vm.runInContext(readFileSync(new URL("../docs/flags.js", import.meta.url), "utf8"), ctx, { filename: "flags.js" });
  return { hosts: vm.runInContext("LOCAL_HOSTS", ctx), isLocal: vm.runInContext("IS_LOCAL", ctx) };
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
test("flags.js is the single source of the local host list", () => {
  const { hosts, isLocal } = localHosts();
  assert.deepEqual([...hosts], ["localhost", "127.0.0.1"]);
  assert.equal(isLocal, false);
  const ctx = vm.createContext({ location: { hostname: "localhost" } });
  vm.runInContext(readFileSync(new URL("../docs/flags.js", import.meta.url), "utf8"), ctx);
  assert.equal(vm.runInContext("IS_LOCAL", ctx), true);
});
