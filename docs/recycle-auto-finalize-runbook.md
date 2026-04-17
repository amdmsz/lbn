# Recycle Auto Finalize Runbook

更新时间：2026-04-17

本文只覆盖当前已经支持双终态 recycle lifecycle 的两个域：

- `CUSTOMER`
- `TRADE_ORDER`

本文不扩 `Lead`，不改 recycle 业务规则，不改 lifecycle contract，不改业务页 UI。

## 1. 目的

当前仓库已经提供自动 finalize 一次性执行入口：

```bash
npm run worker:recycle-auto-finalize
```

该入口会扫描：

- `status = ACTIVE`
- `recycleExpiresAt <= now`
- `domain in (CUSTOMER, TRADE_ORDER)`

然后逐条复用现有 lifecycle：

- `previewRecycleBinFinalize(...)`
- `finalizeRecycleBinEntry(...)`

最终按最新服务端真相落到：

- `PURGE`
- `ARCHIVE`

## 2. 运行前提

部署侧至少满足以下条件：

- 已完成 `npm ci` 或 `npm install`
- 已完成 `npx prisma generate`
- 当前发布版本已经包含 `npm run worker:recycle-auto-finalize`
- 运行目录位于仓库根目录
- 运行环境可读取正确的 `.env` 或外部环境变量
- `DATABASE_URL` 指向目标环境数据库
- 至少存在一个 `ACTIVE ADMIN` 用户

当前脚本会自动加载：

```bash
dotenv/config
```

所以如果部署方式本身已经把环境变量注入进进程，可以不依赖仓库内 `.env`。

## 3. 推荐环境变量

必需：

- `DATABASE_URL`

强烈推荐：

- `RECYCLE_AUTO_FINALIZE_ACTOR_ID`

可选：

- `RECYCLE_AUTO_FINALIZE_BATCH_LIMIT`
- `RECYCLE_AUTO_FINALIZE_DRY_RUN`
- `RECYCLE_AUTO_FINALIZE_FAILED_ALERT_THRESHOLD`
- `RECYCLE_AUTO_FINALIZE_BACKLOG_ALERT_THRESHOLD`

当前默认值：

- `RECYCLE_AUTO_FINALIZE_BATCH_LIMIT=100`

推荐起步值：

- staging dry-run：`RECYCLE_AUTO_FINALIZE_BATCH_LIMIT=20`
- production 首次真实执行：`RECYCLE_AUTO_FINALIZE_BATCH_LIMIT=50`
- production 稳定后：按积压量回到 `100`
- 失败告警阈值：`RECYCLE_AUTO_FINALIZE_FAILED_ALERT_THRESHOLD=1`
- backlog 告警阈值：按当前环境体量预设一个固定值，例如 `200`

## 4. Actor 配置建议

生产环境不要依赖 fallback。

当前逻辑是：

1. 优先使用 `RECYCLE_AUTO_FINALIZE_ACTOR_ID`
2. 未配置时 fallback 到首个 `ACTIVE ADMIN`

推荐做法：

- 为自动任务准备一个专用 `ADMIN` 账号
- 该账号只用于计划任务审计，不用于日常人工操作
- 把它的用户 `id` 固定写入 `RECYCLE_AUTO_FINALIZE_ACTOR_ID`

不推荐：

- 在生产环境长期依赖“首个 `ACTIVE ADMIN`”fallback

原因：

- 审计主体会漂移
- 管理员顺序变化后，任务 actor 可能变成另一个人
- 后续排查 `OperationLog` 时不稳定

fallback 只适合：

- 本地环境
- staging 临时联调
- 紧急补跑但尚未完成专用 actor 配置

## 5. 单次手动执行

Linux / macOS：

```bash
RECYCLE_AUTO_FINALIZE_ACTOR_ID="<admin-user-id>" \
RECYCLE_AUTO_FINALIZE_BATCH_LIMIT=100 \
npm run worker:recycle-auto-finalize
```

Linux / macOS dry-run：

```bash
RECYCLE_AUTO_FINALIZE_ACTOR_ID="<admin-user-id>" \
RECYCLE_AUTO_FINALIZE_BATCH_LIMIT=100 \
npm run worker:recycle-auto-finalize -- --dry-run
```

Windows PowerShell：

```powershell
$env:RECYCLE_AUTO_FINALIZE_ACTOR_ID="<admin-user-id>"
$env:RECYCLE_AUTO_FINALIZE_BATCH_LIMIT="100"
npm run worker:recycle-auto-finalize
```

Windows PowerShell dry-run：

```powershell
$env:RECYCLE_AUTO_FINALIZE_ACTOR_ID="<admin-user-id>"
$env:RECYCLE_AUTO_FINALIZE_BATCH_LIMIT="100"
npm run worker:recycle-auto-finalize -- --dry-run
```

如果本轮存在：

- `failedCount > 0`

