// Starts one E2E server: the production build on Wrangler, with its own empty local D1.
//
//   node e2e/serve.ts --name ipad --port 8788 --inspector-port 9330 [--build]
//
// Every run wipes `.wrangler/e2e/<name>` and applies the migrations there, so tests always begin
// with no teacher. It never touches `.wrangler/state`, the database of `npm run dev`.
import { spawn, spawnSync } from "node:child_process";
import { rmSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";

/** The setup code the E2E server accepts (the tests type it into the setup wizard). */
const SETUP_CODE = "e2e-code";

const root = join(import.meta.dirname, "..");
const bin = (pkg: string, file: string) => join(root, "node_modules", pkg, "bin", file);
const WRANGLER = bin("wrangler", "wrangler.js");
const VITE = bin("vite", "vite.js");

const { values } = parseArgs({
  options: {
    name: { type: "string" },
    port: { type: "string" },
    "inspector-port": { type: "string" },
    build: { type: "boolean", default: false },
  },
});
const { name, port } = values;
const inspectorPort = values["inspector-port"];
if (!name || !/^[a-z-]+$/.test(name) || !port || !inspectorPort) {
  console.error("Usage: node e2e/serve.ts --name <name> --port <port> --inspector-port <port> [--build]");
  process.exit(2);
}

const persistTo = join(".wrangler", "e2e", name);
const env = { ...process.env, WRANGLER_SEND_METRICS: "false" };

function run(file: string, args: string[]): void {
  const result = spawnSync(process.execPath, [file, ...args], { cwd: root, env, stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

if (values.build) run(VITE, ["build", "--logLevel", "warn"]);

// A fresh database for every run. Windows can hold the file for a moment after the last server exits.
rmSync(join(root, persistTo), { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
run(WRANGLER, ["d1", "migrations", "apply", "DB", "--local", "--persist-to", persistTo]);

// `vite build` writes the deployable Worker and its config here; Wrangler serves it like production.
const server = spawn(
  process.execPath,
  [
    WRANGLER,
    "dev",
    "--config",
    join("dist", "class_points", "wrangler.json"),
    "--port",
    port,
    "--inspector-port",
    inspectorPort,
    "--persist-to",
    persistTo,
    "--var",
    `SETUP_CODE:${SETUP_CODE}`,
    "--show-interactive-dev-session=false",
    // Errors only: on Windows the local proxy logs harmless "recovered on attempt 2" warnings.
    "--log-level",
    "error",
  ],
  { cwd: root, env, stdio: "inherit" },
);

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => server.kill(signal));
}
server.on("exit", (code) => process.exit(code ?? 0));
