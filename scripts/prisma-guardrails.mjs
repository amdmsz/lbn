#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "@prisma/client";
import dotenv from "dotenv";
import {
  formatNameDriftReport,
  hasNameDrift,
  loadPrismaNameExpectations,
  readDatabaseNameDrift,
} from "./lib/prisma-name-drift.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, "..");
const GUARDRAILS_DOC = "docs/ops/prisma-migration-guardrails.md";
const MIGRATIONS_DIR = path.join(PROJECT_ROOT, "prisma", "migrations");
const SCHEMA_PATH = path.join(PROJECT_ROOT, "prisma", "schema.prisma");
const PRISMA_CLI_PATH = path.join(PROJECT_ROOT, "node_modules", "prisma", "build", "index.js");
const CLI_SCOPE = "prisma-guardrails";

loadEnvironment();

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
    fail(
      `ENV_FILE does not exist: ${resolvedEnvPath}`,
      [
        "请先修正 ENV_FILE，或先把目标环境变量导入当前 shell。",
        `更多说明见 ${GUARDRAILS_DOC}`,
      ].join("\n"),
    );
  }

  dotenv.config({ path: resolvedEnvPath, quiet: true });
}

function log(message) {
  console.log(`[${CLI_SCOPE}] ${message}`);
}

function fail(message, detail) {
  console.error(`[${CLI_SCOPE}] ERROR: ${message}`);

  if (detail) {
    console.error(detail);
  }

  console.error(`[${CLI_SCOPE}] See ${GUARDRAILS_DOC}`);
  process.exit(1);
}

function formatPrismaArgs(args) {
  return `prisma ${args.join(" ")}`;
}

function runPrisma(args, options = {}) {
  const {
    allowedExitCodes = [0],
    capture = false,
    label = formatPrismaArgs(args),
  } = options;

  log(`Running ${label}`);

  if (!existsSync(PRISMA_CLI_PATH)) {
    fail(
      `Local Prisma CLI not found: ${PRISMA_CLI_PATH}`,
      "请先执行 npm install 或 npm ci，确保 node_modules/prisma 已安装。",
    );
  }

  const result = spawnSync(process.execPath, [PRISMA_CLI_PATH, ...args], {
    cwd: PROJECT_ROOT,
    env: process.env,
    encoding: "utf8",
    stdio: capture ? "pipe" : "inherit",
  });

  if (result.error) {
    fail(`Failed to start ${label}`, String(result.error));
  }

  const exitCode = result.status ?? 1;
  const stdout = result.stdout ?? "";
  const stderr = result.stderr ?? "";
  const combined = `${stdout}${stderr}`.trim();

  if (capture && combined) {
    console.log(combined);
  }

  if (!allowedExitCodes.includes(exitCode)) {
    fail(`Command failed: ${label}`, combined || undefined);
  }

  return {
    exitCode,
    stdout,
    stderr,
    combined,
  };
}

function ensureDatabaseUrl() {
  if (!process.env.DATABASE_URL?.trim()) {
    fail(
      "DATABASE_URL is required.",
      [
        "请先设置 DATABASE_URL，再运行 Prisma 审计或发布命令。",
        "生产或预发请先确认它指向目标库，再继续后续动作。",
      ].join("\n"),
    );
  }
}

function ensureShadowDatabaseUrl() {
  const shadowDatabaseUrl = process.env.SHADOW_DATABASE_URL?.trim();

  if (!shadowDatabaseUrl) {
    fail(
      "SHADOW_DATABASE_URL is required for prisma:diff:migrations.",
      [
        "这个检查需要把 prisma/migrations 重放到独立 shadow database，再与目标 datasource 对比。",
        "请准备一个隔离的空 MySQL 库，并把 SHADOW_DATABASE_URL 指向它。",
      ].join("\n"),
    );
  }

  if (shadowDatabaseUrl === process.env.DATABASE_URL?.trim()) {
    fail(
      "SHADOW_DATABASE_URL must not point to DATABASE_URL.",
      "shadow database 必须是隔离库，不能与真实业务库复用。",
    );
  }
}

function ensureMigrationInputs() {
  ensureDatabaseUrl();

  if (!existsSync(SCHEMA_PATH)) {
    fail(`Missing Prisma schema file: ${SCHEMA_PATH}`);
  }

  if (!existsSync(MIGRATIONS_DIR)) {
    fail(`Missing Prisma migrations directory: ${MIGRATIONS_DIR}`);
  }
}

