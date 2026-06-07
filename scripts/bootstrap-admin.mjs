import "dotenv/config";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient, UserStatus } from "@prisma/client";
import { randomBytes, scryptSync } from "node:crypto";

const ROLE_SEEDS = [
  ["ADMIN", "Admin", "System administrator"],
  ["SUPERVISOR", "Supervisor", "Team supervisor"],
  ["SALES", "Sales", "Sales user"],
  ["OPS", "Ops", "Operations user"],
  ["SHIPPER", "Shipper", "Shipping user"],
  ["FINANCE", "Finance", "Finance/refund reviewer"],
];

// 与 lib/auth/password.ts 的 PASSWORD_POLICY 保持一致。
// 这里独立维护是因为本脚本是 .mjs，不便直接引用 .ts 源码；如果未来策略调整，
// 两边需要同时改。已经在 lib/auth/password.ts 上方注释说明该一致性约束。
const PASSWORD_POLICY = {
  minLength: 12,
  maxLength: 128,
  requiredClassCount: 3,
  message: "密码至少 12 位，含大写字母、小写字母、数字和符号中至少 3 类。",
};

function countPasswordClasses(password) {
  let count = 0;
  if (/[A-Z]/.test(password)) count += 1;
  if (/[a-z]/.test(password)) count += 1;
  if (/\d/.test(password)) count += 1;
  if (/[^A-Za-z0-9]/.test(password)) count += 1;
  return count;
}

function validatePasswordStrength(password) {
  if (typeof password !== "string") {
    return PASSWORD_POLICY.message;
  }
  if (password.length < PASSWORD_POLICY.minLength) {
    return PASSWORD_POLICY.message;
  }
  if (password.length > PASSWORD_POLICY.maxLength) {
    return "密码过长。";
  }
  if (countPasswordClasses(password) < PASSWORD_POLICY.requiredClassCount) {
    return PASSWORD_POLICY.message;
  }
  return null;
}

function printUsage() {
  console.log(
    [
      "Usage:",
      "  npm run admin:bootstrap -- --username <username> --name <display name> --password <password> [--phone <phone>] [--force]",
      "",
      "Behavior:",
      "  - Ensures the core system roles exist.",
      "  - Creates the first admin account when the username does not exist.",
      "  - Re-running without --force is a no-op when the username already exists.",
      "  - Re-running with --force promotes the existing user to ADMIN, resets the password, re-enables the account, and clears team/supervisor bindings.",
      "",
      "Password policy:",
      `  - ${PASSWORD_POLICY.message}`,
    ].join("\n"),
  );
}

function parseArgs(argv) {
  const parsed = {
    username: "",
    name: "",
    password: "",
    phone: "",
    force: false,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];

    if (current === "--help" || current === "-h") {
      parsed.help = true;
      continue;
    }

    if (current === "--force") {
      parsed.force = true;
      continue;
    }

    if (!current.startsWith("--")) {
      throw new Error(`Unknown argument: ${current}`);
    }

    const value = argv[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`Missing value for ${current}`);
    }

    switch (current) {
      case "--username":
        parsed.username = value.trim().toLowerCase();
        break;
      case "--name":
        parsed.name = value.trim();
        break;
      case "--password":
        parsed.password = value;
        break;
      case "--phone":
        parsed.phone = value.trim();
        break;
      default:
        throw new Error(`Unknown argument: ${current}`);
    }

    index += 1;
  }

  return parsed;
}

function validateInput(input) {
  if (!input.username || input.username.length < 3) {
    throw new Error("`--username` is required and must be at least 3 characters.");
  }

  if (!input.name) {
    throw new Error("`--name` is required.");
  }

  if (!input.password) {
    throw new Error("`--password` is required.");
  }

  const passwordError = validatePasswordStrength(input.password);
  if (passwordError) {
    throw new Error(`\`--password\` 不满足安全要求：${passwordError}`);
  }
}

function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const derivedKey = scryptSync(password, salt, 64);
  return `scrypt$${salt}$${derivedKey.toString("hex")}`;
}

const databaseUrl = process.env.DATABASE_URL?.trim();

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required to run admin bootstrap.");
}

const prisma = new PrismaClient({
  adapter: new PrismaMariaDb(databaseUrl),
  log: ["warn", "error"],
});

