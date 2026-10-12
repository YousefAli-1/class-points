import js from "@eslint/js";
import { defineConfig, globalIgnores } from "eslint/config";
import reactHooks from "eslint-plugin-react-hooks";
import { reactRefresh } from "eslint-plugin-react-refresh";
import globals from "globals";
import tseslint from "typescript-eslint";

export default defineConfig([
  globalIgnores([
    "dist",
    ".wrangler",
    "playwright-report",
    "test-results",
    "worker-configuration.d.ts",
    // Process notes and reviewers' scratch copies of the tree (gitignored), not project code.
    ".superpowers",
  ]),
  {
    files: ["**/*.js"],
    extends: [js.configs.recommended],
    languageOptions: { globals: globals.node },
  },
  {
    files: ["**/*.{ts,tsx}"],
    extends: [js.configs.recommended, tseslint.configs.recommended],
  },
  {
    files: ["src/client/**/*.{ts,tsx}", "tests/client/**/*.{ts,tsx}"],
    extends: [reactHooks.configs.flat.recommended, reactRefresh.configs.vite()],
    languageOptions: { globals: globals.browser },
  },
  {
    files: ["*.ts", "scripts/**/*.ts", "e2e/**/*.ts"],
    languageOptions: { globals: globals.node },
  },
]);
