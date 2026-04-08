-- AlterTable
ALTER TABLE `operationlog` MODIFY `module` ENUM('USER', 'TEAM', 'ROLE', 'LEAD', 'LEAD_IMPORT', 'CUSTOMER', 'ASSIGNMENT', 'FOLLOW_UP', 'CALL', 'WECHAT', 'LIVE_SESSION', 'ORDER', 'GIFT', 'SHIPPING', 'SUPPLIER', 'PRODUCT', 'SALES_ORDER', 'SHIPPING_EXPORT', 'LOGISTICS', 'MASTER_DATA', 'SYSTEM') NOT NULL,
    MODIFY `targetType` ENUM('USER', 'TEAM', 'ROLE', 'LEAD', 'LEAD_IMPORT_BATCH', 'LEAD_IMPORT_ROW', 'LEAD_IMPORT_TEMPLATE', 'LEAD_DEDUP_LOG', 'LEAD_CUSTOMER_MERGE_LOG', 'CUSTOMER', 'LEAD_ASSIGNMENT', 'FOLLOW_UP_TASK', 'CALL_RECORD', 'WECHAT_RECORD', 'LIVE_SESSION', 'LIVE_INVITATION', 'ORDER', 'GIFT_RECORD', 'SHIPPING_TASK', 'SUPPLIER', 'PRODUCT', 'PRODUCT_SKU', 'SALES_ORDER', 'SALES_ORDER_ITEM', 'SALES_ORDER_GIFT_ITEM', 'SHIPPING_EXPORT_BATCH', 'LOGISTICS_FOLLOW_UP_TASK', 'TAG_GROUP', 'TAG_CATEGORY', 'TAG', 'CATEGORY', 'DICTIONARY_TYPE', 'DICTIONARY_ITEM') NOT NULL;

-- AlterTable
ALTER TABLE `shippingtask` ADD COLUMN `codAmount` DECIMAL(10, 2) NOT NULL DEFAULT 0,
    ADD COLUMN `exportBatchId` VARCHAR(191) NULL,
    ADD COLUMN `insuranceAmount` DECIMAL(10, 2) NOT NULL DEFAULT 0,
    ADD COLUMN `insuranceRequired` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `reportStatus` ENUM('PENDING', 'REPORTED') NOT NULL DEFAULT 'PENDING',
    ADD COLUMN `reportedAt` DATETIME(3) NULL,
    ADD COLUMN `salesOrderId` VARCHAR(191) NULL,
    ADD COLUMN `shippingProvider` VARCHAR(191) NULL,
    ADD COLUMN `shippingStatus` ENUM('PENDING', 'READY_TO_SHIP', 'SHIPPED', 'DELIVERED', 'COMPLETED', 'CANCELED') NOT NULL DEFAULT 'PENDING',
    ADD COLUMN `supplierId` VARCHAR(191) NULL;

