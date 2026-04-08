-- Phase 1 scaffold: additive parent trade-order layer, bundle master data, and export snapshot anchors.

-- Alter enum
ALTER TABLE `operationlog`
    MODIFY `targetType` ENUM(
        'USER',
        'TEAM',
        'ROLE',
        'LEAD',
        'LEAD_IMPORT_BATCH',
        'LEAD_IMPORT_ROW',
        'LEAD_IMPORT_TEMPLATE',
        'LEAD_DEDUP_LOG',
        'LEAD_CUSTOMER_MERGE_LOG',
        'CUSTOMER',
        'LEAD_ASSIGNMENT',
        'FOLLOW_UP_TASK',
        'CALL_RECORD',
        'WECHAT_RECORD',
        'LIVE_SESSION',
        'LIVE_INVITATION',
        'ORDER',
        'GIFT_RECORD',
        'SHIPPING_TASK',
        'SUPPLIER',
        'PRODUCT',
        'PRODUCT_SKU',
        'SALES_ORDER',
        'SALES_ORDER_ITEM',
        'SALES_ORDER_GIFT_ITEM',
        'TRADE_ORDER',
        'TRADE_ORDER_ITEM',
        'TRADE_ORDER_ITEM_COMPONENT',
        'PRODUCT_BUNDLE',
        'PRODUCT_BUNDLE_ITEM',
        'SHIPPING_EXPORT_BATCH',
        'SHIPPING_EXPORT_LINE',
        'LOGISTICS_FOLLOW_UP_TASK',
        'COD_COLLECTION_RECORD',
        'PAYMENT_PLAN',
        'PAYMENT_RECORD',
        'COLLECTION_TASK',
        'TAG_GROUP',
        'TAG_CATEGORY',
        'TAG',
        'CATEGORY',
        'DICTIONARY_TYPE',
        'DICTIONARY_ITEM'
    ) NOT NULL;

