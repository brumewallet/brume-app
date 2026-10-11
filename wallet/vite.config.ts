import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { crx } from "@crxjs/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import manifest from "./manifest.json";

// Dev builds also talk to a local API (VITE_BRUME_API_ORIGIN=http://localhost:3000).
// Release builds get only the hosts in manifest.json.
function manifestFor(mode: string) {
  if (mode !== "development") return manifest;
  return {
    ...manifest,
    host_permissions: [...manifest.host_permissions, "http://localhost/*", "http://127.0.0.1/*"],
  };
}

export default defineConfig(({ mode }) => ({
  plugins: [tailwindcss(), react(), crx({ manifest: manifestFor(mode) })],
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
}));