function readBooleanFlag(argv, flagName) {
  return argv.includes(flagName);
}

async function runPhysicalNameDriftCheck({ allowDrift = false } = {}) {
  const expectations = loadPrismaNameExpectations(SCHEMA_PATH);
  const prisma = new PrismaClient({
    adapter: new PrismaMariaDb(process.env.DATABASE_URL),
    log: ["warn", "error"],
  });

  try {
    const drift = await readDatabaseNameDrift(prisma, expectations);

    if (drift.skipped) {
      log(
        `Physical-name drift check skipped because lower_case_table_names=${drift.lowerCaseTableNames || "unknown"}.`,
      );
      return;
    }

    if (!hasNameDrift(drift)) {
      log("Physical table/index/foreign-key names match prisma/schema.prisma.");
      return;
    }

    const detail = [
      "检测到大小写敏感 MySQL 环境中的物理对象命名漂移。",
      "这通常来自 legacy 表/索引/外键名与当前 Prisma schema 不一致，会导致生产 migrate deploy 中途失败。",
      "",
      formatNameDriftReport(drift),
      "",
      "请先备份数据库，然后执行：",
      "  ENV_FILE=<env-file> npm run db:reconcile-prisma-names -- --apply",
    ].join("\n");

    if (allowDrift) {
      log(`Physical-name drift detected but explicitly allowed.\n${detail}`);
      return;
    }

    fail("Detected physical table/index/foreign-key name drift.", detail);
  } finally {
    await prisma.$disconnect();
  }
}

function collectStatusState() {
  const statusResult = runPrisma(["migrate", "status"], {
    allowedExitCodes: [0, 1],
    capture: true,
  });
  const text = statusResult.combined;

  return {
    hasFailedMigrations: /failed migrations/i.test(text),
    hasPendingMigrations:
      /Following migrations have not yet been applied/i.test(text) ||
      /not yet been applied/i.test(text),
    rawResult: statusResult,
  };
}

function runDiffSchema({ allowSchemaDiff = false, hasPendingMigrations = false } = {}) {
  const diffResult = runPrisma(
    ["migrate", "diff", "--from-config-datasource", "--to-schema", "prisma/schema.prisma", "--exit-code"],
    {
      allowedExitCodes: [0, 1, 2],
      capture: true,
    },
  );

  if (diffResult.exitCode === 0) {
    log("Datasource and prisma/schema.prisma are in sync.");
    return;
  }

  if (diffResult.exitCode === 2) {
    if (allowSchemaDiff && hasPendingMigrations) {
      log(
        "Detected schema diff, but it is tolerated because pending reviewed migrations are about to be deployed.",
      );
      return;
    }

    fail(
      "Datasource and prisma/schema.prisma are out of sync.",
      [
        "这通常意味着存在待部署 migration、手工 SQL 热修未回填，或 schema.prisma 与真实库已经漂移。",
        "请先查明差异来源，再决定是补 migration、补 @map/@@map，还是执行 migrate resolve。",
      ].join("\n"),
    );
  }

  fail(
    "prisma migrate diff --from-config-datasource --to-schema failed.",
    diffResult.combined || undefined,
  );
}

function noteShadowAuditAvailability() {
  if (process.env.SHADOW_DATABASE_URL?.trim()) {
    log("SHADOW_DATABASE_URL is configured. Run `npm run prisma:diff:migrations` when you need history-vs-database audit.");
    return;
  }

  log(
    "SHADOW_DATABASE_URL is not configured. `npm run prisma:diff:migrations` is unavailable until a dedicated shadow database is prepared.",
  );
}