脚本会返回非零退出码，方便调度器识别失败。

`blockedCount > 0` 不再单独触发非零退出码；它属于业务阻断，需要结合 stdout summary 与 alert code 判断是否需要人工介入。

`failedCount > 0` 或脚本级 `fatal` 才会触发非零退出码。

## 5A. staging 演练步骤

本节目标不是“真的 finalize 一批数据”，而是先确认：

- staging 环境变量与命令都正确
- stdout summary / alert code / exitCode 可被稳定观察
- dry-run 不会真正落库

推荐只在 staging 做，且先记录一个人工观察起点时间 `T0`。

### 第 1 步：准备环境变量

最小必需：

- `DATABASE_URL`
- `RECYCLE_AUTO_FINALIZE_ACTOR_ID`

推荐同时显式设置：

- `RECYCLE_AUTO_FINALIZE_BATCH_LIMIT=20`
- `RECYCLE_AUTO_FINALIZE_FAILED_ALERT_THRESHOLD=1`
- `RECYCLE_AUTO_FINALIZE_BACKLOG_ALERT_THRESHOLD=50`

Linux / macOS：

```bash
export RECYCLE_AUTO_FINALIZE_ACTOR_ID="<staging-admin-user-id>"
export RECYCLE_AUTO_FINALIZE_BATCH_LIMIT=20
export RECYCLE_AUTO_FINALIZE_FAILED_ALERT_THRESHOLD=1
export RECYCLE_AUTO_FINALIZE_BACKLOG_ALERT_THRESHOLD=50
```

Windows PowerShell：

```powershell
$env:RECYCLE_AUTO_FINALIZE_ACTOR_ID="<staging-admin-user-id>"
$env:RECYCLE_AUTO_FINALIZE_BATCH_LIMIT="20"
$env:RECYCLE_AUTO_FINALIZE_FAILED_ALERT_THRESHOLD="1"
$env:RECYCLE_AUTO_FINALIZE_BACKLOG_ALERT_THRESHOLD="50"
```

### 第 2 步：执行 dry-run

Linux / macOS：

```bash
npm run worker:recycle-auto-finalize -- --dry-run
```

Windows PowerShell：

```powershell
npm run worker:recycle-auto-finalize -- --dry-run
```

### 第 3 步：验证 stdout / alert / exitCode

最低要看到：

- 一条 `event = "recycle_auto_finalize.run_started"`
- 一条 `event = "recycle_auto_finalize.run_completed"`
- 一条 `event = "recycle_auto_finalize.stdout_summary"`

`stdout_summary` 至少核对这些字段：

- `dryRun = true`
- `runId` 有值
- `startedAt / finishedAt` 有值
- `processed / purged / archived / blocked / skipped / failed` 都是数字
- `exitCode` 与本次命令退出码一致

`alert` 的核对口径：

- 出现 `backlog_over_threshold`：说明积压超过阈值，但不代表脚本失败
- 出现 `failed_over_threshold`：说明本次 failed 预估或真实值过高
- 出现 `non_zero_exit`：说明本次是 `failed` 或 `fatal`，调度器应记为失败
- `consecutive_failure_requires_scheduler` 只是提示外部调度器需要接连续失败规则

退出码核对：

- `blocked` 不触发非零退出
- `failed / fatal` 才触发非零退出

Linux / macOS 可直接核对：

```bash
npm run worker:recycle-auto-finalize -- --dry-run
echo $?
```

Windows PowerShell 可直接核对：

```powershell
npm run worker:recycle-auto-finalize -- --dry-run
$LASTEXITCODE
```

### 第 4 步：验证 dry-run 不会真正 finalize

本轮至少确认以下事实同时成立：

- 没有新增 `action = system.recycle_auto_finalize_run` 的 `OperationLog`
- 没有新增：
  - `customer.purged_from_recycle_bin`
  - `customer.archived_from_recycle_bin`
  - `trade_order.purged_from_recycle_bin`
  - `trade_order.archived_from_recycle_bin`
- `/recycle-bin` 中原本的 `ACTIVE` 条目没有因为这次 dry-run 变成 `PURGED / ARCHIVED`

如果需要更稳妥，可在 `T0` 前后各检查一次：

1. `OperationLog`
2. `/recycle-bin` 历史终态列表
3. 调度日志中的 `dryRun` 字段

只要 dry-run 正常，应该只看到日志输出变化，不应该看到业务数据终态变化。

### 第 5 步：决定是否进入 staging 真实执行

只有当以下条件同时满足时，才建议在 staging 跑一次真实执行：

- dry-run 的 `stdout_summary` 字段完整
- `exitCode` 行为符合预期
- 运行账户、路径、环境变量、日志落盘方式全部确认无误
- 业务接受 staging 上真的把到期条目 finalize

staging 真实执行命令：

```bash
npm run worker:recycle-auto-finalize
```

