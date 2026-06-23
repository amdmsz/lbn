import { PrismaClient } from "@prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

const databaseUrl = process.env.DATABASE_URL?.trim();

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required to initialize Prisma.");
}

// 连接池大小.
//
// 2026-06-11 生产事故复盘: `new PrismaMariaDb(databaseUrl)` 只传连接串时, 底层
// mariadb 驱动用默认池 = 10 (node_modules/mariadb/lib/config/pool-options.js:29).
// 而客户中心每次 SSR 并发十几条 SQL (队列聚合 + 战绩条统计 + 列表), 早高峰几个
// 销售同时刷就把 10 个连接占满, 后续请求 10s 拿不到连接 → DriverAdapterError:
// pool timeout → 站点"打不开".
//
// 注意: connectionLimit 是 mariadb 驱动的池选项, 必须用 PoolConfig 对象显式传;
// URL 上的 `connection_limit=` (Prisma 原生连接器参数名) 与 `connectionLimit`
// (mariadb 名) 驱动都不会从连接串解析池大小, 所以只能在这里传.
//
// MySQL 服务端 max_connections=151, 留足余量; 默认 25, 可用 DB_CONNECTION_LIMIT 调.
const connectionLimit = Number(process.env.DB_CONNECTION_LIMIT ?? "25") || 25;

// 从 URL 解析连接参数 + 显式注入 connectionLimit. URL 一定是合法的 (上面已
// 用它初始化过), new URL() 不会抛.
const parsedDbUrl = new URL(databaseUrl);
const adapter = new PrismaMariaDb({
  host: parsedDbUrl.hostname,
  port: parsedDbUrl.port ? Number(parsedDbUrl.port) : 3306,
  user: decodeURIComponent(parsedDbUrl.username),
  password: decodeURIComponent(parsedDbUrl.password),
  database: parsedDbUrl.pathname.replace(/^\//, "") || undefined,
  connectionLimit,
  // 2026-06-23 生产事故复盘: MySQL 用 caching_sha2_password, 重启后认证缓存清空,
  // 此时驱动在普通连接上要做 RSA 公钥握手; 不开此项 → 全部新连接认证失败 →
  // 连接池填不满 → 每个请求等 10s 拿不到连接 → DriverAdapterError: pool timeout
  // → 站点"打不开". DB 在 127.0.0.1 本机, 无中间人风险, 直接允许公钥获取兜底.
  allowPublicKeyRetrieval: true,
});

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter,
    log: ["warn", "error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
