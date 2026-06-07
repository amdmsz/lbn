-- Audit-integrity fix: ReversePaymentRecord must reverse a given PaymentRecord
-- at most ONCE. Without this constraint a retried recordRefundPayout call (or
-- two concurrent payouts that both pass the application-level isReversed check
-- under READ COMMITTED) can insert two reverse rows for the same source
-- PaymentRecord, double-counting refunded amount in finance reports.
--
-- Drop the redundant non-unique sourcePaymentRecordId index first (the new
-- UNIQUE INDEX serves both uniqueness and lookup), then add the UNIQUE INDEX.
-- Compatible with MariaDB / MySQL 8.

ALTER TABLE `reversepaymentrecord`
  DROP INDEX `reversepaymentrecord_sourcePaymentRecordId_idx`;

CREATE UNIQUE INDEX `reversepaymentrecord_sourcePaymentRecordId_key`
  ON `reversepaymentrecord`(`sourcePaymentRecordId`);
