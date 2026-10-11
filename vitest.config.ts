import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";
import { alias } from "./vite.config.ts";

export default defineConfig({
  test: {
    projects: [
      {
        resolve: { alias },
        test: {
          name: "shared",
          environment: "node",
          include: ["tests/shared/**/*.test.ts"],
        },
      },
      {
        plugins: [react()],
        resolve: { alias },
        test: {
          name: "client",
          environment: "jsdom",
          include: ["tests/client/**/*.test.{ts,tsx}"],
          setupFiles: ["./tests/client/setup.ts"],
        },
      },
    ],
  },
});
