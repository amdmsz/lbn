import "dotenv/config";
import { defineConfig } from "prisma/config";

const datasourceUrl = process.env.DATABASE_URL ?? "";
const shadowDatabaseUrl = process.env.SHADOW_DATABASE_URL?.trim() ?? "";

if (
  datasourceUrl &&
  shadowDatabaseUrl &&
  datasourceUrl.trim() === shadowDatabaseUrl
) {
  throw new Error("SHADOW_DATABASE_URL must not point to the same database as DATABASE_URL.");
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "node prisma/seed.mjs",
  },
  datasource: shadowDatabaseUrl
    ? {
        url: datasourceUrl,
        shadowDatabaseUrl,
      }
    : {
        url: datasourceUrl,
      },
});