真实执行后要额外确认：

- 新增 `action = system.recycle_auto_finalize_run`
- 命中的 Customer / TradeOrder 真实出现 `PURGED / ARCHIVED`
- `stdout_summary.dryRun = false`

## 5B. staging 前检查脚本

本节给的是“可直接复制执行”的最小脚本。

用途：

- 打印当前 `DATABASE_URL` 指向（脱敏）
- 打印当前 `NEXTAUTH_URL`
- 检查 `ACTIVE ADMIN`
- 检查 `RECYCLE_AUTO_FINALIZE_ACTOR_ID`
- 检查 `npm / prisma client / 数据库`
- 记录 dry-run 前基线：
  - `RECYCLE_DRY_RUN_T0`
  - `RECYCLE_ACTIVE_COUNT_BEFORE`

### Bash

```bash
set -euo pipefail

node -v
npm -v
cmd="${CMD_PRISMA_VALIDATE:-npx prisma validate}"
eval "$cmd"

export RECYCLE_DRY_RUN_T0="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
export RECYCLE_ACTIVE_COUNT_BEFORE="$(
node - <<'NODE'
require("dotenv/config");
const { PrismaClient, RecycleEntryStatus } = require("@prisma/client");
const { PrismaMariaDb } = require("@prisma/adapter-mariadb");

const databaseUrl = (process.env.DATABASE_URL || "").trim();
if (!databaseUrl) {
  console.error("DATABASE_URL is missing.");
  process.exit(1);
}

const prisma = new PrismaClient({
  adapter: new PrismaMariaDb(databaseUrl),
  log: ["warn", "error"],
});

(async () => {
  const activeCount = await prisma.recycleBinEntry.count({
    where: { status: RecycleEntryStatus.ACTIVE },
  });
  process.stdout.write(String(activeCount));
})()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
NODE
)"

node - <<'NODE'
require("dotenv/config");
const { URL } = require("node:url");
const {
  PrismaClient,
  UserStatus,
  RecycleEntryStatus,
} = require("@prisma/client");
const { PrismaMariaDb } = require("@prisma/adapter-mariadb");

function maskDatabaseUrl(raw) {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.password) url.password = "***";
    return url.toString();
  } catch (error) {
    return `INVALID_DATABASE_URL: ${error instanceof Error ? error.message : String(error)}`;
  }
}

const databaseUrl = (process.env.DATABASE_URL || "").trim();
const nextAuthUrl = (process.env.NEXTAUTH_URL || "").trim();
const actorId = (process.env.RECYCLE_AUTO_FINALIZE_ACTOR_ID || "").trim();

if (!databaseUrl) {
  console.error(JSON.stringify({
    canSafelyRunDryRun: false,
    blockers: ["DATABASE_URL is missing."],
  }, null, 2));
  process.exit(1);
}

const prisma = new PrismaClient({
  adapter: new PrismaMariaDb(databaseUrl),
  log: ["warn", "error"],
});

(async () => {
  const activeAdmins = await prisma.user.findMany({
    where: {
      userStatus: UserStatus.ACTIVE,
      role: { is: { code: "ADMIN" } },
    },
    orderBy: { username: "asc" },
    select: { id: true, username: true, name: true },
    take: 10,
  });

  const configuredActor = actorId
    ? await prisma.user.findFirst({
        where: {
          id: actorId,
          userStatus: UserStatus.ACTIVE,
          role: { is: { code: "ADMIN" } },
        },
        select: { id: true, username: true, name: true },
      })
    : null;

  const activeRecycleCount = await prisma.recycleBinEntry.count({
    where: { status: RecycleEntryStatus.ACTIVE },
  });

  const blockers = [];
  if (!nextAuthUrl) blockers.push("NEXTAUTH_URL is missing.");
  if (/localhost|127\\.0\\.0\\.1/i.test(nextAuthUrl)) {
    blockers.push("NEXTAUTH_URL still points to localhost or loopback.");
  }
  if (activeAdmins.length === 0) {
    blockers.push("No ACTIVE ADMIN is available.");
  }
  if (actorId && !configuredActor) {
    blockers.push("RECYCLE_AUTO_FINALIZE_ACTOR_ID is set but does not resolve to an ACTIVE ADMIN.");
  }

  console.log(JSON.stringify({
    canSafelyRunDryRun: blockers.length === 0,
    blockers,
    databaseUrlMasked: maskDatabaseUrl(databaseUrl),
    nextAuthUrl,
    hasConfiguredActorId: Boolean(actorId),
    configuredActorId: actorId || null,
    configuredActorResolved: configuredActor,
    fallbackActor: activeAdmins[0] ?? null,
    activeAdmins,
    recycleDryRunT0: process.env.RECYCLE_DRY_RUN_T0 || null,
    recycleActiveCountBefore: Number(process.env.RECYCLE_ACTIVE_COUNT_BEFORE || activeRecycleCount),
  }, null, 2));
})()
  .catch((error) => {
    console.error(JSON.stringify({
      canSafelyRunDryRun: false,
      blockers: [error instanceof Error ? error.message : String(error)],
    }, null, 2));
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
NODE

echo "RECYCLE_DRY_RUN_T0=$RECYCLE_DRY_RUN_T0"
echo "RECYCLE_ACTIVE_COUNT_BEFORE=$RECYCLE_ACTIVE_COUNT_BEFORE"
```

