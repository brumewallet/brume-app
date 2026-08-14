import { defineConfig } from "vitest/config";

// token-list is a vendored upstream package with its own ava-based tests — not ours to run here.
export default defineConfig({
  test: {
    include: ["src/**/*.{test,spec}.ts"],
  },
});
