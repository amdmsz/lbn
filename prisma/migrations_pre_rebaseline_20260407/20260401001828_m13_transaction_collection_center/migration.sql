-- AlterTable
ALTER TABLE `operationlog` MODIFY `module` ENUM('USER', 'TEAM', 'ROLE', 'LEAD', 'LEAD_IMPORT', 'CUSTOMER', 'ASSIGNMENT', 'FOLLOW_UP', 'CALL', 'WECHAT', 'LIVE_SESSION', 'ORDER', 'GIFT', 'SHIPPING', 'SUPPLIER', 'PRODUCT', 'SALES_ORDER', 'SHIPPING_EXPORT', 'LOGISTICS', 'PAYMENT', 'COLLECTION', 'MASTER_DATA', 'SYSTEM') NOT NULL,
    MODIFY `targetType` ENUM('USER', 'TEAM', 'ROLE', 'LEAD', 'LEAD_IMPORT_BATCH', 'LEAD_IMPORT_ROW', 'LEAD_IMPORT_TEMPLATE', 'LEAD_DEDUP_LOG', 'LEAD_CUSTOMER_MERGE_LOG', 'CUSTOMER', 'LEAD_ASSIGNMENT', 'FOLLOW_UP_TASK', 'CALL_RECORD', 'WECHAT_RECORD', 'LIVE_SESSION', 'LIVE_INVITATION', 'ORDER', 'GIFT_RECORD', 'SHIPPING_TASK', 'SUPPLIER', 'PRODUCT', 'PRODUCT_SKU', 'SALES_ORDER', 'SALES_ORDER_ITEM', 'SALES_ORDER_GIFT_ITEM', 'SHIPPING_EXPORT_BATCH', 'LOGISTICS_FOLLOW_UP_TASK', 'PAYMENT_PLAN', 'PAYMENT_RECORD', 'COLLECTION_TASK', 'TAG_GROUP', 'TAG_CATEGORY', 'TAG', 'CATEGORY', 'DICTIONARY_TYPE', 'DICTIONARY_ITEM') NOT NULL;

