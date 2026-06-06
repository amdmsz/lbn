-- 扩展 TradeOrder.tradeStatus 加 REVISION_PENDING (主管复审撤单/改单期间的过渡态)
ALTER TABLE `tradeorder`
  MODIFY `tradeStatus` ENUM('DRAFT', 'PENDING_REVIEW', 'APPROVED', 'REJECTED', 'CANCELED', 'REVISION_PENDING') NOT NULL DEFAULT 'DRAFT';

-- 撤单/改单申请单 (审核通过后的反悔通道, 阶段 A 仅支持 T0-T1 即未发货 + 未财务确认)
CREATE TABLE `tradeorderrevisionrequest` (
  `id` VARCHAR(191) NOT NULL,
  `tradeOrderId` VARCHAR(191) NOT NULL,
  `kind` ENUM('CANCEL', 'REDUCE_QUANTITY', 'MODIFY_LINES') NOT NULL,
  `status` ENUM('PENDING', 'APPROVED', 'REJECTED', 'WITHDRAWN') NOT NULL DEFAULT 'PENDING',
  `reason` TEXT NOT NULL,
  `originalSnapshot` JSON NOT NULL,
  `patchedSnapshot` JSON NULL,
  `requesterId` VARCHAR(191) NOT NULL,
  `requestedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `reviewerId` VARCHAR(191) NULL,
  `reviewedAt` DATETIME(3) NULL,
  `reviewNote` TEXT NULL,
  `blockedReason` TEXT NULL,
  `cancelledShippingTaskIds` JSON NULL,
  `cancelledPaymentPlanIds` JSON NULL,
  `cancelledPaymentRecordIds` JSON NULL,
  `cancelledCollectionTaskIds` JSON NULL,
  `cancelledSalesOrderIds` JSON NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  INDEX `tradeorderrevisionrequest_tradeOrderId_idx` (`tradeOrderId`),
  INDEX `tradeorderrevisionrequest_status_requestedAt_idx` (`status`, `requestedAt`),
  INDEX `tradeorderrevisionrequest_reviewerId_idx` (`reviewerId`),
  INDEX `tradeorderrevisionrequest_requesterId_idx` (`requesterId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `tradeorderrevisionrequest`
  ADD CONSTRAINT `tradeorderrevisionrequest_tradeOrderId_fkey`
  FOREIGN KEY (`tradeOrderId`) REFERENCES `tradeorder`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `tradeorderrevisionrequest`
  ADD CONSTRAINT `tradeorderrevisionrequest_requesterId_fkey`
  FOREIGN KEY (`requesterId`) REFERENCES `user`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `tradeorderrevisionrequest`
  ADD CONSTRAINT `tradeorderrevisionrequest_reviewerId_fkey`
  FOREIGN KEY (`reviewerId`) REFERENCES `user`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
