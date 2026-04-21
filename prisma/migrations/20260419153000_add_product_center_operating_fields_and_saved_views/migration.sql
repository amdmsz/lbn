-- AlterTable
ALTER TABLE `Product` ADD COLUMN `brandName` VARCHAR(191) NULL,
    ADD COLUMN `categoryCode` VARCHAR(191) NULL,
    ADD COLUMN `financeCategoryCode` VARCHAR(191) NULL,
    ADD COLUMN `internalSupplyRemark` TEXT NULL,
    ADD COLUMN `primarySalesSceneCode` VARCHAR(191) NULL,
    ADD COLUMN `seriesName` VARCHAR(191) NULL,
    ADD COLUMN `supplyGroupCode` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `ProductSku` ADD COLUMN `alcoholPercent` DECIMAL(5, 2) NULL,
    ADD COLUMN `capacityMl` INTEGER NULL,
    ADD COLUMN `isLiveCommon` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `minUnitPrice` DECIMAL(10, 2) NULL,
    ADD COLUMN `packageFormCode` VARCHAR(191) NULL,
    ADD COLUMN `shippingRemark` TEXT NULL;

-- CreateTable
CREATE TABLE `ProductSavedView` (
    `id` VARCHAR(191) NOT NULL,
    `ownerId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `tab` VARCHAR(191) NOT NULL,
    `filtersJson` JSON NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `ProductSavedView_ownerId_tab_updatedAt_idx`(`ownerId`, `tab`, `updatedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `ProductSavedView` ADD CONSTRAINT `ProductSavedView_ownerId_fkey` FOREIGN KEY (`ownerId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
