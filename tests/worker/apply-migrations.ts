import { applyD1Migrations } from "cloudflare:test";
import { env } from "cloudflare:workers";

// Runs before each test file. Applied migrations are recorded, so re-running is a no-op;
// an empty migrations/ directory yields an empty list, which is also a no-op.
await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
