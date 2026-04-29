-- Add logistics auto-status snapshots and structured exception flags on fulfillment tasks.

ALTER TABLE `shippingtask`
  ADD COLUMN `logisticsLastCheckedAt` DATETIME(3) NULL,
  ADD COLUMN `logisticsLastStatusCode` VARCHAR(191) NULL,
  ADD COLUMN `logisticsLastStatusLabel` VARCHAR(191) NULL,
  ADD COLUMN `logisticsLastEventAt` DATETIME(3) NULL,
  ADD COLUMN `logisticsExceptionType` ENUM('ADDRESS_MISMATCH', 'RETURN_OR_REJECTED', 'TRACE_QUERY_FAILED') NULL,
  ADD COLUMN `logisticsExceptionDetectedAt` DATETIME(3) NULL,
  ADD COLUMN `logisticsExceptionMessage` TEXT NULL;

CREATE INDEX `shiptask_logistics_exception_idx` ON `shippingtask`(`logisticsExceptionType`, `shippingStatus`, `createdAt`);

ALTER TABLE `logisticsfollowuptask`
  ALTER COLUMN `intervalDays` SET DEFAULT 3;
