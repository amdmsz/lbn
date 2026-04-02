-- CreateTable
CREATE TABLE `lead_import_templates` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `description` TEXT NULL,
    `mappingConfig` JSON NOT NULL,
    `defaultLeadSource` ENUM(
        'H5_FORM',
        'EVENT_PAGE',
        'AD_CAMPAIGN',
        'CHANNEL_IMPORT',
        'EXCEL_IMPORT',
        'MANUAL_ENTRY',
        'OTHER'
    ) NOT NULL DEFAULT 'EXCEL_IMPORT',
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `lead_import_templates_name_key`(`name`),
    INDEX `lead_import_templates_isActive_createdAt_idx`(`isActive`, `createdAt`),
    INDEX `lead_import_templates_createdById_idx`(`createdById`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `lead_import_batches` (
    `id` VARCHAR(191) NOT NULL,
    `createdById` VARCHAR(191) NOT NULL,
    `templateId` VARCHAR(191) NULL,
    `fileName` VARCHAR(191) NOT NULL,
    `fileType` ENUM('CSV', 'XLS', 'XLSX') NOT NULL,
    `status` ENUM('DRAFT', 'IMPORTING', 'COMPLETED', 'FAILED') NOT NULL DEFAULT 'DRAFT',
    `defaultLeadSource` ENUM(
        'H5_FORM',
        'EVENT_PAGE',
        'AD_CAMPAIGN',
        'CHANNEL_IMPORT',
        'EXCEL_IMPORT',
        'MANUAL_ENTRY',
        'OTHER'
    ) NOT NULL DEFAULT 'EXCEL_IMPORT',
    `mappingConfig` JSON NULL,
    `headers` JSON NULL,
    `totalRows` INTEGER NOT NULL DEFAULT 0,
    `successRows` INTEGER NOT NULL DEFAULT 0,
    `failedRows` INTEGER NOT NULL DEFAULT 0,
    `duplicateRows` INTEGER NOT NULL DEFAULT 0,
    `report` JSON NULL,
    `importedAt` DATETIME(3) NULL,
    `errorMessage` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `lead_import_batches_createdById_createdAt_idx`(`createdById`, `createdAt`),
    INDEX `lead_import_batches_status_createdAt_idx`(`status`, `createdAt`),
    INDEX `lead_import_batches_templateId_idx`(`templateId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `lead_import_rows` (
    `id` VARCHAR(191) NOT NULL,
    `batchId` VARCHAR(191) NOT NULL,
    `rowNumber` INTEGER NOT NULL,
    `status` ENUM('PENDING', 'IMPORTED', 'FAILED', 'DUPLICATE') NOT NULL DEFAULT 'PENDING',
    `phoneRaw` VARCHAR(191) NULL,
    `normalizedPhone` VARCHAR(191) NULL,
    `mappedName` VARCHAR(191) NULL,
    `errorReason` TEXT NULL,
    `rawData` JSON NOT NULL,
    `mappedData` JSON NULL,
    `dedupType` ENUM('EXISTING_LEAD', 'BATCH_DUPLICATE') NULL,
    `matchedLeadId` VARCHAR(191) NULL,
    `importedLeadId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `lead_import_rows_batchId_rowNumber_key`(`batchId`, `rowNumber`),
    INDEX `lead_import_rows_batchId_status_idx`(`batchId`, `status`),
    INDEX `lead_import_rows_normalizedPhone_idx`(`normalizedPhone`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `lead_dedup_logs` (
    `id` VARCHAR(191) NOT NULL,
    `batchId` VARCHAR(191) NOT NULL,
    `rowId` VARCHAR(191) NULL,
    `phone` VARCHAR(191) NOT NULL,
    `dedupType` ENUM('EXISTING_LEAD', 'BATCH_DUPLICATE') NOT NULL,
    `matchedLeadId` VARCHAR(191) NULL,
    `reason` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `lead_dedup_logs_batchId_createdAt_idx`(`batchId`, `createdAt`),
    INDEX `lead_dedup_logs_rowId_idx`(`rowId`),
    INDEX `lead_dedup_logs_phone_dedupType_idx`(`phone`, `dedupType`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `lead_import_templates`
    ADD CONSTRAINT `lead_import_templates_createdById_fkey`
    FOREIGN KEY (`createdById`) REFERENCES `User`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `lead_import_batches`
    ADD CONSTRAINT `lead_import_batches_createdById_fkey`
    FOREIGN KEY (`createdById`) REFERENCES `User`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `lead_import_batches`
    ADD CONSTRAINT `lead_import_batches_templateId_fkey`
    FOREIGN KEY (`templateId`) REFERENCES `lead_import_templates`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `lead_import_rows`
    ADD CONSTRAINT `lead_import_rows_batchId_fkey`
    FOREIGN KEY (`batchId`) REFERENCES `lead_import_batches`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `lead_dedup_logs`
    ADD CONSTRAINT `lead_dedup_logs_batchId_fkey`
    FOREIGN KEY (`batchId`) REFERENCES `lead_import_batches`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `lead_dedup_logs`
    ADD CONSTRAINT `lead_dedup_logs_rowId_fkey`
    FOREIGN KEY (`rowId`) REFERENCES `lead_import_rows`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE;
