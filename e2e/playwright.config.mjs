import { defineConfig } from "@playwright/test";

// The frontend on localhost always talks to http://localhost:8787 (docs/app.js), so the Worker must own that port:
// stop any `npm run dev` first. The static server uses 8081 so a 8080 preview can stay up.
export default defineConfig({
  testDir: "tests",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: "list",
  use: { baseURL: "http://localhost:8081", viewport: { width: 390, height: 900 } },
  webServer: [
    {
      // --var LOCKED:false: submit flows need an unlocked Worker even after wrangler.toml is set to LOCKED = "true";
      // the locked flow is mocked with page.route.
      command: "./node_modules/.bin/wrangler dev --port 8787 --persist-to ../e2e/.state --var LOCKED:false",
      cwd: "../worker",
      url: "http://localhost:8787/stats?team=AEO",
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: "python3 -m http.server -d ../docs 8081",
      url: "http://localhost:8081/",
      reuseExistingServer: false,
      stdout: "ignore",
      stderr: "ignore",
    },
  ],
});
