-- CreateTable
CREATE TABLE `Role` (
    `id` VARCHAR(191) NOT NULL,
    `code` ENUM('ADMIN', 'SUPERVISOR', 'SALES', 'OPS', 'SHIPPER') NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `description` VARCHAR(191) NULL,
    `isSystem` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Role_code_key`(`code`),
    UNIQUE INDEX `Role_name_key`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `teams` (
    `id` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `description` TEXT NULL,
    `supervisorId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `teams_code_key`(`code`),
    UNIQUE INDEX `teams_name_key`(`name`),
    UNIQUE INDEX `teams_supervisorId_key`(`supervisorId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `User` (
    `id` VARCHAR(191) NOT NULL,
    `username` VARCHAR(191) NOT NULL,
    `passwordHash` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `phone` VARCHAR(191) NULL,
    `teamId` VARCHAR(191) NULL,
    `supervisorId` VARCHAR(191) NULL,
    `userStatus` ENUM('ACTIVE', 'INACTIVE') NOT NULL DEFAULT 'ACTIVE',
    `mustChangePassword` BOOLEAN NOT NULL DEFAULT false,
    `lastLoginAt` DATETIME(3) NULL,
    `invitedAt` DATETIME(3) NULL,
    `invitedById` VARCHAR(191) NULL,
    `disabledAt` DATETIME(3) NULL,
    `disabledById` VARCHAR(191) NULL,
    `roleId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `User_username_key`(`username`),
    UNIQUE INDEX `User_phone_key`(`phone`),
    INDEX `User_roleId_idx`(`roleId`),
    INDEX `User_userStatus_idx`(`userStatus`),
    INDEX `User_teamId_idx`(`teamId`),
    INDEX `User_supervisorId_idx`(`supervisorId`),
    INDEX `User_invitedById_idx`(`invitedById`),
    INDEX `User_disabledById_idx`(`disabledById`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Lead` (
    `id` VARCHAR(191) NOT NULL,
    `source` ENUM('INFO_FLOW') NOT NULL,
    `sourceDetail` VARCHAR(191) NULL,
    `campaignName` VARCHAR(191) NULL,
    `name` VARCHAR(191) NULL,
    `phone` VARCHAR(191) NOT NULL,
    `province` VARCHAR(191) NULL,
    `city` VARCHAR(191) NULL,
    `district` VARCHAR(191) NULL,
    `address` VARCHAR(191) NULL,
    `interestedProduct` VARCHAR(191) NULL,
    `isFirstPurchase` BOOLEAN NOT NULL DEFAULT false,
    `remark` TEXT NULL,
    `status` ENUM('NEW', 'ASSIGNED', 'FIRST_CALL_PENDING', 'FOLLOWING', 'WECHAT_ADDED', 'LIVE_INVITED', 'LIVE_WATCHED', 'ORDERED', 'CONVERTED', 'CLOSED_LOST', 'INVALID') NOT NULL DEFAULT 'NEW',
    `conversionStatus` ENUM('UNCONVERTED', 'CONVERTED', 'MERGED') NOT NULL DEFAULT 'UNCONVERTED',
    `ownerId` VARCHAR(191) NULL,
    `customerId` VARCHAR(191) NULL,
    `lastFollowUpAt` DATETIME(3) NULL,
    `nextFollowUpAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Lead_phone_idx`(`phone`),
    INDEX `Lead_status_idx`(`status`),
    INDEX `Lead_ownerId_idx`(`ownerId`),
    INDEX `Lead_customerId_idx`(`customerId`),
    INDEX `Lead_nextFollowUpAt_idx`(`nextFollowUpAt`),
    INDEX `Lead_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Customer` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `phone` VARCHAR(191) NOT NULL,
    `wechatId` VARCHAR(191) NULL,
    `province` VARCHAR(191) NULL,
    `city` VARCHAR(191) NULL,
    `district` VARCHAR(191) NULL,
    `address` VARCHAR(191) NULL,
    `status` ENUM('ACTIVE', 'DORMANT', 'LOST', 'BLACKLISTED') NOT NULL DEFAULT 'ACTIVE',
    `level` ENUM('NEW', 'REGULAR', 'VIP') NOT NULL DEFAULT 'NEW',
    `ownerId` VARCHAR(191) NULL,
    `remark` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Customer_phone_key`(`phone`),
    INDEX `Customer_status_idx`(`status`),
    INDEX `Customer_ownerId_idx`(`ownerId`),
    INDEX `Customer_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `LeadAssignment` (
    `id` VARCHAR(191) NOT NULL,
    `leadId` VARCHAR(191) NOT NULL,
    `fromUserId` VARCHAR(191) NULL,
    `toUserId` VARCHAR(191) NOT NULL,
    `assignedById` VARCHAR(191) NOT NULL,
    `assignmentType` ENUM('MANUAL', 'BATCH', 'RECYCLE', 'REASSIGN') NOT NULL DEFAULT 'MANUAL',
    `note` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `LeadAssignment_leadId_createdAt_idx`(`leadId`, `createdAt`),
    INDEX `LeadAssignment_toUserId_createdAt_idx`(`toUserId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `FollowUpTask` (
    `id` VARCHAR(191) NOT NULL,
    `leadId` VARCHAR(191) NULL,
    `customerId` VARCHAR(191) NULL,
    `ownerId` VARCHAR(191) NOT NULL,
    `createdById` VARCHAR(191) NULL,
    `type` ENUM('CALL', 'WECHAT', 'LIVE_INVITE', 'ORDER_FOLLOW_UP', 'GENERAL') NOT NULL DEFAULT 'GENERAL',
    `status` ENUM('PENDING', 'COMPLETED', 'CANCELED') NOT NULL DEFAULT 'PENDING',
    `priority` ENUM('LOW', 'MEDIUM', 'HIGH', 'URGENT') NOT NULL DEFAULT 'MEDIUM',
    `subject` VARCHAR(191) NOT NULL,
    `content` TEXT NULL,
    `dueAt` DATETIME(3) NOT NULL,
    `completedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `FollowUpTask_leadId_status_dueAt_idx`(`leadId`, `status`, `dueAt`),
    INDEX `FollowUpTask_customerId_status_dueAt_idx`(`customerId`, `status`, `dueAt`),
    INDEX `FollowUpTask_ownerId_status_dueAt_idx`(`ownerId`, `status`, `dueAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CallRecord` (
    `id` VARCHAR(191) NOT NULL,
    `leadId` VARCHAR(191) NULL,
    `customerId` VARCHAR(191) NULL,
    `salesId` VARCHAR(191) NOT NULL,
    `callTime` DATETIME(3) NOT NULL,
    `durationSeconds` INTEGER NOT NULL DEFAULT 0,
    `result` ENUM('NOT_CONNECTED', 'INVALID_NUMBER', 'HUNG_UP', 'CONNECTED_NO_TALK', 'INTERESTED', 'WECHAT_PENDING', 'WECHAT_ADDED', 'REFUSED_WECHAT', 'NEED_CALLBACK', 'REFUSED_TO_BUY', 'BLACKLIST') NOT NULL,
    `remark` TEXT NULL,
    `nextFollowUpAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `CallRecord_leadId_callTime_idx`(`leadId`, `callTime`),
    INDEX `CallRecord_customerId_callTime_idx`(`customerId`, `callTime`),
    INDEX `CallRecord_salesId_callTime_idx`(`salesId`, `callTime`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `WechatRecord` (
    `id` VARCHAR(191) NOT NULL,
    `leadId` VARCHAR(191) NULL,
    `customerId` VARCHAR(191) NULL,
    `salesId` VARCHAR(191) NOT NULL,
    `addedStatus` ENUM('PENDING', 'ADDED', 'REJECTED', 'BLOCKED') NOT NULL DEFAULT 'PENDING',
    `addedAt` DATETIME(3) NULL,
    `wechatAccount` VARCHAR(191) NULL,
    `wechatNickname` VARCHAR(191) NULL,
    `wechatRemarkName` VARCHAR(191) NULL,
    `tags` JSON NULL,
    `summary` TEXT NULL,
    `nextFollowUpAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `WechatRecord_leadId_createdAt_idx`(`leadId`, `createdAt`),
    INDEX `WechatRecord_customerId_createdAt_idx`(`customerId`, `createdAt`),
    INDEX `WechatRecord_salesId_createdAt_idx`(`salesId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `LiveSession` (
    `id` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `hostName` VARCHAR(191) NOT NULL,
    `startAt` DATETIME(3) NOT NULL,
    `roomId` VARCHAR(191) NULL,
    `roomLink` VARCHAR(191) NULL,
    `targetProduct` VARCHAR(191) NULL,
    `remark` TEXT NULL,
    `status` ENUM('DRAFT', 'SCHEDULED', 'LIVE', 'ENDED', 'CANCELED') NOT NULL DEFAULT 'DRAFT',
    `createdById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `LiveSession_status_startAt_idx`(`status`, `startAt`),
    INDEX `LiveSession_createdById_idx`(`createdById`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `LiveInvitation` (
    `id` VARCHAR(191) NOT NULL,
    `liveSessionId` VARCHAR(191) NOT NULL,
    `leadId` VARCHAR(191) NULL,
    `customerId` VARCHAR(191) NULL,
    `salesId` VARCHAR(191) NOT NULL,
    `invitationStatus` ENUM('PENDING', 'INVITED', 'ACCEPTED', 'REJECTED') NOT NULL DEFAULT 'PENDING',
    `invitedAt` DATETIME(3) NULL,
    `invitationMethod` ENUM('CALL', 'WECHAT', 'MANUAL', 'OTHER') NOT NULL DEFAULT 'MANUAL',
    `attendanceStatus` ENUM('NOT_ATTENDED', 'ATTENDED', 'LEFT_EARLY') NOT NULL DEFAULT 'NOT_ATTENDED',
    `watchDurationMinutes` INTEGER NULL DEFAULT 0,
    `giftQualified` BOOLEAN NOT NULL DEFAULT false,
    `remark` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `LiveInvitation_liveSessionId_salesId_idx`(`liveSessionId`, `salesId`),
    INDEX `LiveInvitation_leadId_idx`(`leadId`),
    INDEX `LiveInvitation_customerId_idx`(`customerId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Order` (
    `id` VARCHAR(191) NOT NULL,
    `customerId` VARCHAR(191) NOT NULL,
    `leadId` VARCHAR(191) NULL,
    `ownerId` VARCHAR(191) NULL,
    `type` ENUM('NORMAL_ORDER', 'GIFT_FREIGHT_ORDER') NOT NULL,
    `status` ENUM('DRAFT', 'CONFIRMED', 'COMPLETED', 'CANCELED') NOT NULL DEFAULT 'DRAFT',
    `paymentStatus` ENUM('PENDING', 'PAID', 'FAILED', 'REFUNDED') NOT NULL DEFAULT 'PENDING',
    `shippingStatus` ENUM('PENDING', 'READY', 'SHIPPED', 'SIGNED', 'FINISHED', 'CANCELED') NOT NULL DEFAULT 'PENDING',
    `amount` DECIMAL(10, 2) NOT NULL,
    `sourceScene` VARCHAR(191) NULL,
    `receiverName` VARCHAR(191) NOT NULL,
    `receiverPhone` VARCHAR(191) NOT NULL,
    `receiverAddress` VARCHAR(191) NOT NULL,
    `trackingNumber` VARCHAR(191) NULL,
    `remark` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Order_customerId_createdAt_idx`(`customerId`, `createdAt`),
    INDEX `Order_leadId_idx`(`leadId`),
    INDEX `Order_ownerId_idx`(`ownerId`),
    INDEX `Order_status_paymentStatus_shippingStatus_idx`(`status`, `paymentStatus`, `shippingStatus`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `GiftRecord` (
    `id` VARCHAR(191) NOT NULL,
    `customerId` VARCHAR(191) NOT NULL,
    `leadId` VARCHAR(191) NULL,
    `liveSessionId` VARCHAR(191) NULL,
    `salesId` VARCHAR(191) NULL,
    `giftName` VARCHAR(191) NOT NULL,
    `qualificationSource` ENUM('LIVE_SESSION', 'SALES_CAMPAIGN', 'MANUAL_APPROVAL', 'OTHER') NOT NULL DEFAULT 'OTHER',
    `freightAmount` DECIMAL(10, 2) NOT NULL DEFAULT 0,
    `reviewStatus` ENUM('PENDING_REVIEW', 'APPROVED', 'REJECTED') NOT NULL DEFAULT 'PENDING_REVIEW',
    `shippingStatus` ENUM('PENDING', 'READY', 'SHIPPED', 'SIGNED', 'FINISHED', 'CANCELED') NOT NULL DEFAULT 'PENDING',
    `receiverInfo` TEXT NULL,
    `receiverName` VARCHAR(191) NULL,
    `receiverPhone` VARCHAR(191) NULL,
    `receiverAddress` VARCHAR(191) NULL,
    `remark` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `GiftRecord_customerId_createdAt_idx`(`customerId`, `createdAt`),
    INDEX `GiftRecord_leadId_idx`(`leadId`),
    INDEX `GiftRecord_liveSessionId_idx`(`liveSessionId`),
    INDEX `GiftRecord_salesId_idx`(`salesId`),
    INDEX `GiftRecord_reviewStatus_shippingStatus_idx`(`reviewStatus`, `shippingStatus`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ShippingTask` (
    `id` VARCHAR(191) NOT NULL,
    `customerId` VARCHAR(191) NOT NULL,
    `orderId` VARCHAR(191) NULL,
    `giftRecordId` VARCHAR(191) NULL,
    `assigneeId` VARCHAR(191) NULL,
    `status` ENUM('PENDING', 'PROCESSING', 'SHIPPED', 'COMPLETED', 'CANCELED') NOT NULL DEFAULT 'PENDING',
    `carrier` VARCHAR(191) NULL,
    `trackingNumber` VARCHAR(191) NULL,
    `content` TEXT NULL,
    `screenshotUrl` VARCHAR(191) NULL,
    `shippedAt` DATETIME(3) NULL,
    `completedAt` DATETIME(3) NULL,
    `remark` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `ShippingTask_orderId_key`(`orderId`),
    UNIQUE INDEX `ShippingTask_giftRecordId_key`(`giftRecordId`),
    INDEX `ShippingTask_customerId_status_createdAt_idx`(`customerId`, `status`, `createdAt`),
    INDEX `ShippingTask_assigneeId_status_createdAt_idx`(`assigneeId`, `status`, `createdAt`),
    INDEX `ShippingTask_trackingNumber_idx`(`trackingNumber`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `tag_groups` (
    `id` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `description` TEXT NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `tag_groups_code_key`(`code`),
    INDEX `tag_groups_isActive_sortOrder_idx`(`isActive`, `sortOrder`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `tag_categories` (
    `id` VARCHAR(191) NOT NULL,
    `groupId` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `description` TEXT NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `tag_categories_code_key`(`code`),
    INDEX `tag_categories_groupId_isActive_sortOrder_idx`(`groupId`, `isActive`, `sortOrder`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `tags` (
    `id` VARCHAR(191) NOT NULL,
    `groupId` VARCHAR(191) NOT NULL,
    `categoryId` VARCHAR(191) NULL,
    `code` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `color` VARCHAR(191) NULL,
    `description` TEXT NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `tags_code_key`(`code`),
    INDEX `tags_groupId_isActive_sortOrder_idx`(`groupId`, `isActive`, `sortOrder`),
    INDEX `tags_categoryId_isActive_sortOrder_idx`(`categoryId`, `isActive`, `sortOrder`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `customer_tags` (
    `id` VARCHAR(191) NOT NULL,
    `customerId` VARCHAR(191) NOT NULL,
    `tagId` VARCHAR(191) NOT NULL,
    `assignedById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `customer_tags_tagId_createdAt_idx`(`tagId`, `createdAt`),
    INDEX `customer_tags_assignedById_idx`(`assignedById`),
    UNIQUE INDEX `customer_tags_customerId_tagId_key`(`customerId`, `tagId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `lead_tags` (
    `id` VARCHAR(191) NOT NULL,
    `leadId` VARCHAR(191) NOT NULL,
    `tagId` VARCHAR(191) NOT NULL,
    `assignedById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `lead_tags_tagId_createdAt_idx`(`tagId`, `createdAt`),
    INDEX `lead_tags_assignedById_idx`(`assignedById`),
    UNIQUE INDEX `lead_tags_leadId_tagId_key`(`leadId`, `tagId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `lead_import_batches` (
    `id` VARCHAR(191) NOT NULL,
    `createdById` VARCHAR(191) NOT NULL,
    `templateId` VARCHAR(191) NULL,
    `fileName` VARCHAR(191) NOT NULL,
    `fileType` ENUM('CSV', 'XLS', 'XLSX') NOT NULL,
    `status` ENUM('DRAFT', 'IMPORTING', 'COMPLETED', 'FAILED') NOT NULL DEFAULT 'DRAFT',
    `defaultLeadSource` ENUM('INFO_FLOW') NOT NULL DEFAULT 'INFO_FLOW',
    `mappingConfig` JSON NULL,
    `headers` JSON NULL,
    `totalRows` INTEGER NOT NULL DEFAULT 0,
    `successRows` INTEGER NOT NULL DEFAULT 0,
    `failedRows` INTEGER NOT NULL DEFAULT 0,
    `duplicateRows` INTEGER NOT NULL DEFAULT 0,
    `createdCustomerRows` INTEGER NOT NULL DEFAULT 0,
    `matchedCustomerRows` INTEGER NOT NULL DEFAULT 0,
    `report` JSON NULL,
    `importedAt` DATETIME(3) NULL,
    `errorMessage` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `lead_import_batches_createdById_createdAt_idx`(`createdById`, `createdAt`),
    INDEX `lead_import_batches_status_createdAt_idx`(`status`, `createdAt`),
    INDEX `lead_import_batches_templateId_idx`(`templateId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `lead_import_rows` (
    `id` VARCHAR(191) NOT NULL,
    `batchId` VARCHAR(191) NOT NULL,
    `rowNumber` INTEGER NOT NULL,
    `status` ENUM('PENDING', 'IMPORTED', 'FAILED', 'DUPLICATE') NOT NULL DEFAULT 'PENDING',
    `phoneRaw` VARCHAR(191) NULL,
    `normalizedPhone` VARCHAR(191) NULL,
    `mappedName` VARCHAR(191) NULL,
    `errorReason` TEXT NULL,
    `rawData` JSON NOT NULL,
    `mappedData` JSON NULL,
    `dedupType` ENUM('EXISTING_LEAD', 'BATCH_DUPLICATE') NULL,
    `matchedLeadId` VARCHAR(191) NULL,
    `importedLeadId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `lead_import_rows_batchId_status_idx`(`batchId`, `status`),
    INDEX `lead_import_rows_normalizedPhone_idx`(`normalizedPhone`),
    UNIQUE INDEX `lead_import_rows_batchId_rowNumber_key`(`batchId`, `rowNumber`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `lead_import_templates` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `description` TEXT NULL,
    `mappingConfig` JSON NOT NULL,
    `defaultLeadSource` ENUM('INFO_FLOW') NOT NULL DEFAULT 'INFO_FLOW',
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `lead_import_templates_name_key`(`name`),
    INDEX `lead_import_templates_isActive_createdAt_idx`(`isActive`, `createdAt`),
    INDEX `lead_import_templates_createdById_idx`(`createdById`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `lead_dedup_logs` (
    `id` VARCHAR(191) NOT NULL,
    `batchId` VARCHAR(191) NOT NULL,
    `rowId` VARCHAR(191) NULL,
    `phone` VARCHAR(191) NOT NULL,
    `dedupType` ENUM('EXISTING_LEAD', 'BATCH_DUPLICATE') NOT NULL,
    `matchedLeadId` VARCHAR(191) NULL,
    `reason` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `lead_dedup_logs_batchId_createdAt_idx`(`batchId`, `createdAt`),
    INDEX `lead_dedup_logs_rowId_idx`(`rowId`),
    INDEX `lead_dedup_logs_phone_dedupType_idx`(`phone`, `dedupType`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `lead_customer_merge_logs` (
    `id` VARCHAR(191) NOT NULL,
    `batchId` VARCHAR(191) NOT NULL,
    `rowId` VARCHAR(191) NULL,
    `leadId` VARCHAR(191) NOT NULL,
    `customerId` VARCHAR(191) NOT NULL,
    `action` ENUM('CREATED_CUSTOMER', 'MATCHED_EXISTING_CUSTOMER') NOT NULL,
    `source` ENUM('INFO_FLOW') NOT NULL,
    `phone` VARCHAR(191) NOT NULL,
    `tagSynced` BOOLEAN NOT NULL DEFAULT false,
    `note` TEXT NULL,
    `actorId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `lead_customer_merge_logs_batchId_action_createdAt_idx`(`batchId`, `action`, `createdAt`),
    INDEX `lead_customer_merge_logs_rowId_idx`(`rowId`),
    INDEX `lead_customer_merge_logs_leadId_createdAt_idx`(`leadId`, `createdAt`),
    INDEX `lead_customer_merge_logs_customerId_createdAt_idx`(`customerId`, `createdAt`),
    INDEX `lead_customer_merge_logs_phone_createdAt_idx`(`phone`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `categories` (
    `id` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `description` TEXT NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `categories_code_key`(`code`),
    INDEX `categories_isActive_sortOrder_idx`(`isActive`, `sortOrder`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `dictionary_types` (
    `id` VARCHAR(191) NOT NULL,
    `categoryId` VARCHAR(191) NULL,
    `code` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `description` TEXT NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `dictionary_types_code_key`(`code`),
    INDEX `dictionary_types_categoryId_isActive_sortOrder_idx`(`categoryId`, `isActive`, `sortOrder`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `dictionary_items` (
    `id` VARCHAR(191) NOT NULL,
    `typeId` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `label` VARCHAR(191) NOT NULL,
    `value` VARCHAR(191) NOT NULL,
    `description` TEXT NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `dictionary_items_typeId_isActive_sortOrder_idx`(`typeId`, `isActive`, `sortOrder`),
    UNIQUE INDEX `dictionary_items_typeId_code_key`(`typeId`, `code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `OperationLog` (
    `id` VARCHAR(191) NOT NULL,
    `actorId` VARCHAR(191) NULL,
    `module` ENUM('USER', 'TEAM', 'ROLE', 'LEAD', 'LEAD_IMPORT', 'CUSTOMER', 'ASSIGNMENT', 'FOLLOW_UP', 'CALL', 'WECHAT', 'LIVE_SESSION', 'ORDER', 'GIFT', 'SHIPPING', 'MASTER_DATA', 'SYSTEM') NOT NULL,
    `action` VARCHAR(191) NOT NULL,
    `targetType` ENUM('USER', 'TEAM', 'ROLE', 'LEAD', 'LEAD_IMPORT_BATCH', 'LEAD_IMPORT_ROW', 'LEAD_IMPORT_TEMPLATE', 'LEAD_DEDUP_LOG', 'LEAD_CUSTOMER_MERGE_LOG', 'CUSTOMER', 'LEAD_ASSIGNMENT', 'FOLLOW_UP_TASK', 'CALL_RECORD', 'WECHAT_RECORD', 'LIVE_SESSION', 'LIVE_INVITATION', 'ORDER', 'GIFT_RECORD', 'SHIPPING_TASK', 'TAG_GROUP', 'TAG_CATEGORY', 'TAG', 'CATEGORY', 'DICTIONARY_TYPE', 'DICTIONARY_ITEM') NOT NULL,
    `targetId` VARCHAR(191) NOT NULL,
    `description` TEXT NULL,
    `beforeData` JSON NULL,
    `afterData` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `OperationLog_actorId_createdAt_idx`(`actorId`, `createdAt`),
    INDEX `OperationLog_module_createdAt_idx`(`module`, `createdAt`),
    INDEX `OperationLog_targetType_targetId_idx`(`targetType`, `targetId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `teams` ADD CONSTRAINT `teams_supervisorId_fkey` FOREIGN KEY (`supervisorId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `User` ADD CONSTRAINT `User_teamId_fkey` FOREIGN KEY (`teamId`) REFERENCES `teams`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `User` ADD CONSTRAINT `User_supervisorId_fkey` FOREIGN KEY (`supervisorId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `User` ADD CONSTRAINT `User_invitedById_fkey` FOREIGN KEY (`invitedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `User` ADD CONSTRAINT `User_disabledById_fkey` FOREIGN KEY (`disabledById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `User` ADD CONSTRAINT `User_roleId_fkey` FOREIGN KEY (`roleId`) REFERENCES `Role`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Lead` ADD CONSTRAINT `Lead_ownerId_fkey` FOREIGN KEY (`ownerId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Lead` ADD CONSTRAINT `Lead_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `Customer`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Customer` ADD CONSTRAINT `Customer_ownerId_fkey` FOREIGN KEY (`ownerId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LeadAssignment` ADD CONSTRAINT `LeadAssignment_leadId_fkey` FOREIGN KEY (`leadId`) REFERENCES `Lead`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LeadAssignment` ADD CONSTRAINT `LeadAssignment_fromUserId_fkey` FOREIGN KEY (`fromUserId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LeadAssignment` ADD CONSTRAINT `LeadAssignment_toUserId_fkey` FOREIGN KEY (`toUserId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LeadAssignment` ADD CONSTRAINT `LeadAssignment_assignedById_fkey` FOREIGN KEY (`assignedById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FollowUpTask` ADD CONSTRAINT `FollowUpTask_leadId_fkey` FOREIGN KEY (`leadId`) REFERENCES `Lead`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FollowUpTask` ADD CONSTRAINT `FollowUpTask_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `Customer`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FollowUpTask` ADD CONSTRAINT `FollowUpTask_ownerId_fkey` FOREIGN KEY (`ownerId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FollowUpTask` ADD CONSTRAINT `FollowUpTask_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CallRecord` ADD CONSTRAINT `CallRecord_leadId_fkey` FOREIGN KEY (`leadId`) REFERENCES `Lead`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CallRecord` ADD CONSTRAINT `CallRecord_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `Customer`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CallRecord` ADD CONSTRAINT `CallRecord_salesId_fkey` FOREIGN KEY (`salesId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `WechatRecord` ADD CONSTRAINT `WechatRecord_leadId_fkey` FOREIGN KEY (`leadId`) REFERENCES `Lead`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `WechatRecord` ADD CONSTRAINT `WechatRecord_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `Customer`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `WechatRecord` ADD CONSTRAINT `WechatRecord_salesId_fkey` FOREIGN KEY (`salesId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LiveSession` ADD CONSTRAINT `LiveSession_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LiveInvitation` ADD CONSTRAINT `LiveInvitation_liveSessionId_fkey` FOREIGN KEY (`liveSessionId`) REFERENCES `LiveSession`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LiveInvitation` ADD CONSTRAINT `LiveInvitation_leadId_fkey` FOREIGN KEY (`leadId`) REFERENCES `Lead`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LiveInvitation` ADD CONSTRAINT `LiveInvitation_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `Customer`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LiveInvitation` ADD CONSTRAINT `LiveInvitation_salesId_fkey` FOREIGN KEY (`salesId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Order` ADD CONSTRAINT `Order_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `Customer`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Order` ADD CONSTRAINT `Order_leadId_fkey` FOREIGN KEY (`leadId`) REFERENCES `Lead`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Order` ADD CONSTRAINT `Order_ownerId_fkey` FOREIGN KEY (`ownerId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `GiftRecord` ADD CONSTRAINT `GiftRecord_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `Customer`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `GiftRecord` ADD CONSTRAINT `GiftRecord_leadId_fkey` FOREIGN KEY (`leadId`) REFERENCES `Lead`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `GiftRecord` ADD CONSTRAINT `GiftRecord_liveSessionId_fkey` FOREIGN KEY (`liveSessionId`) REFERENCES `LiveSession`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `GiftRecord` ADD CONSTRAINT `GiftRecord_salesId_fkey` FOREIGN KEY (`salesId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ShippingTask` ADD CONSTRAINT `ShippingTask_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `Customer`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ShippingTask` ADD CONSTRAINT `ShippingTask_orderId_fkey` FOREIGN KEY (`orderId`) REFERENCES `Order`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ShippingTask` ADD CONSTRAINT `ShippingTask_giftRecordId_fkey` FOREIGN KEY (`giftRecordId`) REFERENCES `GiftRecord`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ShippingTask` ADD CONSTRAINT `ShippingTask_assigneeId_fkey` FOREIGN KEY (`assigneeId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `tag_categories` ADD CONSTRAINT `tag_categories_groupId_fkey` FOREIGN KEY (`groupId`) REFERENCES `tag_groups`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `tags` ADD CONSTRAINT `tags_groupId_fkey` FOREIGN KEY (`groupId`) REFERENCES `tag_groups`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `tags` ADD CONSTRAINT `tags_categoryId_fkey` FOREIGN KEY (`categoryId`) REFERENCES `tag_categories`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `customer_tags` ADD CONSTRAINT `customer_tags_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `Customer`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `customer_tags` ADD CONSTRAINT `customer_tags_tagId_fkey` FOREIGN KEY (`tagId`) REFERENCES `tags`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `customer_tags` ADD CONSTRAINT `customer_tags_assignedById_fkey` FOREIGN KEY (`assignedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `lead_tags` ADD CONSTRAINT `lead_tags_leadId_fkey` FOREIGN KEY (`leadId`) REFERENCES `Lead`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `lead_tags` ADD CONSTRAINT `lead_tags_tagId_fkey` FOREIGN KEY (`tagId`) REFERENCES `tags`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `lead_tags` ADD CONSTRAINT `lead_tags_assignedById_fkey` FOREIGN KEY (`assignedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `lead_import_batches` ADD CONSTRAINT `lead_import_batches_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `lead_import_batches` ADD CONSTRAINT `lead_import_batches_templateId_fkey` FOREIGN KEY (`templateId`) REFERENCES `lead_import_templates`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `lead_import_rows` ADD CONSTRAINT `lead_import_rows_batchId_fkey` FOREIGN KEY (`batchId`) REFERENCES `lead_import_batches`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `lead_import_templates` ADD CONSTRAINT `lead_import_templates_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `lead_dedup_logs` ADD CONSTRAINT `lead_dedup_logs_batchId_fkey` FOREIGN KEY (`batchId`) REFERENCES `lead_import_batches`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `lead_dedup_logs` ADD CONSTRAINT `lead_dedup_logs_rowId_fkey` FOREIGN KEY (`rowId`) REFERENCES `lead_import_rows`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `lead_customer_merge_logs` ADD CONSTRAINT `lead_customer_merge_logs_batchId_fkey` FOREIGN KEY (`batchId`) REFERENCES `lead_import_batches`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `lead_customer_merge_logs` ADD CONSTRAINT `lead_customer_merge_logs_rowId_fkey` FOREIGN KEY (`rowId`) REFERENCES `lead_import_rows`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `lead_customer_merge_logs` ADD CONSTRAINT `lead_customer_merge_logs_leadId_fkey` FOREIGN KEY (`leadId`) REFERENCES `Lead`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `lead_customer_merge_logs` ADD CONSTRAINT `lead_customer_merge_logs_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `Customer`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `dictionary_types` ADD CONSTRAINT `dictionary_types_categoryId_fkey` FOREIGN KEY (`categoryId`) REFERENCES `categories`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `dictionary_items` ADD CONSTRAINT `dictionary_items_typeId_fkey` FOREIGN KEY (`typeId`) REFERENCES `dictionary_types`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `OperationLog` ADD CONSTRAINT `OperationLog_actorId_fkey` FOREIGN KEY (`actorId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
