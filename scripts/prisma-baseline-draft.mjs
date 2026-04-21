#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, "..");
const SCHEMA_PATH = path.join(PROJECT_ROOT, "prisma", "schema.prisma");
const MIGRATIONS_DIR = path.join(PROJECT_ROOT, "prisma", "migrations");
const DRAFTS_DIR = path.join(PROJECT_ROOT, "prisma", "baseline-drafts");
const PLAN_DOC = "docs/ops/prisma-baseline-rebuild-plan.md";
const PRISMA_CLI_PATH = path.join(PROJECT_ROOT, "node_modules", "prisma", "build", "index.js");

function fail(message, detail) {
  console.error(`[prisma-baseline-draft] ERROR: ${message}`);

  if (detail) {
    console.error(detail);
  }

  console.error(`[prisma-baseline-draft] See ${PLAN_DOC}`);
  process.exit(1);
}

function log(message) {
  console.log(`[prisma-baseline-draft] ${message}`);
}

function printUsage() {
  console.log(
    [
      "Usage:",
      "  npm run prisma:baseline:plan",
      "  npm run prisma:baseline:draft -- [--name 0_init] [--output-dir prisma/baseline-drafts/<dir>]",
      "",
      "Behavior:",
      "  - Only reads prisma/schema.prisma and generates a local baseline draft.",
      "  - Never overwrites prisma/migrations.",
      "  - Never runs migrate deploy or migrate resolve.",
      "",
      "Notes:",
      "  - DATABASE_URL is not required for draft generation.",
      "  - Use npm run prisma:diff:schema / prisma:diff:migrations separately when you have a real target database to audit.",
    ].join("\n"),
  );
}

function parseArgs(argv) {
  const parsed = {
    help: false,
    planOnly: false,
    name: "0_init",
    outputDir: "",
  };

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];

    if (current === "--help" || current === "-h") {
      parsed.help = true;
      continue;
    }

    if (current === "--plan-only") {
      parsed.planOnly = true;
      continue;
    }

    if (current === "--name") {
      const value = argv[index + 1];

      if (!value || value.startsWith("--")) {
        fail("Missing value for --name.");
      }

      parsed.name = value;
      index += 1;
      continue;
    }

    if (current === "--output-dir") {
      const value = argv[index + 1];

      if (!value || value.startsWith("--")) {
        fail("Missing value for --output-dir.");
      }

      parsed.outputDir = value;
      index += 1;
      continue;
    }

    fail(`Unknown argument: ${current}`);
  }

  return parsed;
}

function sanitizeDraftName(name) {
  const trimmed = name.trim();

  if (!trimmed) {
    fail("Draft name must not be empty.");
  }

  if (!/^[A-Za-z0-9_-]+$/.test(trimmed)) {
    fail("Draft name may only contain letters, numbers, underscores, and hyphens.");
  }

  return trimmed;
}

function timestampForFolder() {
  return new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
}

function resolveOutputDir(input) {
  if (input.outputDir) {
    return path.isAbsolute(input.outputDir)
      ? input.outputDir
      : path.resolve(PROJECT_ROOT, input.outputDir);
  }

  const folderName = `${timestampForFolder()}_${input.name}`;
  return path.join(DRAFTS_DIR, folderName);
}

function ensureSafeOutputDir(outputDir) {
  const normalized = path.resolve(outputDir);
  const migrationsRoot = path.resolve(MIGRATIONS_DIR);

  if (normalized === migrationsRoot || normalized.startsWith(`${migrationsRoot}${path.sep}`)) {
    fail("Baseline draft output must not point to prisma/migrations.", `Requested output: ${normalized}`);
  }

  if (existsSync(normalized)) {
    fail("Baseline draft output already exists.", `Requested output: ${normalized}`);
  }
}

function ensurePrerequisites() {
  if (!existsSync(SCHEMA_PATH)) {
    fail(`Missing Prisma schema file: ${SCHEMA_PATH}`);
  }

  if (!existsSync(PRISMA_CLI_PATH)) {
    fail(
      `Local Prisma CLI not found: ${PRISMA_CLI_PATH}`,
      "请先执行 npm install 或 npm ci，确保 node_modules/prisma 已安装。",
    );
  }
}

