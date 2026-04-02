import "dotenv/config";
import { defineConfig } from "prisma/config";

const datasourceUrl = process.env.DATABASE_URL ?? "";

function deriveShadowDatabaseUrl(url: string) {
  if (!url) {
    return "";
  }

  try {
    const parsed = new URL(url);
    const databaseName = parsed.pathname.replace(/^\//, "");

    if (!databaseName) {
      return "";
    }

    parsed.pathname = `/${databaseName}_shadow`;
    return parsed.toString();
  } catch {
    return "";
  }
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "node prisma/seed.mjs",
  },
  datasource: {
    url: datasourceUrl,
    shadowDatabaseUrl: deriveShadowDatabaseUrl(datasourceUrl),
  },
});
