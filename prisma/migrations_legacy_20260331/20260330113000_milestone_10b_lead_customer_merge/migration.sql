-- AlterTable
ALTER TABLE `lead_import_batches`
  ADD COLUMN `createdCustomerRows` INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN `matchedCustomerRows` INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE `lead_customer_merge_logs` (
  `id` VARCHAR(191) NOT NULL,
  `batchId` VARCHAR(191) NOT NULL,
  `rowId` VARCHAR(191) NULL,
  `leadId` VARCHAR(191) NOT NULL,
  `customerId` VARCHAR(191) NOT NULL,
  `action` ENUM('CREATED_CUSTOMER', 'MATCHED_EXISTING_CUSTOMER') NOT NULL,
  `source` ENUM('H5_FORM', 'EVENT_PAGE', 'AD_CAMPAIGN', 'CHANNEL_IMPORT', 'EXCEL_IMPORT', 'MANUAL_ENTRY', 'OTHER') NOT NULL,
  `phone` VARCHAR(191) NOT NULL,
  `tagSynced` BOOLEAN NOT NULL DEFAULT false,
  `note` TEXT NULL,
  `actorId` VARCHAR(191) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  INDEX `lead_customer_merge_logs_batchId_action_createdAt_idx`(`batchId`, `action`, `createdAt`),
  INDEX `lead_customer_merge_logs_rowId_idx`(`rowId`),
  INDEX `lead_customer_merge_logs_leadId_createdAt_idx`(`leadId`, `createdAt`),
  INDEX `lead_customer_merge_logs_customerId_createdAt_idx`(`customerId`, `createdAt`),
  INDEX `lead_customer_merge_logs_phone_createdAt_idx`(`phone`, `createdAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `lead_customer_merge_logs`
  ADD CONSTRAINT `lead_customer_merge_logs_batchId_fkey`
  FOREIGN KEY (`batchId`) REFERENCES `lead_import_batches`(`id`)
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `lead_customer_merge_logs`
  ADD CONSTRAINT `lead_customer_merge_logs_rowId_fkey`
  FOREIGN KEY (`rowId`) REFERENCES `lead_import_rows`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `lead_customer_merge_logs`
  ADD CONSTRAINT `lead_customer_merge_logs_leadId_fkey`
  FOREIGN KEY (`leadId`) REFERENCES `Lead`(`id`)
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `lead_customer_merge_logs`
  ADD CONSTRAINT `lead_customer_merge_logs_customerId_fkey`
  FOREIGN KEY (`customerId`) REFERENCES `Customer`(`id`)
  ON DELETE RESTRICT ON UPDATE CASCADE;