### PowerShell

```powershell
$ErrorActionPreference = "Stop"

node -v
npm -v
cmd /c npx prisma validate

$env:RECYCLE_DRY_RUN_T0 = (Get-Date).ToUniversalTime().ToString("o")
$env:RECYCLE_ACTIVE_COUNT_BEFORE = ((@'
require("dotenv/config");
const { PrismaClient, RecycleEntryStatus } = require("@prisma/client");
const { PrismaMariaDb } = require("@prisma/adapter-mariadb");

const databaseUrl = (process.env.DATABASE_URL || "").trim();
if (!databaseUrl) {
  console.error("DATABASE_URL is missing.");
  process.exit(1);
}

const prisma = new PrismaClient({
  adapter: new PrismaMariaDb(databaseUrl),
  log: ["warn", "error"],
});

(async () => {
  const activeCount = await prisma.recycleBinEntry.count({
    where: { status: RecycleEntryStatus.ACTIVE },
  });
  process.stdout.write(String(activeCount));
})()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
'@ | node) | Out-String).Trim()

@'
require("dotenv/config");
const { URL } = require("node:url");
const {
  PrismaClient,
  UserStatus,
  RecycleEntryStatus,
} = require("@prisma/client");
const { PrismaMariaDb } = require("@prisma/adapter-mariadb");

function maskDatabaseUrl(raw) {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.password) url.password = "***";
    return url.toString();
  } catch (error) {
    return `INVALID_DATABASE_URL: ${error instanceof Error ? error.message : String(error)}`;
  }
}

const databaseUrl = (process.env.DATABASE_URL || "").trim();
const nextAuthUrl = (process.env.NEXTAUTH_URL || "").trim();
const actorId = (process.env.RECYCLE_AUTO_FINALIZE_ACTOR_ID || "").trim();

if (!databaseUrl) {
  console.error(JSON.stringify({
    canSafelyRunDryRun: false,
    blockers: ["DATABASE_URL is missing."],
  }, null, 2));
  process.exit(1);
}

const prisma = new PrismaClient({
  adapter: new PrismaMariaDb(databaseUrl),
  log: ["warn", "error"],
});

(async () => {
  const activeAdmins = await prisma.user.findMany({
    where: {
      userStatus: UserStatus.ACTIVE,
      role: { is: { code: "ADMIN" } },
    },
    orderBy: { username: "asc" },
    select: { id: true, username: true, name: true },
    take: 10,
  });

  const configuredActor = actorId
    ? await prisma.user.findFirst({
        where: {
          id: actorId,
          userStatus: UserStatus.ACTIVE,
          role: { is: { code: "ADMIN" } },
        },
        select: { id: true, username: true, name: true },
      })
    : null;

  const activeRecycleCount = await prisma.recycleBinEntry.count({
    where: { status: RecycleEntryStatus.ACTIVE },
  });

  const blockers = [];
  if (!nextAuthUrl) blockers.push("NEXTAUTH_URL is missing.");
  if (/localhost|127\.0\.0\.1/i.test(nextAuthUrl)) {
    blockers.push("NEXTAUTH_URL still points to localhost or loopback.");
  }
  if (activeAdmins.length === 0) {
    blockers.push("No ACTIVE ADMIN is available.");
  }
  if (actorId && !configuredActor) {
    blockers.push("RECYCLE_AUTO_FINALIZE_ACTOR_ID is set but does not resolve to an ACTIVE ADMIN.");
  }

  console.log(JSON.stringify({
    canSafelyRunDryRun: blockers.length === 0,
    blockers,
    databaseUrlMasked: maskDatabaseUrl(databaseUrl),
    nextAuthUrl,
    hasConfiguredActorId: Boolean(actorId),
    configuredActorId: actorId || null,
    configuredActorResolved: configuredActor,
    fallbackActor: activeAdmins[0] ?? null,
    activeAdmins,
    recycleDryRunT0: process.env.RECYCLE_DRY_RUN_T0 || null,
    recycleActiveCountBefore: Number(process.env.RECYCLE_ACTIVE_COUNT_BEFORE || activeRecycleCount),
  }, null, 2));
})()
  .catch((error) => {
    console.error(JSON.stringify({
      canSafelyRunDryRun: false,
      blockers: [error instanceof Error ? error.message : String(error)],
    }, null, 2));
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
'@ | node

Write-Host "RECYCLE_DRY_RUN_T0=$env:RECYCLE_DRY_RUN_T0"
Write-Host "RECYCLE_ACTIVE_COUNT_BEFORE=$env:RECYCLE_ACTIVE_COUNT_BEFORE"
```

