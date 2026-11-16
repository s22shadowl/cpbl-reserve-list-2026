// Fresh local D1 for every run (separate from `npm run dev` data in worker/.wrangler):
// schema + the same fake fan picks as `npm run db:seed`, persisted to e2e/.state.
import { execSync } from "node:child_process";
import { rmSync } from "node:fs";

const state = new URL("./.state/", import.meta.url).pathname;
const worker = new URL("../worker/", import.meta.url).pathname;
const run = cmd => execSync(cmd, { cwd: worker, stdio: "inherit" });

rmSync(state, { recursive: true, force: true });
run(`./node_modules/.bin/wrangler d1 execute DB --local --persist-to ${state} --file=schema.sql`);
run("node scripts/seed-dev.mjs");
run(`./node_modules/.bin/wrangler d1 execute DB --local --persist-to ${state} --file=.wrangler/seed-dev.sql`);
