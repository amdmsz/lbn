/**
 * Next.js 中间件注册结构性单测.
 *
 * 背景: Next.js 仅在以下条件全部满足时才会把中间件挂到 edge —
 *   1. 文件名必须是 `middleware.ts` (或 `.js`), 并位于项目根目录 (与 `next.config.ts` 同级);
 *   2. 必须导出名为 `middleware` 的函数 (或 `default`).
 *
 * 我们之前把这个文件叫 `proxy.ts` 并导出 `proxy`, 结果 matcher 里所有路径
 * (含 `/settings`, `/finance`, `/reports`, `/recycle-bin` …) 都在 edge 被静默
 * 跳过 — SALES 用户可以绕过 RBAC 直接访问, 必须改密码用户也不会被强制跳转.
 *
 * 这里通过解析源码文本做结构性断言, 不调用 Next 运行时, 避免引入额外依赖.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFile, access } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");
const middlewarePath = path.join(repoRoot, "middleware.ts");
const proxyPath = path.join(repoRoot, "proxy.ts");

test("middleware.ts 必须存在于项目根 (Next.js 自动注册的唯一约定)", async () => {
  await access(middlewarePath, fsConstants.R_OK);
});

test("旧的 proxy.ts 必须已被移除 (避免误以为它是中间件)", async () => {
  let exists = false;
  try {
    await access(proxyPath, fsConstants.F_OK);
    exists = true;
  } catch {
    exists = false;
  }
  assert.equal(
    exists,
    false,
    "proxy.ts 仍存在 — Next.js 不会把它当中间件, RBAC/必改密码会在 edge 被绕过",
  );
});

test("middleware.ts 必须导出名为 middleware 的函数 (或 export default)", async () => {
  const source = await readFile(middlewarePath, "utf8");
  const hasNamedExport = /export\s+(?:async\s+)?function\s+middleware\s*\(/.test(
    source,
  );
  const hasDefaultExport = /export\s+default\s+(?:async\s+)?function/.test(
    source,
  );
  assert.ok(
    hasNamedExport || hasDefaultExport,
    "未找到 `export function middleware(...)` 或 `export default function(...)` — Next.js 会跳过该中间件",
  );
});

test("middleware.ts 必须导出 config.matcher, 且包含关键 RBAC 路径", async () => {
  const source = await readFile(middlewarePath, "utf8");
  assert.match(
    source,
    /export\s+const\s+config\s*=/,
    "缺少 `export const config = {...}` — Next.js 会对所有路径运行中间件, 性能差且可能匹配静态资源",
  );
  // 关键 RBAC 路径在 matcher 中必须出现, 否则会绕过 canAccessPath
  for (const requiredRoute of [
    "/settings/:path*",
    "/finance/:path*",
    "/reports/:path*",
    "/recycle-bin/:path*",
    "/customers/:path*",
    "/login",
    "/change-password",
  ]) {
    assert.ok(
      source.includes(`"${requiredRoute}"`),
      `config.matcher 缺少 ${requiredRoute} — 该路径下 RBAC 会被绕过`,
    );
  }
});

test("middleware.ts 必须仍调用 canAccessPath + mustChangePassword 守卫 (防止回归)", async () => {
  const source = await readFile(middlewarePath, "utf8");
  assert.match(
    source,
    /canAccessPath\(/,
    "缺少 canAccessPath 调用 — 角色访问控制丢失",
  );
  assert.match(
    source,
    /mustChangePassword/,
    "缺少 mustChangePassword 分支 — 强制改密重定向丢失",
  );
  assert.match(
    source,
    /getToken\(/,
    "缺少 next-auth getToken 调用 — 未登录用户检测丢失",
  );
});
