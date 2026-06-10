-- Wave 11 "未加微客户至少拨打 5 遍" 工作流 — Customer.callCount.
--
-- 字段语义: `customer.callCount` = 该客户 CallRecord 总条数 (创建一条 +1, 不论
-- 是否接通). 由 lib/calls/mutations.ts createCallRecord 在同事务 increment;
-- 驱动 pending_dial 队列过滤 + 列表行 "已拨 X/5" 提示.
--
-- MariaDB / MySQL 注意事项 (沿用 20260608140000_add_customer_grade_wave7b 写法):
-- 1. ALTER TABLE 是 DDL, 在 MariaDB 上不能放在事务里回滚, 一旦失败需手工清理.
--    用 information_schema 做幂等检查, 避免 "Duplicate column / Duplicate index".
-- 2. 此 MariaDB 版本不保证支持 `ADD COLUMN IF NOT EXISTS` 的所有形式, 用
--    PREPARE/EXECUTE + information_schema 兜底.
-- 3. 不动 FK; callCount 是单纯的 Int 计数列, 没有跨表关系, FK-safe.
-- 4. 不做 backfill — 现存客户 callCount 落 0 (DEFAULT 0). 历史累计回填走
--    scripts/backfill-customer-call-count.mjs (dry-run 默认, --execute 才写).

-- 1. 幂等地新增 callCount 列 (NOT NULL DEFAULT 0).
SET @customer_call_count_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE table_schema = DATABASE()
    AND table_name = 'customer'
    AND column_name = 'callCount'
);
SET @customer_call_count_add_sql := IF(
  @customer_call_count_exists = 0,
  "ALTER TABLE `customer` ADD COLUMN `callCount` INT NOT NULL DEFAULT 0",
  'DO 0'
);
PREPARE customer_call_count_add_stmt FROM @customer_call_count_add_sql;
EXECUTE customer_call_count_add_stmt;
DEALLOCATE PREPARE customer_call_count_add_stmt;

-- 2. 幂等地建过滤索引. 不带 IF NOT EXISTS 是为了兼容更老的 MariaDB.
SET @customer_call_count_idx_exists := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE table_schema = DATABASE()
    AND table_name = 'customer'
    AND index_name = 'cust_call_count_idx'
);
SET @customer_call_count_idx_sql := IF(
  @customer_call_count_idx_exists = 0,
  'CREATE INDEX `cust_call_count_idx` ON `customer`(`callCount`)',
  'DO 0'
);
PREPARE customer_call_count_idx_stmt FROM @customer_call_count_idx_sql;
EXECUTE customer_call_count_idx_stmt;
DEALLOCATE PREPARE customer_call_count_idx_stmt;
