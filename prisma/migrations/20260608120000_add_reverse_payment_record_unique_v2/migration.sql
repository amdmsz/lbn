-- Audit-integrity fix: ReversePaymentRecord must reverse a given PaymentRecord
-- at most ONCE. Without this constraint a retried recordRefundPayout call (or
-- two concurrent payouts that both pass the application-level isReversed check
-- under READ COMMITTED) can insert two reverse rows for the same source
-- PaymentRecord, double-counting refunded amount in finance reports.
--
-- MariaDB / MySQL ordering:
-- 1. Create the new UNIQUE INDEX FIRST. The FK constraint
--    `reversepaymentrecord_sourcePaymentRecordId_fkey` automatically picks
--    up the new index as its supporting index.
-- 2. Only then can we DROP the old non-unique index without P3018
--    "Cannot drop index needed in a foreign key constraint".
--
-- MariaDB note: `ALTER TABLE ... DROP INDEX IF EXISTS` is NOT valid syntax —
-- the IF EXISTS clause is only supported on the standalone `DROP INDEX ... ON tbl`
-- form. Keep them in two statements.

-- IMPORTANT: production already executed `CREATE UNIQUE INDEX
-- reversepaymentrecord_sourcePaymentRecordId_key` during v1 attempt (v1
-- failed *afterwards* on the DROP step, so the unique index landed).
-- v2 only needs to DROP the redundant non-unique index.
--
-- For a fresh DB (where v1 never ran), we conditionally CREATE the unique
-- index using information_schema check + PREPARE/EXECUTE to stay idempotent
-- without relying on MariaDB 10.6+ `CREATE INDEX IF NOT EXISTS`.

-- Conditional CREATE: only if the unique key doesn't already exist
SET @reverse_unique_exists := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE table_schema = DATABASE()
    AND table_name = 'reversepaymentrecord'
    AND index_name = 'reversepaymentrecord_sourcePaymentRecordId_key'
);
SET @reverse_create_sql := IF(
  @reverse_unique_exists = 0,
  'CREATE UNIQUE INDEX `reversepaymentrecord_sourcePaymentRecordId_key` ON `reversepaymentrecord`(`sourcePaymentRecordId`)',
  'DO 0'
);
PREPARE reverse_create_stmt FROM @reverse_create_sql;
EXECUTE reverse_create_stmt;
DEALLOCATE PREPARE reverse_create_stmt;

-- DROP INDEX IF EXISTS is supported on MariaDB 10.0.2+ standalone form
DROP INDEX IF EXISTS `reversepaymentrecord_sourcePaymentRecordId_idx`
  ON `reversepaymentrecord`;
