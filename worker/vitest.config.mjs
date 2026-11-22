import { defineConfig } from "vitest/config";
import { cloudflareTest } from "@cloudflare/vitest-pool-workers";

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./wrangler.toml" },
      // The pool bundles an older workerd than wrangler.toml's compatibility_date allows.
      // LOCKED is pinned to "false" here so the suite does not follow wrangler.toml, which is set to "true" at launch
      // (roadmap P1-6). The locked-flow tests pass LOCKED: "true" themselves.
      miniflare: { compatibilityDate: "2026-08-01", bindings: { LOCKED: "false" } },
    }),
  ],
  test: {
    // worker/scripts/*.test.mjs run under node --test (see package.json), not in workerd.
    include: ["test/**/*.test.js"],
    setupFiles: ["./test/setup.js"],
  },
});
