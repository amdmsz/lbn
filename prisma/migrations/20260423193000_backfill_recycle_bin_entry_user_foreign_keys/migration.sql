-- Backfill recycle_bin_entries foreign keys so migration history matches schema.prisma.
-- This migration is intentionally idempotent across three states:
-- 1) foreign keys are missing
-- 2) foreign keys exist with legacy/manual names
-- 3) foreign keys already exist with the canonical Prisma names

SET @user_table_name = COALESCE(
  (
    SELECT TABLE_NAME
    FROM information_schema.TABLES
    WHERE TABLE_SCHEMA = DATABASE()
      AND LOWER(TABLE_NAME) = 'user'
    ORDER BY CASE WHEN TABLE_NAME = 'User' THEN 0 ELSE 1 END, TABLE_NAME
    LIMIT 1
  ),
  '__missing_user_table__'
);

SET @drop_deleted_fk_sql = (
  SELECT IFNULL(
    CONCAT(
      'ALTER TABLE `recycle_bin_entries` ',
      GROUP_CONCAT(
        CONCAT('DROP FOREIGN KEY `', CONSTRAINT_NAME, '`')
        ORDER BY CONSTRAINT_NAME
        SEPARATOR ', '
      )
    ),
    'SELECT 1'
  )
  FROM information_schema.KEY_COLUMN_USAGE
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'recycle_bin_entries'
    AND COLUMN_NAME = 'deletedById'
    AND REFERENCED_TABLE_NAME IS NOT NULL
    AND CONSTRAINT_NAME <> 'recycle_bin_entries_deletedById_fkey'
);

PREPARE drop_deleted_fk_stmt FROM @drop_deleted_fk_sql;
EXECUTE drop_deleted_fk_stmt;
DEALLOCATE PREPARE drop_deleted_fk_stmt;

SET @drop_resolved_fk_sql = (
  SELECT IFNULL(
    CONCAT(
      'ALTER TABLE `recycle_bin_entries` ',
      GROUP_CONCAT(
        CONCAT('DROP FOREIGN KEY `', CONSTRAINT_NAME, '`')
        ORDER BY CONSTRAINT_NAME
        SEPARATOR ', '
      )
    ),
    'SELECT 1'
  )
  FROM information_schema.KEY_COLUMN_USAGE
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'recycle_bin_entries'
    AND COLUMN_NAME = 'resolvedById'
    AND REFERENCED_TABLE_NAME IS NOT NULL
    AND CONSTRAINT_NAME <> 'recycle_bin_entries_resolvedById_fkey'
);

PREPARE drop_resolved_fk_stmt FROM @drop_resolved_fk_sql;
EXECUTE drop_resolved_fk_stmt;
DEALLOCATE PREPARE drop_resolved_fk_stmt;

SET @has_deleted_fk = (
  SELECT COUNT(*)
  FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'recycle_bin_entries'
    AND CONSTRAINT_TYPE = 'FOREIGN KEY'
    AND CONSTRAINT_NAME = 'recycle_bin_entries_deletedById_fkey'
);

SET @add_deleted_fk_sql = IF(
  @has_deleted_fk = 0,
  CONCAT(
    'ALTER TABLE `recycle_bin_entries` ',
    'ADD CONSTRAINT `recycle_bin_entries_deletedById_fkey` ',
    'FOREIGN KEY (`deletedById`) REFERENCES `', @user_table_name, '`(`id`) ',
    'ON DELETE RESTRICT ON UPDATE CASCADE'
  ),
  'SELECT 1'
);

PREPARE add_deleted_fk_stmt FROM @add_deleted_fk_sql;
EXECUTE add_deleted_fk_stmt;
DEALLOCATE PREPARE add_deleted_fk_stmt;

SET @has_resolved_fk = (
  SELECT COUNT(*)
  FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'recycle_bin_entries'
    AND CONSTRAINT_TYPE = 'FOREIGN KEY'
    AND CONSTRAINT_NAME = 'recycle_bin_entries_resolvedById_fkey'
);

SET @add_resolved_fk_sql = IF(
  @has_resolved_fk = 0,
  CONCAT(
    'ALTER TABLE `recycle_bin_entries` ',
    'ADD CONSTRAINT `recycle_bin_entries_resolvedById_fkey` ',
    'FOREIGN KEY (`resolvedById`) REFERENCES `', @user_table_name, '`(`id`) ',
    'ON DELETE SET NULL ON UPDATE CASCADE'
  ),
  'SELECT 1'
);

PREPARE add_resolved_fk_stmt FROM @add_resolved_fk_sql;
EXECUTE add_resolved_fk_stmt;
DEALLOCATE PREPARE add_resolved_fk_stmt;
