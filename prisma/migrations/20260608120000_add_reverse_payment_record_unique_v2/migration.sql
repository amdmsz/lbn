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

-- Both statements use IF (NOT) EXISTS so the migration is idempotent —
-- production already partially applied v1 (which created the unique index
-- successfully before failing on DROP). Re-running plain CREATE would 1061.

CREATE UNIQUE INDEX IF NOT EXISTS `reversepaymentrecord_sourcePaymentRecordId_key`
  ON `reversepaymentrecord`(`sourcePaymentRecordId`);

DROP INDEX IF EXISTS `reversepaymentrecord_sourcePaymentRecordId_idx`
  ON `reversepaymentrecord`;