async function runPredeployCheck(argv) {
  ensureMigrationInputs();

  const allowPendingMigrations = readBooleanFlag(argv, "--allow-pending-migrations");
  const allowSchemaDiff = readBooleanFlag(argv, "--allow-schema-diff");
  const allowPhysicalNameDrift =
    readBooleanFlag(argv, "--allow-physical-name-drift") ||
    process.env.ALLOW_PRISMA_PHYSICAL_NAME_DRIFT === "1";

  runPrisma(["validate"]);
  await runPhysicalNameDriftCheck({ allowDrift: allowPhysicalNameDrift });

  const statusState = collectStatusState();

  if (
    statusState.rawResult.exitCode !== 0 &&
    !statusState.hasFailedMigrations &&
    !statusState.hasPendingMigrations
  ) {
    fail(
      "prisma migrate status failed.",
      statusState.rawResult.combined || undefined,
    );
  }

  if (statusState.hasFailedMigrations) {
    fail(
      "Detected failed migrations in target database.",
      "先处理 _prisma_migrations 中的失败记录，再继续发布链操作。",
    );
  }

  if (statusState.hasPendingMigrations && !allowPendingMigrations) {
    fail(
      "Detected pending migrations.",
      [
        "如果这次发布不应带 migration，请先让数据库与本地历史对齐。",
        "如果这次发布明确要执行 migration，请改用 `npm run prisma:deploy:safe` 或在脚本链路中显式允许 pending migrations。",
      ].join("\n"),
    );
  }

  if (statusState.hasPendingMigrations && allowPendingMigrations) {
    log("Pending migrations detected and explicitly allowed for this predeploy check.");
  }

  runDiffSchema({
    allowSchemaDiff,
    hasPendingMigrations: statusState.hasPendingMigrations,
  });

  noteShadowAuditAvailability();
  log("Predeploy guardrails passed.");
}

function runStatus() {
  ensureMigrationInputs();
  runPrisma(["migrate", "status"]);
}

function runDiffMigrations() {
  ensureMigrationInputs();
  ensureShadowDatabaseUrl();

  const diffResult = runPrisma(
    ["migrate", "diff", "--from-migrations", "prisma/migrations", "--to-config-datasource", "--exit-code"],
    {
      allowedExitCodes: [0, 1, 2],
      capture: true,
    },
  );

  if (diffResult.exitCode === 0) {
    log("prisma/migrations and target datasource are in sync.");
    return;
  }

  if (diffResult.exitCode === 2) {
    fail(
      "prisma/migrations and target datasource differ.",
      [
        "这可能意味着数据库仍有 pending migration、历史 migration 不能完整代表真实终态，或生产热修没有回填到 migration history。",
        "请先审计目标库的真实结构，再决定是补 migration、补 resolve，还是准备 baseline 重建方案。",
      ].join("\n"),
    );
  }

  fail(
    "prisma migrate diff --from-migrations failed.",
    diffResult.combined || undefined,
  );
}

async function runDeploySafe(argv) {
  ensureMigrationInputs();

  const skipGenerate = readBooleanFlag(argv, "--skip-generate");

  await runPredeployCheck(["--allow-pending-migrations", "--allow-schema-diff"]);
  runPrisma(["migrate", "deploy"]);
  await runPredeployCheck([]);

  if (!skipGenerate) {
    runPrisma(["generate"]);
  }

  log("Safe Prisma deploy sequence passed.");
}

async function runNameDrift() {
  ensureMigrationInputs();
  await runPhysicalNameDriftCheck();
}

function printUsage() {
  console.log(
    [
      "Usage:",
      "  node scripts/prisma-guardrails.mjs <command> [options]",
      "",
      "Commands:",
      "  status",
      "  diff-schema",
      "  diff-migrations",
      "  name-drift",
      "  predeploy-check [--allow-pending-migrations] [--allow-schema-diff] [--allow-physical-name-drift]",
      "  deploy-safe [--skip-generate]",
      "",
      "Notes:",
      `  - See ${GUARDRAILS_DOC}`,
      "  - diff-migrations requires SHADOW_DATABASE_URL",
      "  - deploy-safe tolerates pending migrations only before migrate deploy, then reruns strict checks",
    ].join("\n"),
  );
}

async function main() {
  const [command, ...argv] = process.argv.slice(2);

  switch (command) {
    case "status":
      runStatus();
      return;
    case "diff-schema":
      ensureMigrationInputs();
      runDiffSchema();
      return;
    case "diff-migrations":
      runDiffMigrations();
      return;
    case "predeploy-check":
      await runPredeployCheck(argv);
      return;
    case "deploy-safe":
      await runDeploySafe(argv);
      return;
    case "name-drift":
      await runNameDrift();
      return;
    case "--help":
    case "-h":
    case undefined:
      printUsage();
      return;
    default:
      fail(`Unknown command: ${command}`);
  }
}

main().catch((error) => {
  fail(
    "Unhandled prisma guardrails error.",
    error instanceof Error ? error.stack ?? error.message : String(error),
  );
});