function runPrismaDiff() {
  const result = spawnSync(
    process.execPath,
    [
      PRISMA_CLI_PATH,
      "migrate",
      "diff",
      "--from-empty",
      "--to-schema-datamodel",
      "prisma/schema.prisma",
      "--script",
    ],
    {
      cwd: PROJECT_ROOT,
      env: process.env,
      encoding: "utf8",
      stdio: "pipe",
    },
  );

  if (result.error) {
    fail(
      "Failed to start prisma migrate diff.",
      String(result.error),
    );
  }

  if ((result.status ?? 1) !== 0) {
    fail(
      "prisma migrate diff --from-empty failed.",
      `${result.stdout ?? ""}${result.stderr ?? ""}`.trim() || undefined,
    );
  }

  return (result.stdout ?? "").trim();
}

function readGitCommit() {
  const result = spawnSync("git", ["rev-parse", "HEAD"], {
    cwd: PROJECT_ROOT,
    env: process.env,
    encoding: "utf8",
    stdio: "pipe",
  });

  if ((result.status ?? 1) !== 0) {
    return "UNKNOWN";
  }

  return (result.stdout ?? "").trim() || "UNKNOWN";
}

function writeDraftFiles(outputDir, draftName, sql) {
  mkdirSync(outputDir, { recursive: true });

  const sqlPath = path.join(outputDir, "migration.sql");
  const readmePath = path.join(outputDir, "README.md");
  const generatedAt = new Date().toISOString();
  const commit = readGitCommit();

  writeFileSync(sqlPath, `${sql}\n`, "utf8");
  writeFileSync(
    readmePath,
    [
      `# Prisma Baseline Draft: ${draftName}`,
      "",
      `生成时间: ${generatedAt}`,
      `生成提交: ${commit}`,
      "",
      "这是本地草案目录，不是正式 migration，不会自动加入 `prisma/migrations`。",
      "",
      "生成命令：",
      "",
      "```bash",
      `npm run prisma:baseline:draft -- --name ${draftName}`,
      "```",
      "",
      "后续人工动作：",
      "",
      "1. 先完成生产真相审计，再决定是否真的进入 baseline 重建窗口。",
      "2. 对照真实生产库结构、`_prisma_migrations` 快照和历史热修记录审阅本草案 SQL。",
      "3. 仅在受控窗口内，把审阅通过的草案复制到新的正式 baseline migration 目录。",
      "4. 正式步骤、`migrate resolve --applied` 示例和止损方案见 `docs/ops/prisma-baseline-rebuild-plan.md`。",
      "",
      "本草案不会执行：",
      "",
      "- `prisma migrate deploy`",
      "- `prisma migrate resolve`",
      "- 任何数据库写入",
      "",
    ].join("\n"),
    "utf8",
  );
}

function runPlanOnly() {
  console.log(
    [
      "[prisma-baseline-draft] Baseline 重建当前仍是准备阶段。",
      `[prisma-baseline-draft] 方案文档: ${PLAN_DOC}`,
      `[prisma-baseline-draft] schema 路径: ${path.relative(PROJECT_ROOT, SCHEMA_PATH)}`,
      `[prisma-baseline-draft] migrations 路径: ${path.relative(PROJECT_ROOT, MIGRATIONS_DIR)}`,
      "[prisma-baseline-draft] 此命令不需要 DATABASE_URL，也不会访问任何数据库。",
      "[prisma-baseline-draft] 如需生成 SQL 草案，请运行 npm run prisma:baseline:draft。",
    ].join("\n"),
  );
}

function main() {
  const input = parseArgs(process.argv.slice(2));

  if (input.help) {
    printUsage();
    return;
  }

  if (input.planOnly) {
    runPlanOnly();
    return;
  }

  input.name = sanitizeDraftName(input.name);
  ensurePrerequisites();

  const outputDir = resolveOutputDir(input);
  ensureSafeOutputDir(outputDir);

  log(`Generating baseline draft SQL from prisma/schema.prisma into ${path.relative(PROJECT_ROOT, outputDir)}`);
  const sql = runPrismaDiff();

  if (!sql) {
    fail("Prisma diff returned empty SQL. Refusing to create an empty baseline draft.");
  }

  writeDraftFiles(outputDir, input.name, sql);

  log(`Draft created at ${path.relative(PROJECT_ROOT, outputDir)}`);
  log("This draft has not touched prisma/migrations or any database.");
}

main();
