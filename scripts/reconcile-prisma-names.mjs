#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "@prisma/client";
import dotenv from "dotenv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, "..");
const DEFAULT_OUTPUT_PATH = "/tmp/lbn-prisma-name-reconcile.sql";

function parseArgs(argv) {
  const parsed = {
    apply: false,
    output: DEFAULT_OUTPUT_PATH,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];

    if (current === "--help" || current === "-h") {
      parsed.help = true;
      continue;
    }

    if (current === "--apply") {
      parsed.apply = true;
      continue;
    }

    if (current === "--output") {
      const value = argv[index + 1];

      if (!value || value.startsWith("--")) {
        throw new Error("Missing value for --output");
      }

      parsed.output = value;
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${current}`);
  }

  return parsed;
}

function printUsage() {
  console.log(
    [
      "Usage:",
      "  npm run db:reconcile-prisma-names -- [--apply] [--output <file>]",
      "",
      "Behavior:",
      "  - Generates Prisma schema diff SQL with --script.",
      "  - Allows only name-only operations: RENAME INDEX, DROP FOREIGN KEY, ADD FOREIGN KEY.",
      "  - Dry-run by default. Use --apply only after a fresh database backup.",
      "",
      "Examples:",
      "  ENV_FILE=/etc/jiuzhuang-crm/jiuzhuang-crm.env npm run db:reconcile-prisma-names",
      "  ENV_FILE=/etc/jiuzhuang-crm/jiuzhuang-crm.env npm run db:reconcile-prisma-names -- --apply",
    ].join("\n"),
  );
}

function loadEnvironment() {
  const envFile = process.env.ENV_FILE?.trim();

  if (!envFile) {
    const defaultEnvPath = path.join(PROJECT_ROOT, ".env");

    if (existsSync(defaultEnvPath)) {
      dotenv.config({ path: defaultEnvPath, quiet: true });
    }

    return;
  }

  const resolvedEnvPath = path.isAbsolute(envFile)
    ? envFile
    : path.resolve(PROJECT_ROOT, envFile);

  if (!existsSync(resolvedEnvPath)) {
    throw new Error(`ENV_FILE does not exist: ${resolvedEnvPath}`);
  }

  dotenv.config({ path: resolvedEnvPath, quiet: true });
}

function ensureDatabaseUrl() {
  if (!process.env.DATABASE_URL?.trim()) {
    throw new Error("DATABASE_URL is required.");
  }
}

function runDiffScript() {
  const result = spawnSync(
    process.execPath,
    [
      path.join(PROJECT_ROOT, "node_modules", "prisma", "build", "index.js"),
      "migrate",
      "diff",
      "--from-config-datasource",
      "--to-schema",
      "prisma/schema.prisma",
      "--script",
    ],
    {
      cwd: PROJECT_ROOT,
      env: process.env,
      encoding: "utf8",
    },
  );

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(`${result.stdout ?? ""}${result.stderr ?? ""}`.trim());
  }

  if (result.stderr?.trim()) {
    console.log(result.stderr.trim());
  }

  return (result.stdout ?? "").trim();
}

function splitStatements(sql) {
  return sql
    .split(/;\s*(?:\r?\n|$)/)
    .map((statement) =>
      statement
        .split(/\r?\n/)
        .filter((line) => !line.trim().startsWith("--"))
        .join("\n")
        .trim(),
    )
    .filter(Boolean);
}

function assertNameOnlyStatement(statement) {
  const normalized = statement.replace(/\s+/g, " ").trim();
  const allowed =
    /^ALTER TABLE `[^`]+` RENAME INDEX `[^`]+` TO `[^`]+`$/i.test(normalized) ||
    /^ALTER TABLE `[^`]+` DROP FOREIGN KEY `[^`]+`$/i.test(normalized) ||
    /^ALTER TABLE `[^`]+` ADD CONSTRAINT `[^`]+` FOREIGN KEY \(`[^`]+`(?:, `[^`]+`)*\) REFERENCES `[^`]+`\(`[^`]+`(?:, `[^`]+`)*\) ON DELETE (?:RESTRICT|CASCADE|SET NULL|NO ACTION) ON UPDATE (?:RESTRICT|CASCADE|SET NULL|NO ACTION)$/i.test(
      normalized,
    );

  if (!allowed) {
    throw new Error(`Detected non name-only SQL:\n${statement}`);
  }
}

async function applyStatements(statements) {
  const prisma = new PrismaClient({
    adapter: new PrismaMariaDb(process.env.DATABASE_URL),
    log: ["warn", "error"],
  });

  try {
    for (const statement of statements) {
      console.log(statement.replace(/\s+/g, " ").slice(0, 240));
      await prisma.$executeRawUnsafe(statement);
    }
  } finally {
    await prisma.$disconnect();
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    printUsage();
    return;
  }

  loadEnvironment();
  ensureDatabaseUrl();

  const sql = runDiffScript();

  if (!sql || /No difference detected/i.test(sql)) {
    console.log("No schema diff detected.");
    return;
  }

  const outputPath = path.isAbsolute(args.output)
    ? args.output
    : path.resolve(PROJECT_ROOT, args.output);
  const statements = splitStatements(sql);

  for (const statement of statements) {
    assertNameOnlyStatement(statement);
  }

  writeFileSync(outputPath, `${sql}\n`, "utf8");
  console.log(`Generated name-only SQL: ${outputPath}`);
  console.log(`Statements: ${statements.length}`);

  if (!args.apply) {
    console.log("Dry run only. Re-run with --apply after a fresh database backup.");
    return;
  }

  await applyStatements(statements);
  console.log("Prisma physical names reconciled.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