-- CreateTable
CREATE TABLE `ProductBundle` (
    `id` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `bundleType` ENUM('STANDARD', 'LIVE_SESSION', 'CAMPAIGN') NOT NULL DEFAULT 'STANDARD',
    `status` ENUM('DRAFT', 'ACTIVE', 'INACTIVE', 'ARCHIVED') NOT NULL DEFAULT 'DRAFT',
    `enabled` BOOLEAN NOT NULL DEFAULT true,
    `description` TEXT NULL,
    `defaultBundlePrice` DECIMAL(10, 2) NULL,
    `version` INTEGER NOT NULL DEFAULT 1,
    `createdById` VARCHAR(191) NULL,
    `updatedById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `ProductBundle_code_key`(`code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ProductBundleItem` (
    `id` VARCHAR(191) NOT NULL,
    `bundleId` VARCHAR(191) NOT NULL,
    `lineNo` INTEGER NOT NULL,
    `supplierId` VARCHAR(191) NOT NULL,
    `productId` VARCHAR(191) NOT NULL,
    `skuId` VARCHAR(191) NOT NULL,
    `qty` INTEGER NOT NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `enabled` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `ProductBundleItem_bundleId_lineNo_key`(`bundleId`, `lineNo`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `TradeOrder` (
    `id` VARCHAR(191) NOT NULL,
    `tradeNo` VARCHAR(191) NOT NULL,
    `customerId` VARCHAR(191) NOT NULL,
    `ownerId` VARCHAR(191) NULL,
    `reviewStatus` ENUM('PENDING_REVIEW', 'APPROVED', 'REJECTED') NOT NULL DEFAULT 'PENDING_REVIEW',
    `tradeStatus` ENUM('DRAFT', 'PENDING_REVIEW', 'APPROVED', 'REJECTED', 'CANCELED') NOT NULL DEFAULT 'DRAFT',
    `paymentScheme` ENUM('FULL_PREPAID', 'DEPOSIT_PLUS_BALANCE', 'FULL_COD', 'DEPOSIT_PLUS_COD') NOT NULL DEFAULT 'FULL_PREPAID',
    `listAmount` DECIMAL(10, 2) NOT NULL DEFAULT 0,
    `dealAmount` DECIMAL(10, 2) NOT NULL DEFAULT 0,
    `goodsAmount` DECIMAL(10, 2) NOT NULL DEFAULT 0,
    `discountAmount` DECIMAL(10, 2) NOT NULL DEFAULT 0,
    `finalAmount` DECIMAL(10, 2) NOT NULL DEFAULT 0,
    `depositAmount` DECIMAL(10, 2) NOT NULL DEFAULT 0,
    `collectedAmount` DECIMAL(10, 2) NOT NULL DEFAULT 0,
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

    UNIQUE INDEX `TradeOrder_tradeNo_key`(`tradeNo`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `TradeOrderItem` (
    `id` VARCHAR(191) NOT NULL,
    `tradeOrderId` VARCHAR(191) NOT NULL,
    `lineNo` INTEGER NOT NULL,
    `itemType` ENUM('SKU', 'BUNDLE', 'GIFT') NOT NULL,
    `itemSourceType` ENUM('DIRECT_SKU', 'BUNDLE_SALE', 'MANUAL_GIFT', 'LIVE_SESSION_PRODUCT') NOT NULL,
    `productId` VARCHAR(191) NULL,
    `skuId` VARCHAR(191) NULL,
    `bundleId` VARCHAR(191) NULL,
    `titleSnapshot` VARCHAR(191) NOT NULL,
    `productNameSnapshot` VARCHAR(191) NULL,
    `skuNameSnapshot` VARCHAR(191) NULL,
    `specSnapshot` VARCHAR(191) NULL,
    `unitSnapshot` VARCHAR(191) NULL,
    `bundleCodeSnapshot` VARCHAR(191) NULL,
    `bundleNameSnapshot` VARCHAR(191) NULL,
    `bundleVersionSnapshot` INTEGER NULL,
    `listUnitPriceSnapshot` DECIMAL(10, 2) NOT NULL DEFAULT 0,
    `dealUnitPriceSnapshot` DECIMAL(10, 2) NOT NULL DEFAULT 0,
    `qty` INTEGER NOT NULL,
    `subtotal` DECIMAL(10, 2) NOT NULL DEFAULT 0,
    `discountAmount` DECIMAL(10, 2) NOT NULL DEFAULT 0,
    `remark` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `TradeOrderItem_tradeOrderId_lineNo_key`(`tradeOrderId`, `lineNo`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `TradeOrderItemComponent` (
    `id` VARCHAR(191) NOT NULL,
    `tradeOrderId` VARCHAR(191) NOT NULL,
    `tradeOrderItemId` VARCHAR(191) NOT NULL,
    `componentSeq` INTEGER NOT NULL,
    `componentType` ENUM('GOODS', 'GIFT') NOT NULL,
    `componentSourceType` ENUM('DIRECT_SKU', 'BUNDLE_COMPONENT', 'GIFT_COMPONENT') NOT NULL,
    `supplierId` VARCHAR(191) NOT NULL,
    `productId` VARCHAR(191) NULL,
    `skuId` VARCHAR(191) NULL,
    `supplierNameSnapshot` VARCHAR(191) NOT NULL,
    `productNameSnapshot` VARCHAR(191) NOT NULL,
    `skuNameSnapshot` VARCHAR(191) NULL,
    `specSnapshot` VARCHAR(191) NULL,
    `unitSnapshot` VARCHAR(191) NULL,
    `exportDisplayNameSnapshot` VARCHAR(191) NOT NULL,
    `qty` INTEGER NOT NULL,
    `allocatedListUnitPriceSnapshot` DECIMAL(10, 2) NOT NULL DEFAULT 0,
    `allocatedDealUnitPriceSnapshot` DECIMAL(10, 2) NOT NULL DEFAULT 0,
    `allocatedSubtotal` DECIMAL(10, 2) NOT NULL DEFAULT 0,
    `allocatedDiscountAmount` DECIMAL(10, 2) NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `TradeOrderItemComponent_tradeOrderItemId_componentSeq_key`(`tradeOrderItemId`, `componentSeq`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ShippingExportLine` (
    `id` VARCHAR(191) NOT NULL,
    `exportBatchId` VARCHAR(191) NOT NULL,
    `rowNo` INTEGER NOT NULL,
    `tradeOrderId` VARCHAR(191) NOT NULL,
    `salesOrderId` VARCHAR(191) NOT NULL,
    `shippingTaskId` VARCHAR(191) NULL,
    `supplierId` VARCHAR(191) NOT NULL,
    `tradeNoSnapshot` VARCHAR(191) NOT NULL,
    `subOrderNoSnapshot` VARCHAR(191) NOT NULL,
    `receiverNameSnapshot` VARCHAR(191) NOT NULL,
    `receiverPhoneSnapshot` VARCHAR(191) NOT NULL,
    `receiverAddressSnapshot` TEXT NOT NULL,
    `productSummarySnapshot` TEXT NOT NULL,
    `pieceCountSnapshot` INTEGER NOT NULL,
    `codAmountSnapshot` DECIMAL(10, 2) NOT NULL DEFAULT 0,
    `insuranceRequiredSnapshot` BOOLEAN NOT NULL DEFAULT false,
    `insuranceAmountSnapshot` DECIMAL(10, 2) NOT NULL DEFAULT 0,
    `remarkSnapshot` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `ShippingExportLine_exportBatchId_rowNo_key`(`exportBatchId`, `rowNo`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AlterTable
ALTER TABLE `salesorder`
    ADD COLUMN `tradeOrderId` VARCHAR(191) NULL,
    ADD COLUMN `subOrderNo` VARCHAR(191) NULL,
    ADD COLUMN `supplierSequence` INTEGER NULL,
    ADD COLUMN `subOrderStatus` ENUM('PENDING_PARENT_REVIEW', 'READY_FOR_FULFILLMENT', 'IN_FULFILLMENT', 'COMPLETED', 'CANCELED') NULL;

-- AlterTable
ALTER TABLE `salesorderitem`
    ADD COLUMN `tradeOrderId` VARCHAR(191) NULL,
    ADD COLUMN `tradeOrderItemId` VARCHAR(191) NULL,
    ADD COLUMN `tradeOrderItemComponentId` VARCHAR(191) NULL,
    ADD COLUMN `lineNo` INTEGER NULL,
    ADD COLUMN `itemTypeSnapshot` ENUM('SKU', 'BUNDLE', 'GIFT') NULL,
    ADD COLUMN `titleSnapshot` VARCHAR(191) NULL,
    ADD COLUMN `exportDisplayNameSnapshot` VARCHAR(191) NULL,
    ADD COLUMN `discountAmount` DECIMAL(10, 2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE `shippingtask`
    ADD COLUMN `tradeOrderId` VARCHAR(191) NULL,
    ADD COLUMN `receiverNameSnapshot` VARCHAR(191) NULL,
    ADD COLUMN `receiverPhoneSnapshot` VARCHAR(191) NULL,
    ADD COLUMN `receiverAddressSnapshot` TEXT NULL;

-- AlterTable
ALTER TABLE `shippingexportbatch`
    ADD COLUMN `subOrderCount` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `tradeOrderCount` INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE `logisticsfollowuptask`
    ADD COLUMN `tradeOrderId` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `codcollectionrecord`
    ADD COLUMN `tradeOrderId` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `paymentplan`
    ADD COLUMN `tradeOrderId` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `paymentrecord`
    ADD COLUMN `tradeOrderId` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `collectiontask`
    ADD COLUMN `tradeOrderId` VARCHAR(191) NULL;

-- AddForeignKey
ALTER TABLE `ProductBundleItem` ADD CONSTRAINT `ProductBundleItem_bundleId_fkey`
    FOREIGN KEY (`bundleId`) REFERENCES `ProductBundle`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TradeOrder` ADD CONSTRAINT `TradeOrder_customerId_fkey`
    FOREIGN KEY (`customerId`) REFERENCES `customer`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TradeOrderItem` ADD CONSTRAINT `TradeOrderItem_tradeOrderId_fkey`
    FOREIGN KEY (`tradeOrderId`) REFERENCES `TradeOrder`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TradeOrderItem` ADD CONSTRAINT `TradeOrderItem_bundleId_fkey`
    FOREIGN KEY (`bundleId`) REFERENCES `ProductBundle`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TradeOrderItemComponent` ADD CONSTRAINT `TradeOrderItemComponent_tradeOrderId_fkey`
    FOREIGN KEY (`tradeOrderId`) REFERENCES `TradeOrder`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TradeOrderItemComponent` ADD CONSTRAINT `TradeOrderItemComponent_tradeOrderItemId_fkey`
    FOREIGN KEY (`tradeOrderItemId`) REFERENCES `TradeOrderItem`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `salesorder` ADD CONSTRAINT `salesorder_tradeOrderId_fkey`
    FOREIGN KEY (`tradeOrderId`) REFERENCES `TradeOrder`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `salesorderitem` ADD CONSTRAINT `salesorderitem_tradeOrderId_fkey`
    FOREIGN KEY (`tradeOrderId`) REFERENCES `TradeOrder`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `salesorderitem` ADD CONSTRAINT `salesorderitem_tradeOrderItemId_fkey`
    FOREIGN KEY (`tradeOrderItemId`) REFERENCES `TradeOrderItem`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `salesorderitem` ADD CONSTRAINT `salesorderitem_tradeOrderItemComponentId_fkey`
    FOREIGN KEY (`tradeOrderItemComponentId`) REFERENCES `TradeOrderItemComponent`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `shippingtask` ADD CONSTRAINT `shippingtask_tradeOrderId_fkey`
    FOREIGN KEY (`tradeOrderId`) REFERENCES `TradeOrder`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ShippingExportLine` ADD CONSTRAINT `ShippingExportLine_exportBatchId_fkey`
    FOREIGN KEY (`exportBatchId`) REFERENCES `shippingexportbatch`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ShippingExportLine` ADD CONSTRAINT `ShippingExportLine_tradeOrderId_fkey`
    FOREIGN KEY (`tradeOrderId`) REFERENCES `TradeOrder`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ShippingExportLine` ADD CONSTRAINT `ShippingExportLine_salesOrderId_fkey`
    FOREIGN KEY (`salesOrderId`) REFERENCES `salesorder`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ShippingExportLine` ADD CONSTRAINT `ShippingExportLine_shippingTaskId_fkey`
    FOREIGN KEY (`shippingTaskId`) REFERENCES `shippingtask`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `logisticsfollowuptask` ADD CONSTRAINT `logisticsfollowuptask_tradeOrderId_fkey`
    FOREIGN KEY (`tradeOrderId`) REFERENCES `TradeOrder`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `codcollectionrecord` ADD CONSTRAINT `codcollectionrecord_tradeOrderId_fkey`
    FOREIGN KEY (`tradeOrderId`) REFERENCES `TradeOrder`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `paymentplan` ADD CONSTRAINT `paymentplan_tradeOrderId_fkey`
    FOREIGN KEY (`tradeOrderId`) REFERENCES `TradeOrder`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `paymentrecord` ADD CONSTRAINT `paymentrecord_tradeOrderId_fkey`
    FOREIGN KEY (`tradeOrderId`) REFERENCES `TradeOrder`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `collectiontask` ADD CONSTRAINT `collectiontask_tradeOrderId_fkey`
    FOREIGN KEY (`tradeOrderId`) REFERENCES `TradeOrder`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
