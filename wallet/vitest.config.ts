import path from "node:path";
import { defineConfig } from "vitest/config";

// token-list is a vendored upstream package with its own ava-based tests — not ours to run here.
export default defineConfig({
  // Mirrors vite.config.ts's "@" alias — vitest doesn't read that config,
  // so any test importing a "@/..." path needs it declared here too.
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  test: {
    include: ["src/**/*.{test,spec}.ts"],
  },
});
