ALTER TABLE `lead`
  ADD COLUMN `rolledBackAt` DATETIME(3) NULL,
  ADD COLUMN `rolledBackBatchId` VARCHAR(191) NULL;

CREATE INDEX `lead_rolledBackAt_idx` ON `lead`(`rolledBackAt`);
CREATE INDEX `lead_rolledBackBatchId_idx` ON `lead`(`rolledBackBatchId`);

ALTER TABLE `lead_customer_merge_logs`
  DROP FOREIGN KEY `lead_customer_merge_logs_leadId_fkey`;

ALTER TABLE `lead_customer_merge_logs`
  MODIFY `leadId` VARCHAR(191) NULL,
  ADD COLUMN `leadIdSnapshot` VARCHAR(191) NULL,
  ADD COLUMN `leadNameSnapshot` VARCHAR(191) NULL,
  ADD COLUMN `leadPhoneSnapshot` VARCHAR(191) NULL;

CREATE TABLE `lead_import_batch_rollbacks` (
    `id` VARCHAR(191) NOT NULL,
    `batchId` VARCHAR(191) NOT NULL,
    `mode` ENUM('AUDIT_PRESERVED', 'HARD_DELETE') NOT NULL,
    `actorId` VARCHAR(191) NOT NULL,
    `precheckSnapshot` JSON NOT NULL,
    `executionSnapshot` JSON NOT NULL,
    `executedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `lead_import_batch_rollbacks_batchId_key`(`batchId`),
    INDEX `lead_import_batch_rollbacks_actorId_executedAt_idx`(`actorId`, `executedAt`),
    INDEX `lead_import_batch_rollbacks_mode_executedAt_idx`(`mode`, `executedAt`),
    PRIMARY KEY (`id`)
);

ALTER TABLE `lead`
  ADD CONSTRAINT `lead_rolledBackBatchId_fkey`
    FOREIGN KEY (`rolledBackBatchId`) REFERENCES `lead_import_batches`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `lead_customer_merge_logs`
  ADD CONSTRAINT `lead_customer_merge_logs_leadId_fkey`
    FOREIGN KEY (`leadId`) REFERENCES `lead`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `lead_import_batch_rollbacks`
  ADD CONSTRAINT `lead_import_batch_rollbacks_batchId_fkey`
    FOREIGN KEY (`batchId`) REFERENCES `lead_import_batches`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `lead_import_batch_rollbacks_actorId_fkey`
    FOREIGN KEY (`actorId`) REFERENCES `user`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