## 5C. staging dry-run 执行脚本

推荐先显式指定 staging 专用 `ACTIVE ADMIN`，不要长期依赖 fallback。

### Bash

```bash
set -euo pipefail

export RECYCLE_AUTO_FINALIZE_ACTOR_ID="<staging-admin-user-id>"
export RECYCLE_AUTO_FINALIZE_BATCH_LIMIT=20
export RECYCLE_AUTO_FINALIZE_FAILED_ALERT_THRESHOLD=1
export RECYCLE_AUTO_FINALIZE_BACKLOG_ALERT_THRESHOLD=50

set +e
npm run worker:recycle-auto-finalize -- --dry-run
exit_code=$?
set -e
echo "EXIT_CODE=$exit_code"
```

### PowerShell

```powershell
$ErrorActionPreference = "Continue"

$env:RECYCLE_AUTO_FINALIZE_ACTOR_ID = "<staging-admin-user-id>"
$env:RECYCLE_AUTO_FINALIZE_BATCH_LIMIT = "20"
$env:RECYCLE_AUTO_FINALIZE_FAILED_ALERT_THRESHOLD = "1"
$env:RECYCLE_AUTO_FINALIZE_BACKLOG_ALERT_THRESHOLD = "50"

npm run worker:recycle-auto-finalize -- --dry-run
Write-Host "EXIT_CODE=$LASTEXITCODE"
```

## 5D. dry-run 后未落库验证脚本

前提：

- 先执行过本节 5B 的前检查脚本
- `RECYCLE_DRY_RUN_T0`
- `RECYCLE_ACTIVE_COUNT_BEFORE`

这两个环境变量仍然保留在当前 shell 中

### Bash

```bash
set -euo pipefail

test -n "${RECYCLE_DRY_RUN_T0:-}" || { echo "RECYCLE_DRY_RUN_T0 is missing."; exit 1; }
test -n "${RECYCLE_ACTIVE_COUNT_BEFORE:-}" || { echo "RECYCLE_ACTIVE_COUNT_BEFORE is missing."; exit 1; }

node - <<'NODE'
require("dotenv/config");
const { PrismaClient, RecycleEntryStatus } = require("@prisma/client");
const { PrismaMariaDb } = require("@prisma/adapter-mariadb");

const databaseUrl = (process.env.DATABASE_URL || "").trim();
const t0 = (process.env.RECYCLE_DRY_RUN_T0 || "").trim();
const activeBefore = Number(process.env.RECYCLE_ACTIVE_COUNT_BEFORE || "NaN");

if (!databaseUrl) {
  console.error("DATABASE_URL is missing.");
  process.exit(1);
}
if (!t0) {
  console.error("RECYCLE_DRY_RUN_T0 is missing.");
  process.exit(1);
}
if (!Number.isFinite(activeBefore)) {
  console.error("RECYCLE_ACTIVE_COUNT_BEFORE is invalid.");
  process.exit(1);
}

const prisma = new PrismaClient({
  adapter: new PrismaMariaDb(databaseUrl),
  log: ["warn", "error"],
});

(async () => {
  const createdAtGte = new Date(t0);
  const actions = [
    "system.recycle_auto_finalize_run",
    "customer.purged_from_recycle_bin",
    "customer.archived_from_recycle_bin",
    "trade_order.purged_from_recycle_bin",
    "trade_order.archived_from_recycle_bin",
  ];

  const logCounts = await Promise.all(
    actions.map((action) =>
      prisma.operationLog.count({
        where: {
          action,
          createdAt: { gte: createdAtGte },
        },
      }),
    ),
  );

  const activeAfter = await prisma.recycleBinEntry.count({
    where: { status: RecycleEntryStatus.ACTIVE },
  });

  console.log(JSON.stringify({
    recycleDryRunT0: t0,
    activeCountBefore: activeBefore,
    activeCountAfter: activeAfter,
    activeCountUnchanged: activeAfter === activeBefore,
    operationLogsSinceT0: Object.fromEntries(actions.map((action, index) => [action, logCounts[index]])),
    noRealFinalizeLogsSinceT0: logCounts.every((count) => count === 0),
  }, null, 2));
})()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
NODE
```

### PowerShell

