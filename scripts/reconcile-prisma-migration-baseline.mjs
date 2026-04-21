import "dotenv/config";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "@prisma/client";

const BASELINE_MIGRATION_NAME = "20260407224500_rebuild_current_schema_baseline";

function printUsage() {
  console.log(
    [
      "Usage:",
      "  npm run db:migration-baseline:reconcile -- [--apply] [--backup-dir <dir>]",
      "",
      "Behavior:",
      "  - Reads the current _prisma_migrations rows.",
      "  - Writes a JSON backup before any destructive metadata change.",
      "  - When --apply is provided, clears _prisma_migrations and marks the new baseline migration as applied.",
      "",
      "Important:",
      "  - Run `npm run prisma:diff:schema` first.",
      "  - Only use --apply after confirming the current database schema already matches prisma/schema.prisma.",
    ].join("\n"),
  );
}

function parseArgs(argv) {
  const parsed = {
    apply: false,
    help: false,
    backupDir: "prisma",
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

    if (current === "--backup-dir") {
      const value = argv[index + 1];

      if (!value || value.startsWith("--")) {
        throw new Error("Missing value for --backup-dir");
      }

      parsed.backupDir = value;
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${current}`);
  }

  return parsed;
}

function getNpxCommand() {
  return process.platform === "win32" ? "npx" : "npx";
}

const databaseUrl = process.env.DATABASE_URL?.trim();

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required to reconcile Prisma migration metadata.");
}

const prisma = new PrismaClient({
  adapter: new PrismaMariaDb(databaseUrl),
  log: ["warn", "error"],
});

async function readMigrationRows() {
  return prisma.$queryRawUnsafe(
    "SELECT migration_name, checksum, finished_at, rolled_back_at, started_at, applied_steps_count, logs FROM _prisma_migrations ORDER BY started_at ASC",
  );
}

async function writeBackupFile(backupDir, rows) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const absoluteBackupDir = path.isAbsolute(backupDir)
    ? backupDir
    : path.join(process.cwd(), backupDir);

  await mkdir(absoluteBackupDir, { recursive: true });

  const backupPath = path.join(
    absoluteBackupDir,
    `_prisma_migrations_backup_rebaseline_${timestamp}.json`,
  );

  const json = JSON.stringify(
    rows,
    (_key, value) => (typeof value === "bigint" ? value.toString() : value),
    2,
  );

  await writeFile(`${backupPath}`, `${json}\n`, "utf8");
  return backupPath;
}

async function main() {
  const input = parseArgs(process.argv.slice(2));

  if (input.help) {
    printUsage();
    return;
  }

  const rows = await readMigrationRows();

  console.log(`Current _prisma_migrations rows: ${rows.length}`);
  for (const row of rows) {
    console.log(
      `- ${row.migration_name}${row.rolled_back_at ? " (rolled back)" : ""}`,
    );
  }

  if (!input.apply) {
    console.log("");
    console.log("Dry run only. Re-run with --apply after schema-vs-database diff returns 0.");
    console.log(`Target baseline migration: ${BASELINE_MIGRATION_NAME}`);
    return;
  }

  const backupPath = await writeBackupFile(input.backupDir, rows);
  console.log(`Backed up _prisma_migrations to ${backupPath}`);

  await prisma.$executeRawUnsafe("DELETE FROM _prisma_migrations");
  console.log("Cleared existing _prisma_migrations rows.");

  execFileSync(
    getNpxCommand(),
    ["prisma", "migrate", "resolve", "--applied", BASELINE_MIGRATION_NAME],
    {
      stdio: "inherit",
      shell: process.platform === "win32",
      cwd: process.cwd(),
      env: process.env,
    },
  );

  const nextRows = await readMigrationRows();
  console.log(`Reconciled _prisma_migrations rows: ${nextRows.length}`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
