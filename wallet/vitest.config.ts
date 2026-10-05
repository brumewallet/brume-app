import path from "node:path";
import { defineConfig } from "vitest/config";

// token-list is a vendored upstream package with its own tests; only test/ is ours.
const alias = { "@": path.resolve(__dirname, "src") };
// The SDK uses directory imports that Node ESM rejects, so Vite transforms it.
const server = { deps: { inline: [/@loyal-labs\//] } };

export default defineConfig({
  resolve: { alias },
  test: {
    projects: [
      {
        resolve: { alias },
        test: {
          name: "unit",
          server,
          // Large FUZZ_RUNS values need more than the 5 s default.
          testTimeout: 10 * 60_000,
          include: ["test/unit/**/*.test.ts"],
        },
      },
      {
        // Starts a local validator forked from mainnet-beta; needs network access once.
        resolve: { alias },
        test: {
          name: "mainnet-fork",
          server,
          include: ["test/mainnet-fork/**/*.test.ts"],
          globalSetup: ["test/mainnet-fork/global-setup.ts"],
          testTimeout: 30 * 60_000,
          hookTimeout: 10 * 60_000,
          fileParallelism: false,
        },
      },
    ],
  },
});
