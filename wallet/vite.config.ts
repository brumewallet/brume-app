import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { crx } from "@crxjs/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import manifest from "./manifest.json";

export default defineConfig({
  plugins: [tailwindcss(), react(), crx({ manifest })],
  define: {
    global: "globalThis",
    "process.env.NODE_ENV": JSON.stringify(
      process.env.NODE_ENV ?? "production",
    ),
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "@brume/shared": path.resolve(__dirname, "../shared/src/index.ts"),
      "@token-list": path.resolve(__dirname, "token-list/src"),
      buffer: path.resolve(__dirname, "node_modules/buffer"),
    },
  },
  optimizeDeps: {
    include: ["buffer", "@solana/web3.js"],
  },
});
