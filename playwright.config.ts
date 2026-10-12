import { defineConfig, devices, type PlaywrightTestConfig } from "@playwright/test";

// E2E runs against the production build served by Wrangler (`e2e/serve.ts`), never the dev server.
// Each project gets its own server and its own empty D1 under `.wrangler/e2e/<project>`, so the
// iPad and desktop runs can't see each other's taps. Inside a project the tests run one at a time
// on one shared class, created once by that project's setup step (`e2e/global.setup.ts`).

const SERVERS = {
  ipad: { port: 8788, inspectorPort: 9330 },
  desktop: { port: 8789, inspectorPort: 9331 },
} as const;

type ServerName = keyof typeof SERVERS;
type WebServer = Exclude<NonNullable<PlaywrightTestConfig["webServer"]>, readonly unknown[]>;

const baseURL = (name: ServerName) => `http://127.0.0.1:${SERVERS[name].port}`;
const sessionFile = (name: ServerName) => `test-results/.auth/${name}.json`;

/** The spec's primary iPad viewport (Global Constraints): 24 tiles must fit at 1180×820. */
const ipad = { ...devices["iPad Pro 11 landscape"], viewport: { width: 1180, height: 820 } };
const desktop = { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } };

const webServer = (name: ServerName, build: boolean): WebServer => {
  const { port, inspectorPort } = SERVERS[name];
  return {
    command: `node e2e/serve.ts --name ${name} --port ${port} --inspector-port ${inspectorPort}${build ? " --build" : ""}`,
    url: `${baseURL(name)}/api/health`,
    // Always a fresh server and database: a leftover one would carry the last run's class.
    reuseExistingServer: false,
    timeout: 180_000,
    stdout: "ignore",
    stderr: "pipe",
  };
};

export default defineConfig({
  testDir: "./e2e",
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 2,
  // WebKit on Windows draws the confetti and Motion animations in software: iPad tests take up to ~20 s.
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "setup-ipad",
      testMatch: /global\.setup\.ts/,
      metadata: { sessionFile: sessionFile("ipad") },
      use: { ...ipad, baseURL: baseURL("ipad") },
    },
    {
      name: "ipad",
      testMatch: /\.spec\.ts$/,
      dependencies: ["setup-ipad"],
      workers: 1,
      use: { ...ipad, baseURL: baseURL("ipad"), storageState: sessionFile("ipad") },
    },
    {
      name: "setup-desktop",
      testMatch: /global\.setup\.ts/,
      metadata: { sessionFile: sessionFile("desktop") },
      use: { ...desktop, baseURL: baseURL("desktop") },
    },
    {
      name: "desktop",
      testMatch: /\.spec\.ts$/,
      dependencies: ["setup-desktop"],
      workers: 1,
      use: { ...desktop, baseURL: baseURL("desktop"), storageState: sessionFile("desktop") },
    },
  ],
  // Started in order: the first one builds the app, the second reuses that build.
  // E2E_SKIP_BUILD=1 reuses the last build in dist/ (quicker when only the tests changed).
  webServer: [webServer("ipad", !process.env.E2E_SKIP_BUILD), webServer("desktop", false)],
});
