-- Keep migration replay aligned with the current Prisma-generated names.
-- Existing databases that already have these names will no-op.

SET @lbn_sql = (
  SELECT IF(
    EXISTS (
      SELECT 1
      FROM information_schema.TABLE_CONSTRAINTS
      WHERE CONSTRAINT_SCHEMA = DATABASE()
        AND TABLE_NAME = 'lead'
        AND CONSTRAINT_TYPE = 'FOREIGN KEY'
        AND BINARY CONSTRAINT_NAME = 'lead_rolledBackBatchId_fkey'
    ),
    'ALTER TABLE `lead` DROP FOREIGN KEY `lead_rolledBackBatchId_fkey`',
    'SELECT 1'
  )
);
PREPARE lbn_stmt FROM @lbn_sql;
EXECUTE lbn_stmt;
DEALLOCATE PREPARE lbn_stmt;

SET @lbn_sql = (
  SELECT IF(
    EXISTS (
      SELECT 1
      FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'lead'
        AND BINARY INDEX_NAME = 'lead_rolledBackAt_idx'
    )
    AND NOT EXISTS (
      SELECT 1
      FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'lead'
        AND BINARY INDEX_NAME = 'lead_rolledBackAt_idx'
    ),
    'ALTER TABLE `lead` RENAME INDEX `lead_rolledBackAt_idx` TO `lead_rolledBackAt_idx`',
    'SELECT 1'
  )
);
PREPARE lbn_stmt FROM @lbn_sql;
EXECUTE lbn_stmt;
DEALLOCATE PREPARE lbn_stmt;

SET @lbn_sql = (
  SELECT IF(
    NOT EXISTS (
      SELECT 1
      FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'lead'
        AND BINARY INDEX_NAME = 'lead_rolledBackAt_idx'
    ),
    'CREATE INDEX `lead_rolledBackAt_idx` ON `lead`(`rolledBackAt`)',
    'SELECT 1'
  )
);
PREPARE lbn_stmt FROM @lbn_sql;
EXECUTE lbn_stmt;
DEALLOCATE PREPARE lbn_stmt;

SET @lbn_sql = (
  SELECT IF(
    EXISTS (
      SELECT 1
      FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'lead'
        AND BINARY INDEX_NAME = 'lead_rolledBackBatchId_idx'
    )
    AND NOT EXISTS (
      SELECT 1
      FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'lead'
        AND BINARY INDEX_NAME = 'lead_rolledBackBatchId_idx'
    ),
    'ALTER TABLE `lead` RENAME INDEX `lead_rolledBackBatchId_idx` TO `lead_rolledBackBatchId_idx`',
    'SELECT 1'
  )
);
PREPARE lbn_stmt FROM @lbn_sql;
EXECUTE lbn_stmt;
DEALLOCATE PREPARE lbn_stmt;

SET @lbn_sql = (
  SELECT IF(
    NOT EXISTS (
      SELECT 1
      FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'lead'
        AND BINARY INDEX_NAME = 'lead_rolledBackBatchId_idx'
    ),
    'CREATE INDEX `lead_rolledBackBatchId_idx` ON `lead`(`rolledBackBatchId`)',
    'SELECT 1'
  )
);
PREPARE lbn_stmt FROM @lbn_sql;
EXECUTE lbn_stmt;
DEALLOCATE PREPARE lbn_stmt;

SET @lbn_sql = (
  SELECT IF(
    NOT EXISTS (
      SELECT 1
      FROM information_schema.TABLE_CONSTRAINTS
      WHERE CONSTRAINT_SCHEMA = DATABASE()
        AND TABLE_NAME = 'lead'
        AND CONSTRAINT_TYPE = 'FOREIGN KEY'
        AND BINARY CONSTRAINT_NAME = 'lead_rolledBackBatchId_fkey'
    ),
    'ALTER TABLE `lead` ADD CONSTRAINT `lead_rolledBackBatchId_fkey` FOREIGN KEY (`rolledBackBatchId`) REFERENCES `lead_import_batches`(`id`) ON DELETE SET NULL ON UPDATE CASCADE',
    'SELECT 1'
  )
);
PREPARE lbn_stmt FROM @lbn_sql;
EXECUTE lbn_stmt;
DEALLOCATE PREPARE lbn_stmt;
