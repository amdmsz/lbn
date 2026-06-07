-- Phase B 退款链路 schema:
-- 1) RoleCode 加 FINANCE enum value (财务角色, 退款审批的唯一持有者, 4 眼原则)
-- 2) PaymentRecord 加 isReversed/reversedAt/reversedByRefundRequestId 标志
--    用于反向冲账 (不真删历史 PaymentRecord, 保留审计链)
-- 3) 新表 RefundRequest (退款单, 关联 RevisionRequest 或独立)
-- 4) 新表 ReversePaymentRecord (反向支付凭证)

-- Step 1: RoleCode enum 加 FINANCE (改 role.code 列, 不是 user.role)
ALTER TABLE `role`
  MODIFY `code` ENUM('ADMIN', 'SUPERVISOR', 'SALES', 'OPS', 'SHIPPER', 'FINANCE') NOT NULL;
-- 注: seed 一行 Role(code=FINANCE) 由应用启动时 bootstrap-admin 脚本兜底
-- (或者运维手动执行 INSERT INTO role (id, code, name, description, isSystem) ...)

-- Step 2: PaymentRecord 加退款标志
ALTER TABLE `paymentrecord`
  ADD COLUMN `isReversed` BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN `reversedAt` DATETIME(3) NULL,
  ADD COLUMN `reversedByRefundRequestId` VARCHAR(191) NULL;
CREATE INDEX `paymentrecord_reversedByRefundRequestId_idx` ON `paymentrecord` (`reversedByRefundRequestId`);

-- Step 3: RefundRequest 表
CREATE TABLE `refundrequest` (
  `id` VARCHAR(191) NOT NULL,
  `revisionRequestId` VARCHAR(191) NULL,
  `tradeOrderId` VARCHAR(191) NOT NULL,
  `customerId` VARCHAR(191) NOT NULL,
  `requestedAmount` DECIMAL(10, 2) NOT NULL,
  `approvedAmount` DECIMAL(10, 2) NULL,
  `paidAmount` DECIMAL(10, 2) NULL,
  `status` ENUM('PENDING_FINANCE', 'APPROVED_FINANCE', 'PAID_OUT', 'REJECTED_FINANCE', 'WITHDRAWN') NOT NULL DEFAULT 'PENDING_FINANCE',
  `reason` ENUM('CUSTOMER_REGRET', 'QUALITY_ISSUE', 'PRICING_DISPUTE', 'DUPLICATE_PAYMENT', 'OTHER') NOT NULL,
  `reasonDetail` TEXT NOT NULL,
  `sourcePaymentRecordIds` JSON NOT NULL,
  `requesterId` VARCHAR(191) NOT NULL,
  `requestedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `financeReviewerId` VARCHAR(191) NULL,
  `reviewedAt` DATETIME(3) NULL,
  `reviewNote` TEXT NULL,
  `rejectReason` TEXT NULL,
  `payoutMethod` ENUM('ALIPAY', 'WECHAT', 'BANK_TRANSFER', 'OFFLINE_CASH', 'OTHER') NULL,
  `payoutReference` VARCHAR(191) NULL,
  `paidOutAt` DATETIME(3) NULL,
  `paidOutById` VARCHAR(191) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  UNIQUE INDEX `refundrequest_revisionRequestId_key` (`revisionRequestId`),
  INDEX `refundrequest_tradeOrderId_idx` (`tradeOrderId`),
  INDEX `refundrequest_customerId_idx` (`customerId`),
  INDEX `refundrequest_status_requestedAt_idx` (`status`, `requestedAt`),
  INDEX `refundrequest_financeReviewerId_idx` (`financeReviewerId`),
  INDEX `refundrequest_requesterId_idx` (`requesterId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `refundrequest`
  ADD CONSTRAINT `refundrequest_revisionRequestId_fkey`
  FOREIGN KEY (`revisionRequestId`) REFERENCES `tradeorderrevisionrequest`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `refundrequest`
  ADD CONSTRAINT `refundrequest_tradeOrderId_fkey`
  FOREIGN KEY (`tradeOrderId`) REFERENCES `tradeorder`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `refundrequest`
  ADD CONSTRAINT `refundrequest_customerId_fkey`
  FOREIGN KEY (`customerId`) REFERENCES `customer`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `refundrequest`
  ADD CONSTRAINT `refundrequest_requesterId_fkey`
  FOREIGN KEY (`requesterId`) REFERENCES `user`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `refundrequest`
  ADD CONSTRAINT `refundrequest_financeReviewerId_fkey`
  FOREIGN KEY (`financeReviewerId`) REFERENCES `user`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `refundrequest`
  ADD CONSTRAINT `refundrequest_paidOutById_fkey`
  FOREIGN KEY (`paidOutById`) REFERENCES `user`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- PaymentRecord FK 反向到 RefundRequest
ALTER TABLE `paymentrecord`
  ADD CONSTRAINT `paymentrecord_reversedByRefundRequestId_fkey`
  FOREIGN KEY (`reversedByRefundRequestId`) REFERENCES `refundrequest`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- Step 4: ReversePaymentRecord 表
CREATE TABLE `reversepaymentrecord` (
  `id` VARCHAR(191) NOT NULL,
  `refundRequestId` VARCHAR(191) NOT NULL,
  `sourcePaymentRecordId` VARCHAR(191) NOT NULL,
  `amount` DECIMAL(10, 2) NOT NULL,
  `occurredAt` DATETIME(3) NOT NULL,
  `payoutMethod` ENUM('ALIPAY', 'WECHAT', 'BANK_TRANSFER', 'OFFLINE_CASH', 'OTHER') NOT NULL,
  `payoutReference` VARCHAR(191) NULL,
  `createdById` VARCHAR(191) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  INDEX `reversepaymentrecord_refundRequestId_idx` (`refundRequestId`),
  INDEX `reversepaymentrecord_sourcePaymentRecordId_idx` (`sourcePaymentRecordId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `reversepaymentrecord`
  ADD CONSTRAINT `reversepaymentrecord_refundRequestId_fkey`
  FOREIGN KEY (`refundRequestId`) REFERENCES `refundrequest`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `reversepaymentrecord`
  ADD CONSTRAINT `reversepaymentrecord_sourcePaymentRecordId_fkey`
  FOREIGN KEY (`sourcePaymentRecordId`) REFERENCES `paymentrecord`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `reversepaymentrecord`
  ADD CONSTRAINT `reversepaymentrecord_createdById_fkey`
  FOREIGN KEY (`createdById`) REFERENCES `user`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
