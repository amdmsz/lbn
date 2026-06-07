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
-- If the old index name doesn't exist (fresh DB), the DROP becomes a no-op
-- via IF EXISTS — supported on MariaDB 10.0.2+ and MySQL 8.0.16+.

CREATE UNIQUE INDEX `reversepaymentrecord_sourcePaymentRecordId_key`
  ON `reversepaymentrecord`(`sourcePaymentRecordId`);

ALTER TABLE `reversepaymentrecord`
  DROP INDEX IF EXISTS `reversepaymentrecord_sourcePaymentRecordId_idx`;
