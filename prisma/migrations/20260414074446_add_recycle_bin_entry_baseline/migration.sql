-- DropForeignKey
ALTER TABLE `lead` DROP FOREIGN KEY `lead_rolledBackBatchId_fkey`;

-- CreateTable
CREATE TABLE `recycle_bin_entries` (
    `id` VARCHAR(191) NOT NULL,
    `targetType` ENUM('PRODUCT', 'PRODUCT_SKU', 'SUPPLIER', 'LIVE_SESSION') NOT NULL,
    `targetId` VARCHAR(191) NOT NULL,
    `domain` ENUM('PRODUCT_MASTER_DATA', 'LIVE_SESSION') NOT NULL,
    `titleSnapshot` VARCHAR(191) NOT NULL,
    `secondarySnapshot` VARCHAR(191) NULL,
    `originalStatusSnapshot` VARCHAR(191) NULL,
    `restoreRouteSnapshot` VARCHAR(191) NOT NULL,
    `deleteReasonCode` ENUM('MISTAKEN_CREATION', 'TEST_DATA', 'DUPLICATE', 'NO_LONGER_NEEDED', 'OTHER') NOT NULL,
    `deleteReasonText` TEXT NULL,
    `deletedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `deletedById` VARCHAR(191) NOT NULL,
    `recycleExpiresAt` DATETIME(3) NOT NULL,
    `status` ENUM('ACTIVE', 'RESTORED', 'PURGED') NOT NULL DEFAULT 'ACTIVE',
    `activeEntryKey` VARCHAR(191) NULL,
    `resolvedAt` DATETIME(3) NULL,
    `resolvedById` VARCHAR(191) NULL,
    `blockerSnapshotJson` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `recycle_bin_entries_activeEntryKey_key`(`activeEntryKey`),
    INDEX `recycle_bin_entries_targetType_targetId_idx`(`targetType`, `targetId`),
    INDEX `recycle_bin_entries_domain_status_deletedAt_idx`(`domain`, `status`, `deletedAt`),
    INDEX `recycle_bin_entries_status_recycleExpiresAt_idx`(`status`, `recycleExpiresAt`),
    INDEX `recycle_bin_entries_deletedById_deletedAt_idx`(`deletedById`, `deletedAt`),
    INDEX `recycle_bin_entries_resolvedById_resolvedAt_idx`(`resolvedById`, `resolvedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `recycle_bin_entries` ADD CONSTRAINT `recycle_bin_entries_deletedById_fkey` FOREIGN KEY (`deletedById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `recycle_bin_entries` ADD CONSTRAINT `recycle_bin_entries_resolvedById_fkey` FOREIGN KEY (`resolvedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Lead` ADD CONSTRAINT `Lead_rolledBackBatchId_fkey` FOREIGN KEY (`rolledBackBatchId`) REFERENCES `lead_import_batches`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- RenameIndex
ALTER TABLE `lead` RENAME INDEX `lead_rolledBackAt_idx` TO `Lead_rolledBackAt_idx`;

-- RenameIndex
ALTER TABLE `lead` RENAME INDEX `lead_rolledBackBatchId_idx` TO `Lead_rolledBackBatchId_idx`;
