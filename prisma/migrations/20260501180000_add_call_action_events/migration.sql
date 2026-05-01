-- Add a narrow call action ledger for mobile/CTI call observability and start idempotency.

CREATE TABLE `call_action_events` (
  `id` VARCHAR(191) NOT NULL,
  `dedupeKey` VARCHAR(191) NULL,
  `correlationId` VARCHAR(191) NULL,
  `action` VARCHAR(191) NOT NULL,
  `callMode` VARCHAR(191) NULL,
  `customerId` VARCHAR(191) NULL,
  `salesId` VARCHAR(191) NULL,
  `actorId` VARCHAR(191) NULL,
  `callRecordId` VARCHAR(191) NULL,
  `outboundSessionId` VARCHAR(191) NULL,
  `deviceId` VARCHAR(191) NULL,
  `appVersion` VARCHAR(191) NULL,
  `deviceModel` VARCHAR(191) NULL,
  `androidVersion` VARCHAR(191) NULL,
  `clientEventAt` DATETIME(3) NULL,
  `serverReceivedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `failureCode` VARCHAR(191) NULL,
  `failureMessage` TEXT NULL,
  `metadataJson` JSON NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  UNIQUE INDEX `call_action_events_dedupe_key`(`dedupeKey`),
  INDEX `call_action_events_correlation_idx`(`correlationId`),
  INDEX `call_action_events_call_record_received_idx`(`callRecordId`, `serverReceivedAt`),
  INDEX `call_action_events_outbound_session_received_idx`(`outboundSessionId`, `serverReceivedAt`),
  INDEX `call_action_events_customer_received_idx`(`customerId`, `serverReceivedAt`),
  INDEX `call_action_events_sales_received_idx`(`salesId`, `serverReceivedAt`),
  INDEX `call_action_events_action_received_idx`(`action`, `serverReceivedAt`),
  INDEX `call_action_events_actorId_fkey`(`actorId`),
  INDEX `call_action_events_deviceId_fkey`(`deviceId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `call_action_events` ADD CONSTRAINT `call_action_events_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `customer`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `call_action_events` ADD CONSTRAINT `call_action_events_salesId_fkey` FOREIGN KEY (`salesId`) REFERENCES `user`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `call_action_events` ADD CONSTRAINT `call_action_events_actorId_fkey` FOREIGN KEY (`actorId`) REFERENCES `user`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `call_action_events` ADD CONSTRAINT `call_action_events_callRecordId_fkey` FOREIGN KEY (`callRecordId`) REFERENCES `callrecord`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `call_action_events` ADD CONSTRAINT `call_action_events_outboundSessionId_fkey` FOREIGN KEY (`outboundSessionId`) REFERENCES `outbound_call_sessions`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `call_action_events` ADD CONSTRAINT `call_action_events_deviceId_fkey` FOREIGN KEY (`deviceId`) REFERENCES `MobileDevice`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