```powershell
$ErrorActionPreference = "Stop"

if (-not $env:RECYCLE_DRY_RUN_T0) { throw "RECYCLE_DRY_RUN_T0 is missing." }
if (-not $env:RECYCLE_ACTIVE_COUNT_BEFORE) { throw "RECYCLE_ACTIVE_COUNT_BEFORE is missing." }

@'
require("dotenv/config");
const { PrismaClient, RecycleEntryStatus } = require("@prisma/client");
const { PrismaMariaDb } = require("@prisma/adapter-mariadb");

const databaseUrl = (process.env.DATABASE_URL || "").trim();
const t0 = (process.env.RECYCLE_DRY_RUN_T0 || "").trim();
const activeBefore = Number(process.env.RECYCLE_ACTIVE_COUNT_BEFORE || "NaN");

if (!databaseUrl) {
  console.error("DATABASE_URL is missing.");
  process.exit(1);
}
if (!t0) {
  console.error("RECYCLE_DRY_RUN_T0 is missing.");
  process.exit(1);
}
if (!Number.isFinite(activeBefore)) {
  console.error("RECYCLE_ACTIVE_COUNT_BEFORE is invalid.");
  process.exit(1);
}

const prisma = new PrismaClient({
  adapter: new PrismaMariaDb(databaseUrl),
  log: ["warn", "error"],
});

(async () => {
  const createdAtGte = new Date(t0);
  const actions = [
    "system.recycle_auto_finalize_run",
    "customer.purged_from_recycle_bin",
    "customer.archived_from_recycle_bin",
    "trade_order.purged_from_recycle_bin",
    "trade_order.archived_from_recycle_bin",
  ];

  const logCounts = await Promise.all(
    actions.map((action) =>
      prisma.operationLog.count({
        where: {
          action,
          createdAt: { gte: createdAtGte },
        },
      }),
    ),
  );

  const activeAfter = await prisma.recycleBinEntry.count({
    where: { status: RecycleEntryStatus.ACTIVE },
  });

  console.log(JSON.stringify({
    recycleDryRunT0: t0,
    activeCountBefore: activeBefore,
    activeCountAfter: activeAfter,
    activeCountUnchanged: activeAfter === activeBefore,
    operationLogsSinceT0: Object.fromEntries(actions.map((action, index) => [action, logCounts[index]])),
    noRealFinalizeLogsSinceT0: logCounts.every((count) => count === 0),
  }, null, 2));
})()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
'@ | node
```

## 6. Linux cron 接线

推荐前提：

- Web 与定时任务都使用同一份正式环境变量文件
- 例如：`/etc/jiuzhuang-crm/jiuzhuang-crm.env`

推荐日志目录：

```bash
mkdir -p /var/log/jiuzhuang-crm
```

推荐 cron：

```cron
*/30 * * * * cd /srv/jiuzhuang-crm/current && /usr/bin/env bash -lc 'set -a && . /etc/jiuzhuang-crm/jiuzhuang-crm.env && set +a && npm run worker:recycle-auto-finalize >> /var/log/jiuzhuang-crm/recycle-auto-finalize.log 2>&1'
```

首发前先保守改成 dry-run 也可以：

```cron
*/30 * * * * cd /srv/jiuzhuang-crm/current && /usr/bin/env bash -lc 'set -a && . /etc/jiuzhuang-crm/jiuzhuang-crm.env && set +a && npm run worker:recycle-auto-finalize -- --dry-run >> /var/log/jiuzhuang-crm/recycle-auto-finalize.log 2>&1'
```

说明：

- `*/30 * * * *` 表示每 30 分钟执行一次
- `set -a` 用于把 env 文件里的变量导出给子进程
- `cd` 到仓库根目录后再执行，保证 `dotenv/config` 与 `package.json` 路径稳定
- 标准输出和错误输出都落到同一日志文件

如果当前机器上 `npm` 不在 cron 的 `PATH` 里，改成绝对路径，例如：

```cron
*/30 * * * * cd /srv/jiuzhuang-crm/current && /usr/bin/env bash -lc 'set -a && . /etc/jiuzhuang-crm/jiuzhuang-crm.env && set +a && /usr/bin/npm run worker:recycle-auto-finalize >> /var/log/jiuzhuang-crm/recycle-auto-finalize.log 2>&1'
```

## 7. Windows 计划任务接线

推荐做法：

- 先把 `DATABASE_URL`
- `RECYCLE_AUTO_FINALIZE_ACTOR_ID`
- `RECYCLE_AUTO_FINALIZE_BATCH_LIMIT`

配置到运行该任务的系统账户环境变量里

计划任务建议：

- Program/script：

```text
C:\WINDOWS\System32\cmd.exe
```

- Arguments：

```text
/c npm run worker:recycle-auto-finalize >> C:\logs\recycle-auto-finalize.log 2>&1
```

- 首发前只保留 dry-run 时，Arguments 可改成：

```text
/c npm run worker:recycle-auto-finalize -- --dry-run >> C:\logs\recycle-auto-finalize.log 2>&1
```

- Start in：

```text
C:\path\to\LbnCrm
```

推荐频率：

- 每 30 分钟

