-- Add WeCom-backed live session sync metadata and audience records.

ALTER TABLE `livesession`
  ADD COLUMN `source` ENUM('MANUAL', 'WECOM') NOT NULL DEFAULT 'MANUAL',
  ADD COLUMN `wecomLivingId` VARCHAR(191) NULL,
  ADD COLUMN `wecomAnchorUserId` VARCHAR(191) NULL,
  ADD COLUMN `wecomLiveStatus` VARCHAR(191) NULL,
  ADD COLUMN `actualStartAt` DATETIME(3) NULL,
  ADD COLUMN `actualEndAt` DATETIME(3) NULL,
  ADD COLUMN `viewerCount` INTEGER NULL,
  ADD COLUMN `totalWatchDurationSeconds` INTEGER NULL,
  ADD COLUMN `peakOnlineCount` INTEGER NULL,
  ADD COLUMN `lastSyncedAt` DATETIME(3) NULL,
  ADD COLUMN `syncStatus` ENUM('NEVER_SYNCED', 'SYNCING', 'SYNCED', 'FAILED') NOT NULL DEFAULT 'NEVER_SYNCED',
  ADD COLUMN `syncError` TEXT NULL,
  ADD COLUMN `wecomRaw` JSON NULL;

CREATE UNIQUE INDEX `livesession_wecomLivingId_key` ON `livesession`(`wecomLivingId`);
CREATE INDEX `livesession_source_startAt_idx` ON `livesession`(`source`, `startAt`);
CREATE INDEX `livesession_syncStatus_lastSyncedAt_idx` ON `livesession`(`syncStatus`, `lastSyncedAt`);

CREATE TABLE `LiveAudienceRecord` (
  `id` VARCHAR(191) NOT NULL,
  `liveSessionId` VARCHAR(191) NOT NULL,
  `wecomLivingId` VARCHAR(191) NOT NULL,
  `wecomUserId` VARCHAR(191) NULL,
  `wecomExternalUserId` VARCHAR(191) NULL,
  `viewerPhoneMasked` VARCHAR(191) NULL,
  `viewerPhoneEncrypted` TEXT NULL,
  `phoneHash` VARCHAR(191) NULL,
  `nickname` VARCHAR(191) NULL,
  `watchDurationSeconds` INTEGER NULL,
  `firstEnterAt` DATETIME(3) NULL,
  `lastLeaveAt` DATETIME(3) NULL,
  `raw` JSON NULL,
  `matchStatus` ENUM('UNMATCHED', 'AUTO_MATCHED_CUSTOMER', 'PENDING_CONFIRMATION', 'CONFIRMED_CUSTOMER', 'IGNORED', 'CONFLICT') NOT NULL DEFAULT 'UNMATCHED',
  `matchMethod` ENUM('WECOM_EXTERNAL_USER_ID', 'WECOM_USER_ID', 'PHONE_EXACT', 'PHONE_MANUAL', 'MANUAL_SEARCH') NULL,
  `candidateCustomerId` VARCHAR(191) NULL,
  `candidateConfidence` INTEGER NULL,
  `confirmedById` VARCHAR(191) NULL,
  `confirmedAt` DATETIME(3) NULL,
  `customerId` VARCHAR(191) NULL,
  `liveInvitationId` VARCHAR(191) NULL,
  `matchNote` TEXT NULL,
  `dedupeKey` VARCHAR(191) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE UNIQUE INDEX `LiveAudienceRecord_dedupeKey_key` ON `LiveAudienceRecord`(`dedupeKey`);
CREATE INDEX `LiveAudienceRecord_liveSessionId_matchStatus_idx` ON `LiveAudienceRecord`(`liveSessionId`, `matchStatus`);
CREATE INDEX `LiveAudienceRecord_wecomLivingId_idx` ON `LiveAudienceRecord`(`wecomLivingId`);
CREATE INDEX `LiveAudienceRecord_wecomExternalUserId_idx` ON `LiveAudienceRecord`(`wecomExternalUserId`);
CREATE INDEX `LiveAudienceRecord_wecomUserId_idx` ON `LiveAudienceRecord`(`wecomUserId`);
CREATE INDEX `LiveAudienceRecord_phoneHash_idx` ON `LiveAudienceRecord`(`phoneHash`);
CREATE INDEX `LiveAudienceRecord_candidateCustomerId_matchStatus_idx` ON `LiveAudienceRecord`(`candidateCustomerId`, `matchStatus`);
CREATE INDEX `LiveAudienceRecord_customerId_matchStatus_idx` ON `LiveAudienceRecord`(`customerId`, `matchStatus`);
CREATE INDEX `LiveAudienceRecord_liveInvitationId_idx` ON `LiveAudienceRecord`(`liveInvitationId`);
CREATE INDEX `LiveAudienceRecord_confirmedById_confirmedAt_idx` ON `LiveAudienceRecord`(`confirmedById`, `confirmedAt`);

ALTER TABLE `LiveAudienceRecord` ADD CONSTRAINT `LiveAudienceRecord_liveSessionId_fkey` FOREIGN KEY (`liveSessionId`) REFERENCES `livesession`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `LiveAudienceRecord` ADD CONSTRAINT `LiveAudienceRecord_candidateCustomerId_fkey` FOREIGN KEY (`candidateCustomerId`) REFERENCES `customer`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `LiveAudienceRecord` ADD CONSTRAINT `LiveAudienceRecord_confirmedById_fkey` FOREIGN KEY (`confirmedById`) REFERENCES `user`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `LiveAudienceRecord` ADD CONSTRAINT `LiveAudienceRecord_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `customer`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `LiveAudienceRecord` ADD CONSTRAINT `LiveAudienceRecord_liveInvitationId_fkey` FOREIGN KEY (`liveInvitationId`) REFERENCES `liveinvitation`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
