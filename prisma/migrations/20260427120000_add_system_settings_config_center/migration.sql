-- Add auditable system settings config center foundation.

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
    'CALL_RESULT_SETTING',
    'SYSTEM_SETTING'
  ) NOT NULL;

CREATE TABLE `system_settings` (
  `id` VARCHAR(191) NOT NULL,
  `namespace` VARCHAR(191) NOT NULL,
  `key` VARCHAR(191) NOT NULL,
  `valueJson` JSON NULL,
  `secretValueEncrypted` TEXT NULL,
  `secretFingerprint` VARCHAR(191) NULL,
  `valueVersion` INTEGER NOT NULL DEFAULT 1,
  `isSecret` BOOLEAN NOT NULL DEFAULT false,
  `description` TEXT NULL,
  `updatedById` VARCHAR(191) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  UNIQUE INDEX `system_settings_namespace_key_key`(`namespace`, `key`),
  INDEX `system_settings_namespace_updatedAt_idx`(`namespace`, `updatedAt`),
  INDEX `system_settings_updatedById_idx`(`updatedById`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `system_setting_revisions` (
  `id` VARCHAR(191) NOT NULL,
  `settingId` VARCHAR(191) NOT NULL,
  `namespace` VARCHAR(191) NOT NULL,
  `key` VARCHAR(191) NOT NULL,
  `beforeJson` JSON NULL,
  `afterJson` JSON NULL,
  `beforeSecretFingerprint` VARCHAR(191) NULL,
  `afterSecretFingerprint` VARCHAR(191) NULL,
  `changedById` VARCHAR(191) NULL,
  `changeReason` TEXT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  INDEX `system_setting_revisions_settingId_createdAt_idx`(`settingId`, `createdAt`),
  INDEX `system_setting_revisions_namespace_key_createdAt_idx`(`namespace`, `key`, `createdAt`),
  INDEX `system_setting_revisions_changedById_createdAt_idx`(`changedById`, `createdAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `system_settings` ADD CONSTRAINT `system_settings_updatedById_fkey` FOREIGN KEY (`updatedById`) REFERENCES `user`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `system_setting_revisions` ADD CONSTRAINT `system_setting_revisions_settingId_fkey` FOREIGN KEY (`settingId`) REFERENCES `system_settings`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `system_setting_revisions` ADD CONSTRAINT `system_setting_revisions_changedById_fkey` FOREIGN KEY (`changedById`) REFERENCES `user`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
