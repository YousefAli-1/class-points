import { fileURLToPath, URL } from "node:url";
import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const fromRoot = (path: string) => fileURLToPath(new URL(path, import.meta.url));

/** Path aliases shared by Vite and both Vitest configs (mirrors tsconfig `paths`). */
export const alias = {
  "@shared": fromRoot("./src/shared"),
  "@client": fromRoot("./src/client"),
  "@worker": fromRoot("./src/worker"),
};

export default defineConfig({
  plugins: [react(), tailwindcss(), cloudflare()],
  resolve: { alias },
});
