-- AlterTable
ALTER TABLE `logisticsfollowuptask` MODIFY `status` ENUM('PENDING', 'IN_PROGRESS', 'DONE', 'CANCELED') NOT NULL DEFAULT 'PENDING';

-- AlterTable
ALTER TABLE `operationlog` MODIFY `targetType` ENUM('USER', 'TEAM', 'ROLE', 'LEAD', 'LEAD_IMPORT_BATCH', 'LEAD_IMPORT_ROW', 'LEAD_IMPORT_TEMPLATE', 'LEAD_DEDUP_LOG', 'LEAD_CUSTOMER_MERGE_LOG', 'CUSTOMER', 'LEAD_ASSIGNMENT', 'FOLLOW_UP_TASK', 'CALL_RECORD', 'WECHAT_RECORD', 'LIVE_SESSION', 'LIVE_INVITATION', 'ORDER', 'GIFT_RECORD', 'SHIPPING_TASK', 'SUPPLIER', 'PRODUCT', 'PRODUCT_SKU', 'SALES_ORDER', 'SALES_ORDER_ITEM', 'SALES_ORDER_GIFT_ITEM', 'SHIPPING_EXPORT_BATCH', 'LOGISTICS_FOLLOW_UP_TASK', 'COD_COLLECTION_RECORD', 'PAYMENT_PLAN', 'PAYMENT_RECORD', 'COLLECTION_TASK', 'TAG_GROUP', 'TAG_CATEGORY', 'TAG', 'CATEGORY', 'DICTIONARY_TYPE', 'DICTIONARY_ITEM') NOT NULL;

-- CreateTable
CREATE TABLE `CodCollectionRecord` (
    `id` VARCHAR(191) NOT NULL,
    `paymentPlanId` VARCHAR(191) NOT NULL,
    `paymentRecordId` VARCHAR(191) NULL,
    `salesOrderId` VARCHAR(191) NOT NULL,
    `shippingTaskId` VARCHAR(191) NOT NULL,
    `customerId` VARCHAR(191) NOT NULL,
    `ownerId` VARCHAR(191) NULL,
    `status` ENUM('PENDING_COLLECTION', 'COLLECTED', 'EXCEPTION', 'REJECTED', 'UNCOLLECTED') NOT NULL DEFAULT 'PENDING_COLLECTION',
    `expectedAmount` DECIMAL(10, 2) NOT NULL,
    `collectedAmount` DECIMAL(10, 2) NOT NULL DEFAULT 0,
    `occurredAt` DATETIME(3) NULL,
    `remark` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `CodCollectionRecord_paymentPlanId_key`(`paymentPlanId`),
    UNIQUE INDEX `CodCollectionRecord_paymentRecordId_key`(`paymentRecordId`),
    INDEX `CodCollectionRecord_salesOrderId_status_createdAt_idx`(`salesOrderId`, `status`, `createdAt`),
    INDEX `CodCollectionRecord_shippingTaskId_status_createdAt_idx`(`shippingTaskId`, `status`, `createdAt`),
    INDEX `CodCollectionRecord_customerId_status_createdAt_idx`(`customerId`, `status`, `createdAt`),
    INDEX `CodCollectionRecord_ownerId_status_createdAt_idx`(`ownerId`, `status`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `CodCollectionRecord` ADD CONSTRAINT `CodCollectionRecord_paymentPlanId_fkey` FOREIGN KEY (`paymentPlanId`) REFERENCES `PaymentPlan`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CodCollectionRecord` ADD CONSTRAINT `CodCollectionRecord_paymentRecordId_fkey` FOREIGN KEY (`paymentRecordId`) REFERENCES `PaymentRecord`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CodCollectionRecord` ADD CONSTRAINT `CodCollectionRecord_salesOrderId_fkey` FOREIGN KEY (`salesOrderId`) REFERENCES `SalesOrder`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CodCollectionRecord` ADD CONSTRAINT `CodCollectionRecord_shippingTaskId_fkey` FOREIGN KEY (`shippingTaskId`) REFERENCES `ShippingTask`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CodCollectionRecord` ADD CONSTRAINT `CodCollectionRecord_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `Customer`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CodCollectionRecord` ADD CONSTRAINT `CodCollectionRecord_ownerId_fkey` FOREIGN KEY (`ownerId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