-- CreateTable
CREATE TABLE `Supplier` (
    `id` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `contactName` VARCHAR(191) NULL,
    `contactPhone` VARCHAR(191) NULL,
    `remark` TEXT NULL,
    `enabled` BOOLEAN NOT NULL DEFAULT true,
    `createdById` VARCHAR(191) NULL,
    `updatedById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Supplier_code_key`(`code`),
    INDEX `Supplier_enabled_createdAt_idx`(`enabled`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Product` (
    `id` VARCHAR(191) NOT NULL,
    `supplierId` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `description` TEXT NULL,
    `enabled` BOOLEAN NOT NULL DEFAULT true,
    `createdById` VARCHAR(191) NULL,
    `updatedById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Product_code_key`(`code`),
    INDEX `Product_supplierId_enabled_createdAt_idx`(`supplierId`, `enabled`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ProductSku` (
    `id` VARCHAR(191) NOT NULL,
    `productId` VARCHAR(191) NOT NULL,
    `skuCode` VARCHAR(191) NOT NULL,
    `skuName` VARCHAR(191) NOT NULL,
    `specText` VARCHAR(191) NOT NULL,
    `unit` VARCHAR(191) NOT NULL,
    `defaultUnitPrice` DECIMAL(10, 2) NOT NULL,
    `codSupported` BOOLEAN NOT NULL DEFAULT false,
    `insuranceSupported` BOOLEAN NOT NULL DEFAULT false,
    `defaultInsuranceAmount` DECIMAL(10, 2) NOT NULL DEFAULT 0,
    `enabled` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `ProductSku_skuCode_key`(`skuCode`),
    INDEX `ProductSku_productId_enabled_createdAt_idx`(`productId`, `enabled`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SalesOrder` (
    `id` VARCHAR(191) NOT NULL,
    `orderNo` VARCHAR(191) NOT NULL,
    `customerId` VARCHAR(191) NOT NULL,
    `ownerId` VARCHAR(191) NULL,
    `supplierId` VARCHAR(191) NOT NULL,
    `reviewStatus` ENUM('PENDING_REVIEW', 'APPROVED', 'REJECTED') NOT NULL DEFAULT 'PENDING_REVIEW',
    `paymentMode` ENUM('DEPOSIT', 'FULL_PAYMENT', 'COD') NOT NULL,
    `goodsAmount` DECIMAL(10, 2) NOT NULL DEFAULT 0,
    `discountAmount` DECIMAL(10, 2) NOT NULL DEFAULT 0,
    `finalAmount` DECIMAL(10, 2) NOT NULL DEFAULT 0,
    `paidAmount` DECIMAL(10, 2) NOT NULL DEFAULT 0,
    `remainingAmount` DECIMAL(10, 2) NOT NULL DEFAULT 0,
    `codAmount` DECIMAL(10, 2) NOT NULL DEFAULT 0,
    `insuranceRequired` BOOLEAN NOT NULL DEFAULT false,
    `insuranceAmount` DECIMAL(10, 2) NOT NULL DEFAULT 0,
    `discountReason` TEXT NULL,
    `receiverNameSnapshot` VARCHAR(191) NOT NULL,
    `receiverPhoneSnapshot` VARCHAR(191) NOT NULL,
    `receiverAddressSnapshot` TEXT NOT NULL,
    `reviewerId` VARCHAR(191) NULL,
    `reviewedAt` DATETIME(3) NULL,
    `rejectReason` TEXT NULL,
    `remark` TEXT NULL,
    `createdById` VARCHAR(191) NULL,
    `updatedById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `SalesOrder_orderNo_key`(`orderNo`),
    INDEX `SalesOrder_customerId_createdAt_idx`(`customerId`, `createdAt`),
    INDEX `SalesOrder_ownerId_reviewStatus_createdAt_idx`(`ownerId`, `reviewStatus`, `createdAt`),
    INDEX `SalesOrder_supplierId_reviewStatus_createdAt_idx`(`supplierId`, `reviewStatus`, `createdAt`),
    INDEX `SalesOrder_reviewStatus_createdAt_idx`(`reviewStatus`, `createdAt`),
    INDEX `SalesOrder_paymentMode_createdAt_idx`(`paymentMode`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SalesOrderItem` (
    `id` VARCHAR(191) NOT NULL,
    `salesOrderId` VARCHAR(191) NOT NULL,
    `productId` VARCHAR(191) NOT NULL,
    `skuId` VARCHAR(191) NOT NULL,
    `productNameSnapshot` VARCHAR(191) NOT NULL,
    `skuNameSnapshot` VARCHAR(191) NOT NULL,
    `specSnapshot` VARCHAR(191) NOT NULL,
    `unitSnapshot` VARCHAR(191) NOT NULL,
    `listPriceSnapshot` DECIMAL(10, 2) NOT NULL,
    `dealPriceSnapshot` DECIMAL(10, 2) NOT NULL,
    `qty` INTEGER NOT NULL,
    `subtotal` DECIMAL(10, 2) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `SalesOrderItem_salesOrderId_createdAt_idx`(`salesOrderId`, `createdAt`),
    INDEX `SalesOrderItem_productId_idx`(`productId`),
    INDEX `SalesOrderItem_skuId_idx`(`skuId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SalesOrderGiftItem` (
    `id` VARCHAR(191) NOT NULL,
    `salesOrderId` VARCHAR(191) NOT NULL,
    `giftName` VARCHAR(191) NOT NULL,
    `qty` INTEGER NOT NULL DEFAULT 1,
    `remark` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `SalesOrderGiftItem_salesOrderId_createdAt_idx`(`salesOrderId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ShippingExportBatch` (
    `id` VARCHAR(191) NOT NULL,
    `exportNo` VARCHAR(191) NOT NULL,
    `supplierId` VARCHAR(191) NOT NULL,
    `exportedById` VARCHAR(191) NULL,
    `exportedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `orderCount` INTEGER NOT NULL DEFAULT 0,
    `fileName` VARCHAR(191) NOT NULL,
    `fileUrl` VARCHAR(191) NULL,
    `remark` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `ShippingExportBatch_exportNo_key`(`exportNo`),
    INDEX `ShippingExportBatch_supplierId_exportedAt_idx`(`supplierId`, `exportedAt`),
    INDEX `ShippingExportBatch_exportedById_exportedAt_idx`(`exportedById`, `exportedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `LogisticsFollowUpTask` (
    `id` VARCHAR(191) NOT NULL,
    `salesOrderId` VARCHAR(191) NOT NULL,
    `shippingTaskId` VARCHAR(191) NOT NULL,
    `customerId` VARCHAR(191) NOT NULL,
    `ownerId` VARCHAR(191) NOT NULL,
    `status` ENUM('PENDING', 'DONE', 'CANCELED') NOT NULL DEFAULT 'PENDING',
    `intervalDays` INTEGER NOT NULL DEFAULT 2,
    `nextTriggerAt` DATETIME(3) NOT NULL,
    `lastTriggeredAt` DATETIME(3) NULL,
    `lastFollowedUpAt` DATETIME(3) NULL,
    `closedAt` DATETIME(3) NULL,
    `remark` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `LogisticsFollowUpTask_salesOrderId_status_nextTriggerAt_idx`(`salesOrderId`, `status`, `nextTriggerAt`),
    INDEX `LogisticsFollowUpTask_shippingTaskId_status_nextTriggerAt_idx`(`shippingTaskId`, `status`, `nextTriggerAt`),
    INDEX `LogisticsFollowUpTask_customerId_status_nextTriggerAt_idx`(`customerId`, `status`, `nextTriggerAt`),
    INDEX `LogisticsFollowUpTask_ownerId_status_nextTriggerAt_idx`(`ownerId`, `status`, `nextTriggerAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE UNIQUE INDEX `ShippingTask_salesOrderId_key` ON `ShippingTask`(`salesOrderId`);

-- CreateIndex
CREATE INDEX `ShippingTask_supplierId_reportStatus_shippingStatus_createdA_idx` ON `ShippingTask`(`supplierId`, `reportStatus`, `shippingStatus`, `createdAt`);

-- CreateIndex
CREATE INDEX `ShippingTask_exportBatchId_idx` ON `ShippingTask`(`exportBatchId`);

-- AddForeignKey
ALTER TABLE `Supplier` ADD CONSTRAINT `Supplier_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Supplier` ADD CONSTRAINT `Supplier_updatedById_fkey` FOREIGN KEY (`updatedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Product` ADD CONSTRAINT `Product_supplierId_fkey` FOREIGN KEY (`supplierId`) REFERENCES `Supplier`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Product` ADD CONSTRAINT `Product_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Product` ADD CONSTRAINT `Product_updatedById_fkey` FOREIGN KEY (`updatedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProductSku` ADD CONSTRAINT `ProductSku_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `Product`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SalesOrder` ADD CONSTRAINT `SalesOrder_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `Customer`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SalesOrder` ADD CONSTRAINT `SalesOrder_ownerId_fkey` FOREIGN KEY (`ownerId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SalesOrder` ADD CONSTRAINT `SalesOrder_supplierId_fkey` FOREIGN KEY (`supplierId`) REFERENCES `Supplier`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SalesOrder` ADD CONSTRAINT `SalesOrder_reviewerId_fkey` FOREIGN KEY (`reviewerId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SalesOrder` ADD CONSTRAINT `SalesOrder_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SalesOrder` ADD CONSTRAINT `SalesOrder_updatedById_fkey` FOREIGN KEY (`updatedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SalesOrderItem` ADD CONSTRAINT `SalesOrderItem_salesOrderId_fkey` FOREIGN KEY (`salesOrderId`) REFERENCES `SalesOrder`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SalesOrderItem` ADD CONSTRAINT `SalesOrderItem_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `Product`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SalesOrderItem` ADD CONSTRAINT `SalesOrderItem_skuId_fkey` FOREIGN KEY (`skuId`) REFERENCES `ProductSku`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SalesOrderGiftItem` ADD CONSTRAINT `SalesOrderGiftItem_salesOrderId_fkey` FOREIGN KEY (`salesOrderId`) REFERENCES `SalesOrder`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ShippingTask` ADD CONSTRAINT `ShippingTask_salesOrderId_fkey` FOREIGN KEY (`salesOrderId`) REFERENCES `SalesOrder`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ShippingTask` ADD CONSTRAINT `ShippingTask_supplierId_fkey` FOREIGN KEY (`supplierId`) REFERENCES `Supplier`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ShippingTask` ADD CONSTRAINT `ShippingTask_exportBatchId_fkey` FOREIGN KEY (`exportBatchId`) REFERENCES `ShippingExportBatch`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ShippingExportBatch` ADD CONSTRAINT `ShippingExportBatch_supplierId_fkey` FOREIGN KEY (`supplierId`) REFERENCES `Supplier`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ShippingExportBatch` ADD CONSTRAINT `ShippingExportBatch_exportedById_fkey` FOREIGN KEY (`exportedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LogisticsFollowUpTask` ADD CONSTRAINT `LogisticsFollowUpTask_salesOrderId_fkey` FOREIGN KEY (`salesOrderId`) REFERENCES `SalesOrder`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LogisticsFollowUpTask` ADD CONSTRAINT `LogisticsFollowUpTask_shippingTaskId_fkey` FOREIGN KEY (`shippingTaskId`) REFERENCES `ShippingTask`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LogisticsFollowUpTask` ADD CONSTRAINT `LogisticsFollowUpTask_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `Customer`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LogisticsFollowUpTask` ADD CONSTRAINT `LogisticsFollowUpTask_ownerId_fkey` FOREIGN KEY (`ownerId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
