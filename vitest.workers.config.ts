import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";
import { alias } from "./vite.config.ts";

export default defineConfig(async () => {
  // Read on the Node side; the setup file applies them inside the Workers runtime.
  const migrations = await readD1Migrations("migrations");

  return {
    plugins: [
      cloudflareTest({
        wrangler: { configPath: "./wrangler.jsonc" },
        miniflare: {
          bindings: {
            TEST_MIGRATIONS: migrations,
            // Pinned so tests behave the same with or without a local (gitignored) .dev.vars.
            SETUP_CODE: "dev-setup-code",
          },
        },
      }),
    ],
    resolve: { alias },
    test: {
      include: ["tests/worker/**/*.test.ts"],
      setupFiles: ["./tests/worker/apply-migrations.ts"],
    },
  };
});
