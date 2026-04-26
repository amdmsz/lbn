-- Add mobile SIM call recording, resumable upload, AI analysis, and review foundation.

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
    'CALL_RECORDING',
    'CALL_AI_ANALYSIS',
    'CALL_QUALITY_REVIEW',
    'MOBILE_DEVICE',
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
    'DICTIONARY_ITEM',
    'CALL_RESULT_SETTING'
  ) NOT NULL;

CREATE TABLE `MobileDevice` (
  `id` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `deviceFingerprint` VARCHAR(191) NOT NULL,
  `deviceModel` VARCHAR(191) NULL,
  `androidVersion` VARCHAR(191) NULL,
  `appVersion` VARCHAR(191) NULL,
  `recordingEnabled` BOOLEAN NOT NULL DEFAULT true,
  `recordingCapability` ENUM('UNKNOWN', 'SUPPORTED', 'UNSUPPORTED', 'BLOCKED') NOT NULL DEFAULT 'UNKNOWN',
  `lastSeenAt` DATETIME(3) NULL,
  `disabledAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  UNIQUE INDEX `MobileDevice_userId_deviceFingerprint_key`(`userId`, `deviceFingerprint`),
  INDEX `MobileDevice_userId_lastSeenAt_idx`(`userId`, `lastSeenAt`),
  INDEX `MobileDevice_recordingCapability_lastSeenAt_idx`(`recordingCapability`, `lastSeenAt`),
  INDEX `MobileDevice_disabledAt_idx`(`disabledAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `CallRecording` (
  `id` VARCHAR(191) NOT NULL,
  `callRecordId` VARCHAR(191) NOT NULL,
  `customerId` VARCHAR(191) NOT NULL,
  `salesId` VARCHAR(191) NOT NULL,
  `teamId` VARCHAR(191) NULL,
  `deviceId` VARCHAR(191) NULL,
  `status` ENUM('LOCAL_PENDING', 'UPLOADING', 'UPLOADED', 'PROCESSING', 'READY', 'FAILED', 'EXPIRED', 'DELETED') NOT NULL DEFAULT 'LOCAL_PENDING',
  `storageProvider` ENUM('LOCAL_MOUNT', 'MINIO', 'S3') NOT NULL DEFAULT 'LOCAL_MOUNT',
  `storageBucket` VARCHAR(191) NULL,
  `storageKey` TEXT NULL,
  `mimeType` VARCHAR(191) NOT NULL,
  `codec` VARCHAR(191) NULL,
  `fileSizeBytes` INTEGER NULL,
  `durationSeconds` INTEGER NULL,
  `sha256` VARCHAR(191) NULL,
  `uploadedAt` DATETIME(3) NULL,
  `retentionUntil` DATETIME(3) NULL,
  `failureCode` VARCHAR(191) NULL,
  `failureMessage` TEXT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  UNIQUE INDEX `CallRecording_callRecordId_key`(`callRecordId`),
  INDEX `CallRecording_customerId_createdAt_idx`(`customerId`, `createdAt`),
  INDEX `CallRecording_salesId_createdAt_idx`(`salesId`, `createdAt`),
  INDEX `CallRecording_teamId_createdAt_idx`(`teamId`, `createdAt`),
  INDEX `CallRecording_status_createdAt_idx`(`status`, `createdAt`),
  INDEX `CallRecording_retentionUntil_idx`(`retentionUntil`),
  INDEX `CallRecording_deviceId_fkey`(`deviceId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `CallRecordingUpload` (
  `id` VARCHAR(191) NOT NULL,
  `recordingId` VARCHAR(191) NOT NULL,
  `status` ENUM('INITIATED', 'UPLOADING', 'COMPLETED', 'FAILED', 'CANCELED') NOT NULL DEFAULT 'INITIATED',
  `chunkSizeBytes` INTEGER NOT NULL,
  `totalChunks` INTEGER NOT NULL,
  `uploadedChunks` INTEGER NOT NULL DEFAULT 0,
  `totalSizeBytes` INTEGER NOT NULL,
  `sha256` VARCHAR(191) NULL,
  `chunkStateJson` JSON NULL,
  `expiresAt` DATETIME(3) NOT NULL,
  `completedAt` DATETIME(3) NULL,
  `failureMessage` TEXT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  INDEX `CallRecordingUpload_recordingId_createdAt_idx`(`recordingId`, `createdAt`),
  INDEX `CallRecordingUpload_status_expiresAt_idx`(`status`, `expiresAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `CallAiAnalysis` (
  `id` VARCHAR(191) NOT NULL,
  `callRecordId` VARCHAR(191) NOT NULL,
  `recordingId` VARCHAR(191) NOT NULL,
  `status` ENUM('PENDING', 'TRANSCRIBING', 'ANALYZING', 'READY', 'FAILED') NOT NULL DEFAULT 'PENDING',
  `transcriptText` LONGTEXT NULL,
  `transcriptJson` JSON NULL,
  `summary` TEXT NULL,
  `customerIntent` ENUM('HIGH', 'MEDIUM', 'LOW', 'REFUSED', 'UNKNOWN') NOT NULL DEFAULT 'UNKNOWN',
  `sentiment` ENUM('POSITIVE', 'NEUTRAL', 'NEGATIVE', 'MIXED') NULL,
  `qualityScore` INTEGER NULL,
  `riskFlagsJson` JSON NULL,
  `opportunityTagsJson` JSON NULL,
  `keywordsJson` JSON NULL,
  `nextActionSuggestion` TEXT NULL,
  `modelProvider` VARCHAR(191) NULL,
  `modelName` VARCHAR(191) NULL,
  `modelVersion` VARCHAR(191) NULL,
  `processedAt` DATETIME(3) NULL,
  `failureMessage` TEXT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  UNIQUE INDEX `CallAiAnalysis_callRecordId_key`(`callRecordId`),
  UNIQUE INDEX `CallAiAnalysis_recordingId_key`(`recordingId`),
  INDEX `CallAiAnalysis_status_createdAt_idx`(`status`, `createdAt`),
  INDEX `CallAiAnalysis_qualityScore_idx`(`qualityScore`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `CallQualityReview` (
  `id` VARCHAR(191) NOT NULL,
  `callRecordId` VARCHAR(191) NOT NULL,
  `recordingId` VARCHAR(191) NOT NULL,
  `reviewerId` VARCHAR(191) NOT NULL,
  `aiScoreSnapshot` INTEGER NULL,
  `manualScore` INTEGER NULL,
  `reviewStatus` ENUM('PENDING', 'REVIEWED', 'NEEDS_COACHING', 'EXCELLENT', 'DISMISSED') NOT NULL DEFAULT 'PENDING',
  `comment` TEXT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  UNIQUE INDEX `CallQualityReview_recordingId_reviewerId_key`(`recordingId`, `reviewerId`),
  INDEX `CallQualityReview_callRecordId_createdAt_idx`(`callRecordId`, `createdAt`),
  INDEX `CallQualityReview_reviewerId_createdAt_idx`(`reviewerId`, `createdAt`),
  INDEX `CallQualityReview_reviewStatus_createdAt_idx`(`reviewStatus`, `createdAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `MobileDevice` ADD CONSTRAINT `MobileDevice_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `CallRecording` ADD CONSTRAINT `CallRecording_callRecordId_fkey` FOREIGN KEY (`callRecordId`) REFERENCES `callrecord`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `CallRecording` ADD CONSTRAINT `CallRecording_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `customer`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `CallRecording` ADD CONSTRAINT `CallRecording_salesId_fkey` FOREIGN KEY (`salesId`) REFERENCES `user`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `CallRecording` ADD CONSTRAINT `CallRecording_teamId_fkey` FOREIGN KEY (`teamId`) REFERENCES `teams`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `CallRecording` ADD CONSTRAINT `CallRecording_deviceId_fkey` FOREIGN KEY (`deviceId`) REFERENCES `MobileDevice`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `CallRecordingUpload` ADD CONSTRAINT `CallRecordingUpload_recordingId_fkey` FOREIGN KEY (`recordingId`) REFERENCES `CallRecording`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `CallAiAnalysis` ADD CONSTRAINT `CallAiAnalysis_callRecordId_fkey` FOREIGN KEY (`callRecordId`) REFERENCES `callrecord`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `CallAiAnalysis` ADD CONSTRAINT `CallAiAnalysis_recordingId_fkey` FOREIGN KEY (`recordingId`) REFERENCES `CallRecording`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `CallQualityReview` ADD CONSTRAINT `CallQualityReview_callRecordId_fkey` FOREIGN KEY (`callRecordId`) REFERENCES `callrecord`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `CallQualityReview` ADD CONSTRAINT `CallQualityReview_recordingId_fkey` FOREIGN KEY (`recordingId`) REFERENCES `CallRecording`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `CallQualityReview` ADD CONSTRAINT `CallQualityReview_reviewerId_fkey` FOREIGN KEY (`reviewerId`) REFERENCES `user`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
