-- Phase C 退货链路 schema:
-- 1) 2 个 enum: ShippingReturnStatus (6 状态) + ShippingReturnReason (6 原因)
-- 2) 1 个新表 ShippingReturn (含 FK 到 TradeOrder/ShippingTask/Customer/User/
--    RevisionRequest/RefundRequest)
--
-- 业务流程:
--   销售/主管发起 → 主管复审 → 发货人填运单 → 物流跟踪 → 入库 →
--   自动触发 RefundRequest → 财务审批 + 出账 (复用 Phase B 链路)

-- Step 1: ShippingReturn 表
CREATE TABLE `shippingreturn` (
  `id` VARCHAR(191) NOT NULL,
  `tradeOrderId` VARCHAR(191) NOT NULL,
  `shippingTaskId` VARCHAR(191) NOT NULL,
  `customerId` VARCHAR(191) NOT NULL,
  `revisionRequestId` VARCHAR(191) NULL,
  `refundRequestId` VARCHAR(191) NULL,
  `status` ENUM('PENDING_REVIEW', 'PENDING_RETURN_TRACKING', 'IN_RETURN_TRANSIT', 'RETURNED_TO_WAREHOUSE', 'REJECTED', 'CANCELED') NOT NULL DEFAULT 'PENDING_REVIEW',
  `reason` ENUM('CUSTOMER_REJECT', 'QUALITY_ISSUE', 'WRONG_ITEM', 'DELIVERY_TIMEOUT', 'ADDRESS_PROBLEM', 'OTHER') NOT NULL,
  `reasonDetail` TEXT NOT NULL,
  `requesterId` VARCHAR(191) NOT NULL,
  `requestedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `reviewerId` VARCHAR(191) NULL,
  `reviewedAt` DATETIME(3) NULL,
  `reviewNote` TEXT NULL,
  `rejectReason` TEXT NULL,
  `returnTrackingNumber` VARCHAR(191) NULL,
  `returnCarrier` VARCHAR(191) NULL,
  `trackingFilledById` VARCHAR(191) NULL,
  `trackingFilledAt` DATETIME(3) NULL,
  `receivedAt` DATETIME(3) NULL,
  `receivedById` VARCHAR(191) NULL,
  `receivedPhotoUrl` TEXT NULL,
  `receivedRemark` TEXT NULL,
  `expectedRefundAmount` DECIMAL(10, 2) NOT NULL DEFAULT 0,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  UNIQUE INDEX `shippingreturn_refundRequestId_key` (`refundRequestId`),
  INDEX `shippingreturn_tradeOrderId_idx` (`tradeOrderId`),
  INDEX `shippingreturn_shippingTaskId_idx` (`shippingTaskId`),
  INDEX `shippingreturn_customerId_idx` (`customerId`),
  INDEX `shippingreturn_status_requestedAt_idx` (`status`, `requestedAt`),
  INDEX `shippingreturn_reviewerId_idx` (`reviewerId`),
  INDEX `shippingreturn_requesterId_idx` (`requesterId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `shippingreturn`
  ADD CONSTRAINT `shippingreturn_tradeOrderId_fkey`
  FOREIGN KEY (`tradeOrderId`) REFERENCES `tradeorder`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `shippingreturn`
  ADD CONSTRAINT `shippingreturn_shippingTaskId_fkey`
  FOREIGN KEY (`shippingTaskId`) REFERENCES `shippingtask`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `shippingreturn`
  ADD CONSTRAINT `shippingreturn_customerId_fkey`
  FOREIGN KEY (`customerId`) REFERENCES `customer`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `shippingreturn`
  ADD CONSTRAINT `shippingreturn_revisionRequestId_fkey`
  FOREIGN KEY (`revisionRequestId`) REFERENCES `tradeorderrevisionrequest`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `shippingreturn`
  ADD CONSTRAINT `shippingreturn_refundRequestId_fkey`
  FOREIGN KEY (`refundRequestId`) REFERENCES `refundrequest`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `shippingreturn`
  ADD CONSTRAINT `shippingreturn_requesterId_fkey`
  FOREIGN KEY (`requesterId`) REFERENCES `user`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `shippingreturn`
  ADD CONSTRAINT `shippingreturn_reviewerId_fkey`
  FOREIGN KEY (`reviewerId`) REFERENCES `user`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `shippingreturn`
  ADD CONSTRAINT `shippingreturn_trackingFilledById_fkey`
  FOREIGN KEY (`trackingFilledById`) REFERENCES `user`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `shippingreturn`
  ADD CONSTRAINT `shippingreturn_receivedById_fkey`
  FOREIGN KEY (`receivedById`) REFERENCES `user`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
