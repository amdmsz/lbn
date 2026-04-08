-- Phase 1 safe indexes and staged uniqueness.
-- The one-sub-order-per-supplier rule is a migration-safe Phase 1 constraint, not a permanent future guarantee.

-- CreateIndex
CREATE INDEX `ProductBundle_status_enabled_createdAt_idx`
    ON `ProductBundle`(`status`, `enabled`, `createdAt`);

-- CreateIndex
CREATE INDEX `ProductBundleItem_bundleId_sortOrder_idx`
    ON `ProductBundleItem`(`bundleId`, `sortOrder`);

-- CreateIndex
CREATE INDEX `TradeOrder_customerId_createdAt_idx`
    ON `TradeOrder`(`customerId`, `createdAt`);

-- CreateIndex
CREATE INDEX `TradeOrder_ownerId_reviewStatus_createdAt_idx`
    ON `TradeOrder`(`ownerId`, `reviewStatus`, `createdAt`);

-- CreateIndex
CREATE INDEX `TradeOrder_reviewStatus_tradeStatus_createdAt_idx`
    ON `TradeOrder`(`reviewStatus`, `tradeStatus`, `createdAt`);

-- CreateIndex
CREATE INDEX `TradeOrderItem_tradeOrderId_itemType_createdAt_idx`
    ON `TradeOrderItem`(`tradeOrderId`, `itemType`, `createdAt`);

-- CreateIndex
CREATE INDEX `TradeOrderItem_bundleId_idx`
    ON `TradeOrderItem`(`bundleId`);

-- CreateIndex
CREATE INDEX `TradeOrderItemComponent_tradeOrderId_supplierId_createdAt_idx`
    ON `TradeOrderItemComponent`(`tradeOrderId`, `supplierId`, `createdAt`);

-- CreateIndex
CREATE INDEX `salesorder_tradeOrderId_createdAt_idx`
    ON `salesorder`(`tradeOrderId`, `createdAt`);

-- CreateIndex
CREATE UNIQUE INDEX `salesorder_tradeOrderId_supplierId_key`
    ON `salesorder`(`tradeOrderId`, `supplierId`);

-- CreateIndex
CREATE INDEX `salesorderitem_tradeOrderId_salesOrderId_idx`
    ON `salesorderitem`(`tradeOrderId`, `salesOrderId`);

-- CreateIndex
CREATE INDEX `salesorderitem_tradeOrderItemId_idx`
    ON `salesorderitem`(`tradeOrderItemId`);

-- CreateIndex
CREATE INDEX `salesorderitem_tradeOrderItemComponentId_idx`
    ON `salesorderitem`(`tradeOrderItemComponentId`);

-- CreateIndex
CREATE INDEX `shiptask_trade_scope_idx`
    ON `shippingtask`(`tradeOrderId`, `supplierId`, `reportStatus`, `shippingStatus`, `createdAt`);

-- CreateIndex
CREATE INDEX `ShippingExportLine_shippingTaskId_idx`
    ON `ShippingExportLine`(`shippingTaskId`);

-- CreateIndex
CREATE INDEX `ShippingExportLine_tradeOrderId_salesOrderId_idx`
    ON `ShippingExportLine`(`tradeOrderId`, `salesOrderId`);

-- CreateIndex
CREATE INDEX `lgfollow_trade_sales_next_idx`
    ON `logisticsfollowuptask`(`tradeOrderId`, `salesOrderId`, `status`, `nextTriggerAt`);

-- CreateIndex
CREATE INDEX `lgfollow_trade_ship_next_idx`
    ON `logisticsfollowuptask`(`tradeOrderId`, `shippingTaskId`, `status`, `nextTriggerAt`);

-- CreateIndex
CREATE INDEX `codrec_trade_sales_created_idx`
    ON `codcollectionrecord`(`tradeOrderId`, `salesOrderId`, `status`, `createdAt`);

-- CreateIndex
CREATE INDEX `codrec_trade_ship_created_idx`
    ON `codcollectionrecord`(`tradeOrderId`, `shippingTaskId`, `status`, `createdAt`);

-- CreateIndex
CREATE INDEX `payplan_trade_source_due_idx`
    ON `paymentplan`(`tradeOrderId`, `sourceType`, `status`, `dueAt`);

-- CreateIndex
CREATE INDEX `payplan_trade_sales_due_idx`
    ON `paymentplan`(`tradeOrderId`, `salesOrderId`, `status`, `dueAt`);

-- CreateIndex
CREATE INDEX `payrec_trade_source_occ_idx`
    ON `paymentrecord`(`tradeOrderId`, `sourceType`, `status`, `occurredAt`);

-- CreateIndex
CREATE INDEX `payrec_trade_sales_occ_idx`
    ON `paymentrecord`(`tradeOrderId`, `salesOrderId`, `status`, `occurredAt`);

-- CreateIndex
CREATE INDEX `coltask_trade_source_due_idx`
    ON `collectiontask`(`tradeOrderId`, `sourceType`, `status`, `dueAt`);

-- CreateIndex
CREATE INDEX `coltask_trade_sales_due_idx`
    ON `collectiontask`(`tradeOrderId`, `salesOrderId`, `status`, `dueAt`);
