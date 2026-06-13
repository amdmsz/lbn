import "dotenv/config";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "@prisma/client";

// ---------------------------------------------------------------------------
// 公海客户 publicPoolTeamId 回填脚本
//
// 背景:
//   公海列表对非 ADMIN (主管) 角色强制按 publicPoolTeamId = actor.teamId 过滤.
//   改造前"未分配导入"(UNASSIGNED_IMPORT) 直接进公海的老客户, publicPoolTeamId
//   一直是 NULL, 导致主管视角下这些真实公海客户不可见 ("找不到了").
//
//   本脚本把"在公海 (ownerId=null, ownershipMode=PUBLIC) + 非封存壳 +
//   publicPoolTeamId 为空"的客户回填到目标团队, 恢复主管可见性.
//
// 团队选择:
//   - 系统只有一个团队时, 自动用它 (无歧义).
//   - 多团队时必须显式 --team-id=<id>, 否则报错拒绝 (避免误归属).
//
// 运行:
//   node scripts/backfill-public-pool-team-id.mjs                 # dry-run (默认)
//   node scripts/backfill-public-pool-team-id.mjs --execute       # 真写
//   node scripts/backfill-public-pool-team-id.mjs --team-id=xxx --execute
//
// 安全约束:
//   * 必须显式 --execute, 默认 dry-run
//   * 只改 publicPoolTeamId 单列, 不动 owner / ownershipMode / 业务字段
//   * 只处理 ownerId=null AND ownershipMode=PUBLIC AND publicPoolTeamId=null
//     AND phone NOT LIKE 'ARCHIVED:%' (封存壳不碰)
//   * 幂等可重跑 (回填后该客户已有 teamId, 不再命中)
// ---------------------------------------------------------------------------

function getFlag(name) {
  return process.argv.includes(`--${name}`);
}

function getOption(name) {
  const prefix = `--${name}=`;
  const hit = process.argv.find((arg) => arg.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : null;
}

const PRINT_SAMPLE_LIMIT = 20;

const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl) {
  throw new Error("DATABASE_URL 未配置, 拒绝执行回填脚本.");
}

const prisma = new PrismaClient({
  adapter: new PrismaMariaDb(databaseUrl),
  log: ["warn", "error"],
});

const TARGET_WHERE = {
  ownerId: null,
  ownershipMode: "PUBLIC",
  publicPoolTeamId: null,
  NOT: { phone: { startsWith: "ARCHIVED:" } },
};

async function resolveTargetTeamId() {
  const explicit = getOption("team-id");
  if (explicit) {
    const team = await prisma.team.findUnique({
      where: { id: explicit },
      select: { id: true, name: true },
    });
    if (!team) {
      throw new Error(`--team-id=${explicit} 对应的团队不存在.`);
    }
    return team;
  }

  const teams = await prisma.team.findMany({ select: { id: true, name: true } });
  if (teams.length === 0) {
    throw new Error("系统里没有任何团队, 无法回填.");
  }
  if (teams.length > 1) {
    throw new Error(
      `系统有 ${teams.length} 个团队, 请用 --team-id=<id> 显式指定回填目标. ` +
        `团队: ${teams.map((t) => `${t.name}(${t.id})`).join(", ")}`,
    );
  }
  return teams[0];
}

async function main() {
  const dryRun = !getFlag("execute");
  const team = await resolveTargetTeamId();

  console.log("[backfill-public-pool-team-id] start", {
    dryRun,
    targetTeam: `${team.name} (${team.id})`,
  });

  const candidates = await prisma.customer.findMany({
    where: TARGET_WHERE,
    select: { id: true, name: true, phone: true, publicPoolReason: true },
  });

  console.log("");
  console.log("=== publicPoolTeamId 回填概览 ===");
  console.log(`待回填客户数 (公海 + 无团队 + 非封存): ${candidates.length}`);
  if (candidates.length > 0) {
    console.table(
      candidates.slice(0, PRINT_SAMPLE_LIMIT).map((row) => ({
        customerId: row.id,
        name: row.name,
        phone: row.phone,
        reason: row.publicPoolReason ?? "null",
        targetTeam: team.name,
      })),
    );
    if (candidates.length > PRINT_SAMPLE_LIMIT) {
      console.log(`... 还有 ${candidates.length - PRINT_SAMPLE_LIMIT} 条未展示.`);
    }
  }

  if (candidates.length === 0) {
    console.log("没有需要回填的客户.");
    return;
  }

  if (dryRun) {
    console.log("");
    console.log("** 当前是 DRY-RUN 模式. 没有动 DB. **");
    console.log("** 检查清单后, 重新执行并追加 --execute 才会真写. **");
    return;
  }

  console.log("");
  console.log("[execute] 进入真写模式, updateMany 设置 publicPoolTeamId.");
  const result = await prisma.customer.updateMany({
    where: TARGET_WHERE,
    data: { publicPoolTeamId: team.id },
  });

  console.log("");
  console.log("=== 总结 ===");
  console.log(`实际回填客户数: ${result.count} → 团队 ${team.name}`);
}

main()
  .catch((error) => {
    console.error(
      "[backfill-public-pool-team-id] failed:",
      error instanceof Error ? error.message : error,
    );
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
