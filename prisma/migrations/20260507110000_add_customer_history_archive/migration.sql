-- Archive old low-engagement customer history when a duplicate import row is approved as a fresh lead.

CREATE TABLE `customer_history_archives` (
  `id` VARCHAR(191) NOT NULL,
  `sourceCustomerId` VARCHAR(191) NOT NULL,
  `sourceCustomerName` VARCHAR(191) NOT NULL,
  `sourceCustomerPhone` VARCHAR(191) NOT NULL,
  `sourceOwnerLabel` VARCHAR(191) NULL,
  `sourceExecutionClass` VARCHAR(191) NULL,
  `targetLeadId` VARCHAR(191) NULL,
  `targetCustomerId` VARCHAR(191) NULL,
  `sourceBatchId` VARCHAR(191) NULL,
  `sourceRowId` VARCHAR(191) NULL,
  `visibility` ENUM('ALL_ROLES', 'SUPERVISOR_ONLY') NOT NULL DEFAULT 'SUPERVISOR_ONLY',
  `reason` TEXT NOT NULL,
  `snapshot` JSON NOT NULL,
  `createdById` VARCHAR(191) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  INDEX `cust_hist_archive_target_customer_created_idx`(`targetCustomerId`, `createdAt`),
  INDEX `cust_hist_archive_target_lead_created_idx`(`targetLeadId`, `createdAt`),
  INDEX `cust_hist_archive_batch_row_idx`(`sourceBatchId`, `sourceRowId`),
  INDEX `cust_hist_archive_phone_created_idx`(`sourceCustomerPhone`, `createdAt`),
  INDEX `cust_hist_archive_visibility_created_idx`(`visibility`, `createdAt`),
  INDEX `cust_hist_archive_created_by_idx`(`createdById`, `createdAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `customer_history_archives` ADD CONSTRAINT `customer_history_archives_targetLeadId_fkey` FOREIGN KEY (`targetLeadId`) REFERENCES `lead`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `customer_history_archives` ADD CONSTRAINT `customer_history_archives_targetCustomerId_fkey` FOREIGN KEY (`targetCustomerId`) REFERENCES `customer`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `customer_history_archives` ADD CONSTRAINT `customer_history_archives_sourceBatchId_fkey` FOREIGN KEY (`sourceBatchId`) REFERENCES `lead_import_batches`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `customer_history_archives` ADD CONSTRAINT `customer_history_archives_sourceRowId_fkey` FOREIGN KEY (`sourceRowId`) REFERENCES `lead_import_rows`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `customer_history_archives` ADD CONSTRAINT `customer_history_archives_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `user`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
