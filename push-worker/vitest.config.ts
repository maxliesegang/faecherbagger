import { defineConfig } from "vitest/config";
import { cloudflareTest } from "@cloudflare/vitest-pool-workers";

// The Worker's request handlers need a real D1 and a real `fetch` to exercise,
// which the node-environment suite in vite.config.ts cannot give them. This
// config runs `push-worker/test` inside workerd instead, against an in-memory
// D1 created fresh per test file.
export default defineConfig({
  // Anchored here so the run picks up this directory's tests and wrangler
  // config rather than the repository root's, whatever the invoking cwd.
  root: import.meta.dirname,
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./wrangler.jsonc" },
      miniflare: {
        bindings: {
          // Throwaway VAPID pair, generated for the suite alone: these prove
          // the handler loads and uses keys, and sign pushes that never leave
          // the test. Real keys live in secrets and `.dev.vars`.
          VAPID_PUBLIC_KEY:
            "BMNBctmdQyC_JwKlU0DZk0wRAXjFU2e22iC9HX_RA25dr4b7IZ_YOOvf8PA6jP0_CaDTgheM5UorYJlHRkcxPnU",
          VAPID_PRIVATE_KEY: "rZVKR-JYox3aa8QViUciduPNJ9AeHa0AozYVGTy4kLc",
          VAPID_SUBJECT: "mailto:test@example.com",
          ADMIN_TOKEN: "test-admin-token",
        },
      },
    }),
  ],
  test: {
    include: ["test/**/*.test.ts"],
  },
});