-- CreateTable
CREATE TABLE `PaymentPlan` (
    `id` VARCHAR(191) NOT NULL,
    `sourceType` ENUM('SALES_ORDER', 'GIFT_RECORD') NOT NULL,
    `salesOrderId` VARCHAR(191) NULL,
    `giftRecordId` VARCHAR(191) NULL,
    `shippingTaskId` VARCHAR(191) NULL,
    `customerId` VARCHAR(191) NULL,
    `ownerId` VARCHAR(191) NULL,
    `subjectType` ENUM('GOODS', 'FREIGHT') NOT NULL,
    `stageType` ENUM('FULL', 'DEPOSIT', 'BALANCE') NOT NULL,
    `collectionChannel` ENUM('PREPAID', 'COD') NOT NULL,
    `plannedAmount` DECIMAL(10, 2) NOT NULL,
    `submittedAmount` DECIMAL(10, 2) NOT NULL DEFAULT 0,
    `confirmedAmount` DECIMAL(10, 2) NOT NULL DEFAULT 0,
    `remainingAmount` DECIMAL(10, 2) NOT NULL,
    `dueAt` DATETIME(3) NULL,
    `status` ENUM('PENDING', 'SUBMITTED', 'PARTIALLY_COLLECTED', 'COLLECTED', 'CANCELED') NOT NULL DEFAULT 'PENDING',
    `sequence` INTEGER NOT NULL DEFAULT 1,
    `remark` TEXT NULL,
    `createdById` VARCHAR(191) NULL,
    `updatedById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `PaymentPlan_sourceType_createdAt_idx`(`sourceType`, `createdAt`),
    INDEX `PaymentPlan_salesOrderId_status_dueAt_idx`(`salesOrderId`, `status`, `dueAt`),
    INDEX `PaymentPlan_giftRecordId_status_dueAt_idx`(`giftRecordId`, `status`, `dueAt`),
    INDEX `PaymentPlan_shippingTaskId_status_dueAt_idx`(`shippingTaskId`, `status`, `dueAt`),
    INDEX `PaymentPlan_customerId_status_dueAt_idx`(`customerId`, `status`, `dueAt`),
    INDEX `PaymentPlan_ownerId_status_dueAt_idx`(`ownerId`, `status`, `dueAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PaymentRecord` (
    `id` VARCHAR(191) NOT NULL,
    `paymentPlanId` VARCHAR(191) NOT NULL,
    `sourceType` ENUM('SALES_ORDER', 'GIFT_RECORD') NOT NULL,
    `salesOrderId` VARCHAR(191) NULL,
    `giftRecordId` VARCHAR(191) NULL,
    `shippingTaskId` VARCHAR(191) NULL,
    `customerId` VARCHAR(191) NULL,
    `ownerId` VARCHAR(191) NULL,
    `amount` DECIMAL(10, 2) NOT NULL,
    `channel` ENUM('ORDER_FORM_DECLARED', 'BANK_TRANSFER', 'WECHAT_TRANSFER', 'ALIPAY_TRANSFER', 'COD', 'CASH', 'OTHER') NOT NULL,
    `status` ENUM('SUBMITTED', 'CONFIRMED', 'REJECTED') NOT NULL DEFAULT 'SUBMITTED',
    `occurredAt` DATETIME(3) NOT NULL,
    `submittedById` VARCHAR(191) NOT NULL,
    `confirmedById` VARCHAR(191) NULL,
    `confirmedAt` DATETIME(3) NULL,
    `referenceNo` VARCHAR(191) NULL,
    `remark` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `PaymentRecord_paymentPlanId_status_occurredAt_idx`(`paymentPlanId`, `status`, `occurredAt`),
    INDEX `PaymentRecord_sourceType_occurredAt_idx`(`sourceType`, `occurredAt`),
    INDEX `PaymentRecord_salesOrderId_status_occurredAt_idx`(`salesOrderId`, `status`, `occurredAt`),
    INDEX `PaymentRecord_giftRecordId_status_occurredAt_idx`(`giftRecordId`, `status`, `occurredAt`),
    INDEX `PaymentRecord_shippingTaskId_status_occurredAt_idx`(`shippingTaskId`, `status`, `occurredAt`),
    INDEX `PaymentRecord_customerId_status_occurredAt_idx`(`customerId`, `status`, `occurredAt`),
    INDEX `PaymentRecord_ownerId_status_occurredAt_idx`(`ownerId`, `status`, `occurredAt`),
    INDEX `PaymentRecord_submittedById_status_occurredAt_idx`(`submittedById`, `status`, `occurredAt`),
    INDEX `PaymentRecord_confirmedById_status_occurredAt_idx`(`confirmedById`, `status`, `occurredAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CollectionTask` (
    `id` VARCHAR(191) NOT NULL,
    `paymentPlanId` VARCHAR(191) NOT NULL,
    `sourceType` ENUM('SALES_ORDER', 'GIFT_RECORD') NOT NULL,
    `salesOrderId` VARCHAR(191) NULL,
    `giftRecordId` VARCHAR(191) NULL,
    `shippingTaskId` VARCHAR(191) NULL,
    `customerId` VARCHAR(191) NOT NULL,
    `ownerId` VARCHAR(191) NOT NULL,
    `taskType` ENUM('BALANCE_COLLECTION', 'COD_COLLECTION', 'FREIGHT_COLLECTION', 'GENERAL_COLLECTION') NOT NULL,
    `status` ENUM('PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELED') NOT NULL DEFAULT 'PENDING',
    `dueAt` DATETIME(3) NULL,
    `nextFollowUpAt` DATETIME(3) NULL,
    `lastContactAt` DATETIME(3) NULL,
    `closedAt` DATETIME(3) NULL,
    `remark` TEXT NULL,
    `createdById` VARCHAR(191) NULL,
    `updatedById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `CollectionTask_paymentPlanId_status_dueAt_idx`(`paymentPlanId`, `status`, `dueAt`),
    INDEX `CollectionTask_sourceType_status_dueAt_idx`(`sourceType`, `status`, `dueAt`),
    INDEX `CollectionTask_salesOrderId_status_dueAt_idx`(`salesOrderId`, `status`, `dueAt`),
    INDEX `CollectionTask_giftRecordId_status_dueAt_idx`(`giftRecordId`, `status`, `dueAt`),
    INDEX `CollectionTask_shippingTaskId_status_dueAt_idx`(`shippingTaskId`, `status`, `dueAt`),
    INDEX `CollectionTask_customerId_status_dueAt_idx`(`customerId`, `status`, `dueAt`),
    INDEX `CollectionTask_ownerId_status_dueAt_idx`(`ownerId`, `status`, `dueAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `PaymentPlan` ADD CONSTRAINT `PaymentPlan_salesOrderId_fkey` FOREIGN KEY (`salesOrderId`) REFERENCES `SalesOrder`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PaymentPlan` ADD CONSTRAINT `PaymentPlan_giftRecordId_fkey` FOREIGN KEY (`giftRecordId`) REFERENCES `GiftRecord`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PaymentPlan` ADD CONSTRAINT `PaymentPlan_shippingTaskId_fkey` FOREIGN KEY (`shippingTaskId`) REFERENCES `ShippingTask`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PaymentPlan` ADD CONSTRAINT `PaymentPlan_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `Customer`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PaymentPlan` ADD CONSTRAINT `PaymentPlan_ownerId_fkey` FOREIGN KEY (`ownerId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PaymentPlan` ADD CONSTRAINT `PaymentPlan_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PaymentPlan` ADD CONSTRAINT `PaymentPlan_updatedById_fkey` FOREIGN KEY (`updatedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PaymentRecord` ADD CONSTRAINT `PaymentRecord_paymentPlanId_fkey` FOREIGN KEY (`paymentPlanId`) REFERENCES `PaymentPlan`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PaymentRecord` ADD CONSTRAINT `PaymentRecord_salesOrderId_fkey` FOREIGN KEY (`salesOrderId`) REFERENCES `SalesOrder`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PaymentRecord` ADD CONSTRAINT `PaymentRecord_giftRecordId_fkey` FOREIGN KEY (`giftRecordId`) REFERENCES `GiftRecord`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PaymentRecord` ADD CONSTRAINT `PaymentRecord_shippingTaskId_fkey` FOREIGN KEY (`shippingTaskId`) REFERENCES `ShippingTask`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PaymentRecord` ADD CONSTRAINT `PaymentRecord_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `Customer`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PaymentRecord` ADD CONSTRAINT `PaymentRecord_ownerId_fkey` FOREIGN KEY (`ownerId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PaymentRecord` ADD CONSTRAINT `PaymentRecord_submittedById_fkey` FOREIGN KEY (`submittedById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PaymentRecord` ADD CONSTRAINT `PaymentRecord_confirmedById_fkey` FOREIGN KEY (`confirmedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CollectionTask` ADD CONSTRAINT `CollectionTask_paymentPlanId_fkey` FOREIGN KEY (`paymentPlanId`) REFERENCES `PaymentPlan`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CollectionTask` ADD CONSTRAINT `CollectionTask_salesOrderId_fkey` FOREIGN KEY (`salesOrderId`) REFERENCES `SalesOrder`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CollectionTask` ADD CONSTRAINT `CollectionTask_giftRecordId_fkey` FOREIGN KEY (`giftRecordId`) REFERENCES `GiftRecord`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CollectionTask` ADD CONSTRAINT `CollectionTask_shippingTaskId_fkey` FOREIGN KEY (`shippingTaskId`) REFERENCES `ShippingTask`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CollectionTask` ADD CONSTRAINT `CollectionTask_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `Customer`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CollectionTask` ADD CONSTRAINT `CollectionTask_ownerId_fkey` FOREIGN KEY (`ownerId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CollectionTask` ADD CONSTRAINT `CollectionTask_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CollectionTask` ADD CONSTRAINT `CollectionTask_updatedById_fkey` FOREIGN KEY (`updatedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
