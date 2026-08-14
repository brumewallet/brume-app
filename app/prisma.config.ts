import { config as loadEnv } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "prisma/config";

const appRoot = path.dirname(fileURLToPath(import.meta.url));

loadEnv({ path: path.join(appRoot, ".env") });
loadEnv({ path: path.join(appRoot, ".env.local"), override: true });

function envUrl(name: string): string | undefined {
  const raw = process.env[name]?.trim();
  if (!raw) return undefined;
  const v = raw.replace(/^["']|["']$/g, "").trim();
  return v || undefined;
}

const datasourceUrl =
  envUrl("DIRECT_URL") ||
  envUrl("DATABASE_URL") ||
  "postgresql://placeholder:placeholder@localhost:5432/brume";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: datasourceUrl,
  },
});
