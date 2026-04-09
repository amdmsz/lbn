CREATE TABLE `imported_customer_deletion_requests` (
    `id` VARCHAR(191) NOT NULL,
    `customerIdSnapshot` VARCHAR(191) NOT NULL,
    `customerNameSnapshot` VARCHAR(191) NOT NULL,
    `customerPhoneSnapshot` VARCHAR(191) NOT NULL,
    `sourceMode` ENUM('LEAD', 'CUSTOMER_CONTINUATION') NOT NULL,
    `sourceBatchId` VARCHAR(191) NOT NULL,
    `sourceBatchFileName` VARCHAR(191) NOT NULL,
    `sourceRowNumber` INTEGER NULL,
    `status` ENUM('PENDING_SUPERVISOR', 'REJECTED', 'EXECUTED') NOT NULL DEFAULT 'PENDING_SUPERVISOR',
    `requestReason` TEXT NOT NULL,
    `requestedById` VARCHAR(191) NOT NULL,
    `reviewerId` VARCHAR(191) NULL,
    `reviewedAt` DATETIME(3) NULL,
    `rejectReason` TEXT NULL,
    `executedById` VARCHAR(191) NULL,
    `executedAt` DATETIME(3) NULL,
    `outcomeSnapshot` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
);

CREATE INDEX `imp_cust_del_req_customer_created_idx`
  ON `imported_customer_deletion_requests`(`customerIdSnapshot`, `createdAt`);

CREATE INDEX `imp_cust_del_req_batch_created_idx`
  ON `imported_customer_deletion_requests`(`sourceBatchId`, `createdAt`);

CREATE INDEX `imp_cust_del_req_status_reviewer_created_idx`
  ON `imported_customer_deletion_requests`(`status`, `reviewerId`, `createdAt`);

CREATE INDEX `imp_cust_del_req_requester_created_idx`
  ON `imported_customer_deletion_requests`(`requestedById`, `createdAt`);

CREATE INDEX `imp_cust_del_req_executor_created_idx`
  ON `imported_customer_deletion_requests`(`executedById`, `createdAt`);

ALTER TABLE `lead_customer_merge_logs`
  DROP FOREIGN KEY `lead_customer_merge_logs_customerId_fkey`;

ALTER TABLE `lead_customer_merge_logs`
  MODIFY `customerId` VARCHAR(191) NULL;

ALTER TABLE `imported_customer_deletion_requests`
  ADD CONSTRAINT `imported_customer_deletion_requests_sourceBatchId_fkey`
    FOREIGN KEY (`sourceBatchId`) REFERENCES `lead_import_batches`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `imported_customer_deletion_requests_requestedById_fkey`
    FOREIGN KEY (`requestedById`) REFERENCES `user`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `imported_customer_deletion_requests_reviewerId_fkey`
    FOREIGN KEY (`reviewerId`) REFERENCES `user`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `imported_customer_deletion_requests_executedById_fkey`
    FOREIGN KEY (`executedById`) REFERENCES `user`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `lead_customer_merge_logs`
  ADD CONSTRAINT `lead_customer_merge_logs_customerId_fkey`
    FOREIGN KEY (`customerId`) REFERENCES `customer`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
