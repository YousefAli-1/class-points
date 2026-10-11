import { defineConfig, devices } from "@playwright/test";

const baseURL = "http://localhost:5173";

export default defineConfig({
  testDir: "./e2e",
  use: { baseURL },
  projects: [
    {
      name: "ipad-landscape",
      use: { ...devices["iPad Pro 11 landscape"], viewport: { width: 1180, height: 820 } },
    },
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: {
    command: "npm run dev",
    url: baseURL,
    reuseExistingServer: !process.env.CI,
  },
});