async function ensureRoles(tx) {
  for (const [code, name, description] of ROLE_SEEDS) {
    await tx.role.upsert({
      where: { code },
      update: { name, description, isSystem: true },
      create: { code, name, description, isSystem: true },
    });
  }

  const roles = await tx.role.findMany({
    where: {
      code: {
        in: ROLE_SEEDS.map(([code]) => code),
      },
    },
    select: {
      id: true,
      code: true,
    },
  });

  return new Map(roles.map((role) => [role.code, role.id]));
}

async function main() {
  const input = parseArgs(process.argv.slice(2));

  if (input.help) {
    printUsage();
    return;
  }

  validateInput(input);

  const result = await prisma.$transaction(async (tx) => {
    const roleIdMap = await ensureRoles(tx);
    const adminRoleId = roleIdMap.get("ADMIN");

    if (!adminRoleId) {
      throw new Error("Failed to resolve ADMIN role.");
    }

    const existing = await tx.user.findUnique({
      where: { username: input.username },
      include: {
        role: {
          select: {
            code: true,
          },
        },
      },
    });

    if (existing && !input.force) {
      return {
        action: "noop",
        user: {
          id: existing.id,
          username: existing.username,
          name: existing.name,
          roleCode: existing.role.code,
          userStatus: existing.userStatus,
        },
      };
    }

    const passwordHash = hashPassword(input.password);

    if (existing) {
      const updated = await tx.user.update({
        where: { id: existing.id },
        data: {
          name: input.name,
          phone: input.phone || null,
          roleId: adminRoleId,
          userStatus: UserStatus.ACTIVE,
          mustChangePassword: true,
          passwordHash,
          teamId: null,
          supervisorId: null,
          disabledAt: null,
          disabledById: null,
        },
        select: {
          id: true,
          username: true,
          name: true,
          userStatus: true,
        },
      });

      await tx.operationLog.create({
        data: {
          actorId: null,
          module: "SYSTEM",
          action: "system.bootstrap_admin_forced",
          targetType: "USER",
          targetId: updated.id,
          description: `Bootstrap script promoted or refreshed admin account @${updated.username}.`,
          beforeData: {
            roleCode: existing.role.code,
            userStatus: existing.userStatus,
            teamId: existing.teamId,
            supervisorId: existing.supervisorId,
          },
          afterData: {
            roleCode: "ADMIN",
            userStatus: updated.userStatus,
            mustChangePassword: true,
            teamId: null,
            supervisorId: null,
          },
        },
      });

      return {
        action: "updated",
        user: {
          id: updated.id,
          username: updated.username,
          name: updated.name,
          roleCode: "ADMIN",
          userStatus: updated.userStatus,
        },
      };
    }

    const created = await tx.user.create({
      data: {
        username: input.username,
        name: input.name,
        phone: input.phone || null,
        passwordHash,
        roleId: adminRoleId,
        userStatus: UserStatus.ACTIVE,
        mustChangePassword: true,
      },
      select: {
        id: true,
        username: true,
        name: true,
        userStatus: true,
      },
    });

    await tx.operationLog.create({
      data: {
        actorId: null,
        module: "SYSTEM",
        action: "system.bootstrap_admin_created",
        targetType: "USER",
        targetId: created.id,
        description: `Bootstrap script created initial admin account @${created.username}.`,
        afterData: {
          roleCode: "ADMIN",
          userStatus: created.userStatus,
          mustChangePassword: true,
          teamId: null,
          supervisorId: null,
        },
      },
    });

    return {
      action: "created",
      user: {
        id: created.id,
        username: created.username,
        name: created.name,
        roleCode: "ADMIN",
        userStatus: created.userStatus,
      },
    };
  });

  if (result.action === "noop") {
    console.log(
      `Bootstrap skipped: @${result.user.username} already exists as ${result.user.roleCode}. Re-run with --force to refresh this account.`,
    );
    return;
  }

  console.log(
    result.action === "created"
      ? `Bootstrap completed: created initial admin @${result.user.username}.`
      : `Bootstrap completed: refreshed admin @${result.user.username}.`,
  );
  console.log("The account is marked `mustChangePassword=true` and must change password on first login.");
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