如果 `npm` 不在系统 `PATH`，则把 Program/script 改成 `npm.cmd` 的绝对路径，或改成：

```text
C:\Program Files\nodejs\npm.cmd
```

Arguments：

```text
run worker:recycle-auto-finalize >> C:\logs\recycle-auto-finalize.log 2>&1
```

## 8. 容器 / 面板环境最小调用方式

### Docker / K8s / 容器平台

推荐把它当作 one-shot job / cron job 跑，而不是常驻 worker。

最小命令：

```bash
sh -lc "cd /app && npm run worker:recycle-auto-finalize"
```

只保留 dry-run 时：

```bash
sh -lc "cd /app && npm run worker:recycle-auto-finalize -- --dry-run"
```

要求：

- 容器内已经有构建产物和依赖
- 容器环境变量中已经注入 `DATABASE_URL`
- 生产环境建议同时注入 `RECYCLE_AUTO_FINALIZE_ACTOR_ID`

### 宝塔 / 面板类环境

如果面板提供“Shell 脚本定时任务”，最小方式是：

```bash
cd /www/wwwroot/LbnCrm
export RECYCLE_AUTO_FINALIZE_ACTOR_ID="<admin-user-id>"
export RECYCLE_AUTO_FINALIZE_BATCH_LIMIT=100
npm run worker:recycle-auto-finalize >> /www/wwwlogs/recycle-auto-finalize.log 2>&1
```

如果环境变量已经在站点或系统层配置好，可省略 `export`。

如果要先只保留 dry-run，把最后一行改成：

```bash
npm run worker:recycle-auto-finalize -- --dry-run >> /www/wwwlogs/recycle-auto-finalize.log 2>&1
```

## 9. 推荐执行频率

生产环境推荐：

- 每 30 分钟一次

原因：

- 冷静期是 `3` 天，不需要分钟级调度
- 30 分钟粒度足够接近“到期即收口”
- 对数据库和业务链路压力较低
- 如果某次任务失败，下一次自动重试等待时间也不长

可接受的更保守频率：

- 每 1 小时一次

不建议：

- 每天一次

原因：

- 到期条目会长时间滞留在 `ACTIVE`
- 容易造成“已经超 3 天但还没 finalize”的运营误解

## 10. 日志查看方式

### 调度器日志

先看计划任务自己的 stdout / stderr 日志文件：

- Linux 例子：`/var/log/jiuzhuang-crm/recycle-auto-finalize.log`
- Windows 例子：`C:\logs\recycle-auto-finalize.log`
- 面板例子：`/www/wwwlogs/recycle-auto-finalize.log`

关键日志事件：

- `recycle_auto_finalize.run_started`
- `recycle_auto_finalize.entry_previewed`
- `recycle_auto_finalize.entry_would_purge`
- `recycle_auto_finalize.entry_would_archive`
- `recycle_auto_finalize.entry_purged`
- `recycle_auto_finalize.entry_archived`
- `recycle_auto_finalize.entry_blocked`
- `recycle_auto_finalize.entry_skipped`
- `recycle_auto_finalize.entry_failed`
- `recycle_auto_finalize.run_completed`
- `recycle_auto_finalize.stdout_summary`
- `recycle_auto_finalize.alert`

stdout summary 统一字段：

- `runId`
- `startedAt`
- `finishedAt`
- `processed`
- `purged`
- `archived`
- `blocked`
- `skipped`
- `failed`
- `scanned`
- `backlog`
- `exitCode`

告警接入最小 code：

- `non_zero_exit`
- `failed_over_threshold`
- `backlog_over_threshold`
- `consecutive_failure_requires_scheduler`

### OperationLog

任务级汇总日志：

- `action = system.recycle_auto_finalize_run`

逐条对象日志：

- `action = customer.purged_from_recycle_bin`
- `action = customer.archived_from_recycle_bin`
- `action = trade_order.purged_from_recycle_bin`
- `action = trade_order.archived_from_recycle_bin`

排查时优先看：

- 本轮扫描数 `scannedCount`
- 实际尝试数 `attemptedCount`
- `purgedCount`
- `archivedCount`
- `blockedCount`
- `failedCount`

## 11. 首次上线前人工检查清单

