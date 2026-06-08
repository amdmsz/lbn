-- Wave 7-B 客户分级 A/B/C/D/F.
--
-- 字段语义: nullable CustomerGrade enum on `customer` 表.
-- 由 lib/customers/grade.ts 推导写入, 不是销售手工选的.
--
-- MariaDB / MySQL 注意事项:
-- 1. ALTER TABLE 是 DDL, 在 MariaDB 上不能放在事务里回滚, 所以一旦失败需要手工
--    清理. 我们用 information_schema 做幂等检查, 避免 "Duplicate column /
--    Duplicate index" 报错.
-- 2. 此 MariaDB 版本不支持 `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` 的所有
--    形式. 用 PREPARE/EXECUTE + information_schema 兜底.
-- 3. 不动 FK; CustomerGrade 是单纯的 enum 列, 没有跨表关系.
-- 4. 不做 backfill — 现存客户保留 NULL, 等下次走 mutation 路径 (创建/标签/通话
--    /支付确认) 时由 lib/customers/grade.ts 自然推导.

-- 1. 幂等地新增 grade 列
SET @customer_grade_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE table_schema = DATABASE()
    AND table_name = 'customer'
    AND column_name = 'grade'
);
SET @customer_grade_add_sql := IF(
  @customer_grade_exists = 0,
  "ALTER TABLE `customer` ADD COLUMN `grade` ENUM('A','B','C','D','F') NULL",
  'DO 0'
);
PREPARE customer_grade_add_stmt FROM @customer_grade_add_sql;
EXECUTE customer_grade_add_stmt;
DEALLOCATE PREPARE customer_grade_add_stmt;

-- 2. 幂等地建过滤索引. 不带 IF NOT EXISTS 是为了兼容更老的 MariaDB.
SET @customer_grade_idx_exists := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE table_schema = DATABASE()
    AND table_name = 'customer'
    AND index_name = 'cust_grade_idx'
);
SET @customer_grade_idx_sql := IF(
  @customer_grade_idx_exists = 0,
  'CREATE INDEX `cust_grade_idx` ON `customer`(`grade`)',
  'DO 0'
);
PREPARE customer_grade_idx_stmt FROM @customer_grade_idx_sql;
EXECUTE customer_grade_idx_stmt;
DEALLOCATE PREPARE customer_grade_idx_stmt;
