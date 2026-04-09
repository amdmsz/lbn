ALTER TABLE `lead_import_batches`
  MODIFY `status` ENUM('DRAFT', 'QUEUED', 'IMPORTING', 'COMPLETED', 'FAILED') NOT NULL DEFAULT 'DRAFT',
  ADD COLUMN `stage` ENUM('QUEUED', 'PARSING', 'MATCHING', 'WRITING', 'FINALIZING', 'COMPLETED', 'FAILED') NULL AFTER `status`,
  ADD COLUMN `sourceFilePath` TEXT NULL AFTER `headers`,
  ADD COLUMN `queueJobId` VARCHAR(191) NULL AFTER `sourceFilePath`,
  ADD COLUMN `processingStartedAt` DATETIME(3) NULL AFTER `queueJobId`,
  ADD COLUMN `lastHeartbeatAt` DATETIME(3) NULL AFTER `processingStartedAt`;

CREATE INDEX `lead_import_batches_stage_createdAt_idx`
  ON `lead_import_batches`(`stage`, `createdAt`);