- [ ] 目标环境已存在至少一个 `ACTIVE ADMIN`
- [ ] 已明确 `RECYCLE_AUTO_FINALIZE_ACTOR_ID` 对应哪一个专用管理员
- [ ] 该 actor 的 `id` 已写入目标环境变量
- [ ] 已明确 production 首次是否先跑 dry-run，再切真实执行
- [ ] `DATABASE_URL` 已指向正确环境，且不是本地或 staging 库
- [ ] 当前发布目录中可以执行 `npm run worker:recycle-auto-finalize`
- [ ] 当前环境已经完成 `npm ci` / `npm install`
- [ ] 当前环境已经完成 `npx prisma generate`
- [ ] 已确认本次只会处理 `CUSTOMER / TRADE_ORDER`
- [ ] `RECYCLE_AUTO_FINALIZE_BATCH_LIMIT` 已明确，不是临时默认值
- [ ] `RECYCLE_AUTO_FINALIZE_FAILED_ALERT_THRESHOLD` 已明确
- [ ] `RECYCLE_AUTO_FINALIZE_BACKLOG_ALERT_THRESHOLD` 已明确
- [ ] 已确认过期条目存在时，业务可以接受本轮真实落库
- [ ] 首次上线前已完成数据库备份或快照
- [ ] 已准备调度日志落盘目录，并确认运行账户可写
- [ ] 已确认如何消费非零退出码告警
- [ ] 已确认 backlog 告警由谁接收与处理
- [ ] 首次执行安排在低峰时段
- [ ] 首次执行后有人值守查看日志和 `OperationLog`

## 12. 失败排查清单

### 任务根本没启动

优先检查：

- cron / 计划任务是否真的触发
- 工作目录是否指向仓库根目录
- `npm` / `node` 是否在计划任务环境的 `PATH` 中
- 运行账户是否有仓库目录和日志目录权限

### 一启动就失败

优先检查：

- `DATABASE_URL` 是否存在
- `RECYCLE_AUTO_FINALIZE_ACTOR_ID` 是否指向有效 `ACTIVE ADMIN`
- 未配置 actor 时，目标环境里是否至少存在一个 `ACTIVE ADMIN`
- 目标环境是否已执行 `npm ci` / `npm install`
- `npx prisma generate` 是否已执行

### 日志里出现大量 `failed`

优先检查：

- 数据库连接是否稳定
- 目标环境代码版本是否与当前 schema/client 一致
- 是否有条目在 finalize 过程中触发了 adapter 内部异常
- 是否存在数据库权限不足或锁等待问题

### 日志里出现 `blocked`

这不一定是程序错误。

先确认：

- 该条目是否在脚本扫描和真正 finalize 之间被别人手动处理
- 当前条目是否其实还没到期
- 当前环境代码与 lifecycle contract 是否一致

### 日志里出现 `skipped`

通常表示并发竞争或状态已变化，例如：

- 条目刚被人工 finalize
- 条目刚被人工 restore
- 条目已经不再是 `ACTIVE`

这类情况通常不需要人工补救，只需要确认不是异常高频。

### 没有任何条目被处理

优先检查：

- 当前是否真的存在 `ACTIVE` 且 `recycleExpiresAt <= now` 的 `CUSTOMER / TRADE_ORDER` 条目
- `RECYCLE_AUTO_FINALIZE_BATCH_LIMIT` 是否过小
- 环境时区是否正确
- 调度时间与数据库时间是否明显漂移

## 13. 停用、回滚与只保留 dry-run

### 临时停掉调度

Linux cron：

- 注释掉对应 cron 行
- 或把计划任务频率改成不会触发的维护态配置

Windows 计划任务：

- 直接 `Disable` 对应任务

容器 / 面板：

- 暂停 CronJob / 定时任务
- 或先把执行命令替换为 no-op 脚本

### 只保留 dry-run

最小做法有两种，二选一即可：

1. 直接把调度命令改成追加 `-- --dry-run`
2. 或在调度环境里固定 `RECYCLE_AUTO_FINALIZE_DRY_RUN=1`

推荐优先改命令行，而不是只靠环境变量，原因是调度配置里更容易一眼看出当前仍处于 dry-run。

### 快速核对最近一次真实执行影响

优先按这个顺序看：

1. 调度日志里最后一条 `event = "recycle_auto_finalize.stdout_summary"`
2. 确认其中：
   - `dryRun = false`
   - `runId`
   - `processed / purged / archived / blocked / skipped / failed`
3. 查看 `OperationLog` 中最近一条 `action = system.recycle_auto_finalize_run`
4. 再查看对象级：
   - `customer.purged_from_recycle_bin`
   - `customer.archived_from_recycle_bin`
   - `trade_order.purged_from_recycle_bin`
   - `trade_order.archived_from_recycle_bin`

如果只看到 dry-run 日志，而没有新增上述 `OperationLog`，说明最近一次只是演练，没有真实落库。

## 14. 建议的首次上线方式

推荐顺序：

1. 先在 staging 跑 dry-run
2. 核对 `stdout_summary / alert / exitCode / 无真实落库`
3. staging 再跑一次真实执行
4. 人工检查调度日志与 `OperationLog`
5. 确认 `PURGE / ARCHIVE` 都按预期落到双终态
6. 再把同一套调度方式复制到 production
7. production 首次执行安排值守观察

## 15. 当前不包含的内容

本 runbook 不包含：

- 历史终态列表
- 批量最终处理 UI
- 新域扩展
- 调度平台内部监控面板
- 异步任务系统重构
