import { defineConfig } from "vitest/config";
import { cloudflareTest } from "@cloudflare/vitest-pool-workers";

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./wrangler.toml" },
      // The pool bundles an older workerd than wrangler.toml's compatibility_date allows.
      miniflare: { compatibilityDate: "2026-08-01" },
    }),
  ],
  test: {
    // worker/scripts/*.test.mjs run under node --test (see package.json), not in workerd.
    include: ["test/**/*.test.js"],
    setupFiles: ["./test/setup.js"],
  },
});
