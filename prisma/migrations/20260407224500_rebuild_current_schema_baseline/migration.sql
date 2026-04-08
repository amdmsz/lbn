-- CreateTable
CREATE TABLE `call_result_settings` (
    `id` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `label` VARCHAR(191) NOT NULL,
    `description` TEXT NULL,
    `isSystem` BOOLEAN NOT NULL DEFAULT false,
    `isEnabled` BOOLEAN NOT NULL DEFAULT true,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `effectLevel` ENUM('STRONG', 'MEDIUM', 'WEAK', 'NEGATIVE') NOT NULL,
    `resetsPublicPoolClock` BOOLEAN NOT NULL DEFAULT false,
    `claimProtectionDays` INTEGER NOT NULL DEFAULT 0,
    `requiresSupervisorReview` BOOLEAN NOT NULL DEFAULT false,
    `wechatSyncAction` ENUM('NONE', 'PENDING', 'ADDED', 'REFUSED') NOT NULL DEFAULT 'NONE',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `call_result_settings_code_key`(`code` ASC),
    INDEX `call_result_settings_isEnabled_sortOrder_idx`(`isEnabled` ASC, `sortOrder` ASC),
    INDEX `call_result_settings_isSystem_sortOrder_idx`(`isSystem` ASC, `sortOrder` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `callrecord` (
    `id` VARCHAR(191) NOT NULL,
    `leadId` VARCHAR(191) NULL,
    `customerId` VARCHAR(191) NULL,
    `salesId` VARCHAR(191) NOT NULL,
    `callTime` DATETIME(3) NOT NULL,
    `durationSeconds` INTEGER NOT NULL DEFAULT 0,
    `result` ENUM('NOT_CONNECTED', 'INVALID_NUMBER', 'HUNG_UP', 'CONNECTED_NO_TALK', 'INTERESTED', 'WECHAT_PENDING', 'WECHAT_ADDED', 'REFUSED_WECHAT', 'NEED_CALLBACK', 'REFUSED_TO_BUY', 'BLACKLIST') NULL,
    `remark` TEXT NULL,
    `nextFollowUpAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `resultCode` VARCHAR(191) NULL,

    INDEX `CallRecord_customerId_callTime_idx`(`customerId` ASC, `callTime` ASC),
    INDEX `CallRecord_leadId_callTime_idx`(`leadId` ASC, `callTime` ASC),
    INDEX `CallRecord_resultCode_callTime_idx`(`resultCode` ASC, `callTime` ASC),
    INDEX `CallRecord_salesId_callTime_idx`(`salesId` ASC, `callTime` ASC),
    PRIMARY KEY (`id` ASC)
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

    UNIQUE INDEX `categories_code_key`(`code` ASC),
    INDEX `categories_isActive_sortOrder_idx`(`isActive` ASC, `sortOrder` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `codcollectionrecord` (
    `id` VARCHAR(191) NOT NULL,
    `paymentPlanId` VARCHAR(191) NOT NULL,
    `paymentRecordId` VARCHAR(191) NULL,
    `salesOrderId` VARCHAR(191) NOT NULL,
    `shippingTaskId` VARCHAR(191) NOT NULL,
    `customerId` VARCHAR(191) NOT NULL,
    `ownerId` VARCHAR(191) NULL,
    `status` ENUM('PENDING_COLLECTION', 'COLLECTED', 'EXCEPTION', 'REJECTED', 'UNCOLLECTED') NOT NULL DEFAULT 'PENDING_COLLECTION',
    `expectedAmount` DECIMAL(10, 2) NOT NULL,
    `collectedAmount` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    `occurredAt` DATETIME(3) NULL,
    `remark` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `tradeOrderId` VARCHAR(191) NULL,

    INDEX `CodCollectionRecord_customerId_status_createdAt_idx`(`customerId` ASC, `status` ASC, `createdAt` ASC),
    INDEX `CodCollectionRecord_ownerId_status_createdAt_idx`(`ownerId` ASC, `status` ASC, `createdAt` ASC),
    UNIQUE INDEX `CodCollectionRecord_paymentPlanId_key`(`paymentPlanId` ASC),
    UNIQUE INDEX `CodCollectionRecord_paymentRecordId_key`(`paymentRecordId` ASC),
    INDEX `CodCollectionRecord_salesOrderId_status_createdAt_idx`(`salesOrderId` ASC, `status` ASC, `createdAt` ASC),
    INDEX `CodCollectionRecord_shippingTaskId_status_createdAt_idx`(`shippingTaskId` ASC, `status` ASC, `createdAt` ASC),
    INDEX `codrec_trade_sales_created_idx`(`tradeOrderId` ASC, `salesOrderId` ASC, `status` ASC, `createdAt` ASC),
    INDEX `codrec_trade_ship_created_idx`(`tradeOrderId` ASC, `shippingTaskId` ASC, `status` ASC, `createdAt` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `collectiontask` (
    `id` VARCHAR(191) NOT NULL,
    `paymentPlanId` VARCHAR(191) NOT NULL,
    `sourceType` ENUM('SALES_ORDER', 'GIFT_RECORD') NOT NULL,
    `salesOrderId` VARCHAR(191) NULL,
    `giftRecordId` VARCHAR(191) NULL,
    `shippingTaskId` VARCHAR(191) NULL,
    `customerId` VARCHAR(191) NOT NULL,
    `ownerId` VARCHAR(191) NOT NULL,
    `taskType` ENUM('BALANCE_COLLECTION', 'COD_COLLECTION', 'FREIGHT_COLLECTION', 'GENERAL_COLLECTION') NOT NULL,
    `status` ENUM('PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELED') NOT NULL DEFAULT 'PENDING',
    `dueAt` DATETIME(3) NULL,
    `nextFollowUpAt` DATETIME(3) NULL,
    `lastContactAt` DATETIME(3) NULL,
    `closedAt` DATETIME(3) NULL,
    `remark` TEXT NULL,
    `createdById` VARCHAR(191) NULL,
    `updatedById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `tradeOrderId` VARCHAR(191) NULL,

    INDEX `CollectionTask_createdById_fkey`(`createdById` ASC),
    INDEX `CollectionTask_customerId_status_dueAt_idx`(`customerId` ASC, `status` ASC, `dueAt` ASC),
    INDEX `CollectionTask_giftRecordId_status_dueAt_idx`(`giftRecordId` ASC, `status` ASC, `dueAt` ASC),
    INDEX `CollectionTask_ownerId_status_dueAt_idx`(`ownerId` ASC, `status` ASC, `dueAt` ASC),
    INDEX `CollectionTask_paymentPlanId_status_dueAt_idx`(`paymentPlanId` ASC, `status` ASC, `dueAt` ASC),
    INDEX `CollectionTask_salesOrderId_status_dueAt_idx`(`salesOrderId` ASC, `status` ASC, `dueAt` ASC),
    INDEX `CollectionTask_shippingTaskId_status_dueAt_idx`(`shippingTaskId` ASC, `status` ASC, `dueAt` ASC),
    INDEX `CollectionTask_sourceType_status_dueAt_idx`(`sourceType` ASC, `status` ASC, `dueAt` ASC),
    INDEX `CollectionTask_updatedById_fkey`(`updatedById` ASC),
    INDEX `coltask_trade_sales_due_idx`(`tradeOrderId` ASC, `salesOrderId` ASC, `status` ASC, `dueAt` ASC),
    INDEX `coltask_trade_source_due_idx`(`tradeOrderId` ASC, `sourceType` ASC, `status` ASC, `dueAt` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `customer` (
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
    `claimLockedUntil` DATETIME(3) NULL,
    `lastEffectiveFollowUpAt` DATETIME(3) NULL,
    `lastOwnerId` VARCHAR(191) NULL,
    `ownershipMode` ENUM('PRIVATE', 'PUBLIC', 'LOCKED') NOT NULL DEFAULT 'PRIVATE',
    `publicPoolEnteredAt` DATETIME(3) NULL,
    `publicPoolReason` ENUM('UNASSIGNED_IMPORT', 'MANUAL_RELEASE', 'INACTIVE_RECYCLE', 'OWNER_LEFT_TEAM', 'BATCH_REALLOCATION', 'MERGE_RELEASE', 'INVALID_FOLLOWUP_RECYCLE') NULL,
    `publicPoolTeamId` VARCHAR(191) NULL,

    INDEX `Customer_claimLockedUntil_idx`(`claimLockedUntil` ASC),
    INDEX `Customer_createdAt_idx`(`createdAt` ASC),
    INDEX `Customer_lastEffectiveFollowUpAt_idx`(`lastEffectiveFollowUpAt` ASC),
    INDEX `Customer_lastOwnerId_idx`(`lastOwnerId` ASC),
    INDEX `Customer_ownerId_idx`(`ownerId` ASC),
    INDEX `Customer_ownershipMode_ownerId_idx`(`ownershipMode` ASC, `ownerId` ASC),
    UNIQUE INDEX `Customer_phone_key`(`phone` ASC),
    INDEX `Customer_status_idx`(`status` ASC),
    INDEX `cust_pool_reason_entered_idx`(`publicPoolReason` ASC, `publicPoolEnteredAt` ASC),
    INDEX `cust_pool_team_mode_entered_idx`(`publicPoolTeamId` ASC, `ownershipMode` ASC, `publicPoolEnteredAt` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `customer_tags` (
    `id` VARCHAR(191) NOT NULL,
    `customerId` VARCHAR(191) NOT NULL,
    `tagId` VARCHAR(191) NOT NULL,
    `assignedById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `customer_tags_assignedById_idx`(`assignedById` ASC),
    UNIQUE INDEX `customer_tags_customerId_tagId_key`(`customerId` ASC, `tagId` ASC),
    INDEX `customer_tags_tagId_createdAt_idx`(`tagId` ASC, `createdAt` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `customerownershipevent` (
    `id` VARCHAR(191) NOT NULL,
    `customerId` VARCHAR(191) NOT NULL,
    `fromOwnerId` VARCHAR(191) NULL,
    `toOwnerId` VARCHAR(191) NULL,
    `fromOwnershipMode` ENUM('PRIVATE', 'PUBLIC', 'LOCKED') NULL,
    `toOwnershipMode` ENUM('PRIVATE', 'PUBLIC', 'LOCKED') NOT NULL,
    `reason` ENUM('UNASSIGNED_IMPORT', 'MANUAL_RELEASE', 'INACTIVE_RECYCLE', 'OWNER_LEFT_TEAM', 'BATCH_REALLOCATION', 'MERGE_RELEASE', 'INVALID_FOLLOWUP_RECYCLE', 'SALES_CLAIM', 'SUPERVISOR_ASSIGN', 'AUTO_ASSIGN', 'TEAM_TRANSFER', 'OWNER_RESTORE') NOT NULL,
    `actorId` VARCHAR(191) NULL,
    `teamId` VARCHAR(191) NULL,
    `note` TEXT NULL,
    `effectiveFollowUpAt` DATETIME(3) NULL,
    `claimLockedUntil` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `CustomerOwnershipEvent_actorId_createdAt_idx`(`actorId` ASC, `createdAt` ASC),
    INDEX `CustomerOwnershipEvent_customerId_createdAt_idx`(`customerId` ASC, `createdAt` ASC),
    INDEX `CustomerOwnershipEvent_fromOwnerId_fkey`(`fromOwnerId` ASC),
    INDEX `CustomerOwnershipEvent_reason_createdAt_idx`(`reason` ASC, `createdAt` ASC),
    INDEX `CustomerOwnershipEvent_teamId_createdAt_idx`(`teamId` ASC, `createdAt` ASC),
    INDEX `CustomerOwnershipEvent_toOwnerId_fkey`(`toOwnerId` ASC),
    PRIMARY KEY (`id` ASC)
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

    UNIQUE INDEX `dictionary_items_typeId_code_key`(`typeId` ASC, `code` ASC),
    INDEX `dictionary_items_typeId_isActive_sortOrder_idx`(`typeId` ASC, `isActive` ASC, `sortOrder` ASC),
    PRIMARY KEY (`id` ASC)
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

    INDEX `dictionary_types_categoryId_isActive_sortOrder_idx`(`categoryId` ASC, `isActive` ASC, `sortOrder` ASC),
    UNIQUE INDEX `dictionary_types_code_key`(`code` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `followuptask` (
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

    INDEX `FollowUpTask_createdById_fkey`(`createdById` ASC),
    INDEX `FollowUpTask_customerId_status_dueAt_idx`(`customerId` ASC, `status` ASC, `dueAt` ASC),
    INDEX `FollowUpTask_leadId_status_dueAt_idx`(`leadId` ASC, `status` ASC, `dueAt` ASC),
    INDEX `FollowUpTask_ownerId_status_dueAt_idx`(`ownerId` ASC, `status` ASC, `dueAt` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `giftrecord` (
    `id` VARCHAR(191) NOT NULL,
    `customerId` VARCHAR(191) NOT NULL,
    `leadId` VARCHAR(191) NULL,
    `liveSessionId` VARCHAR(191) NULL,
    `salesId` VARCHAR(191) NULL,
    `giftName` VARCHAR(191) NOT NULL,
    `qualificationSource` ENUM('LIVE_SESSION', 'SALES_CAMPAIGN', 'MANUAL_APPROVAL', 'OTHER') NOT NULL DEFAULT 'OTHER',
    `freightAmount` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    `reviewStatus` ENUM('PENDING_REVIEW', 'APPROVED', 'REJECTED') NOT NULL DEFAULT 'PENDING_REVIEW',
    `shippingStatus` ENUM('PENDING', 'READY', 'SHIPPED', 'SIGNED', 'FINISHED', 'CANCELED') NOT NULL DEFAULT 'PENDING',
    `receiverName` VARCHAR(191) NULL,
    `receiverPhone` VARCHAR(191) NULL,
    `receiverAddress` VARCHAR(191) NULL,
    `remark` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `receiverInfo` TEXT NULL,

    INDEX `GiftRecord_customerId_createdAt_idx`(`customerId` ASC, `createdAt` ASC),
    INDEX `GiftRecord_leadId_idx`(`leadId` ASC),
    INDEX `GiftRecord_liveSessionId_idx`(`liveSessionId` ASC),
    INDEX `GiftRecord_reviewStatus_shippingStatus_idx`(`reviewStatus` ASC, `shippingStatus` ASC),
    INDEX `GiftRecord_salesId_idx`(`salesId` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `lead` (
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

    INDEX `Lead_createdAt_idx`(`createdAt` ASC),
    INDEX `Lead_customerId_idx`(`customerId` ASC),
    INDEX `Lead_nextFollowUpAt_idx`(`nextFollowUpAt` ASC),
    INDEX `Lead_ownerId_idx`(`ownerId` ASC),
    INDEX `Lead_phone_idx`(`phone` ASC),
    INDEX `Lead_status_idx`(`status` ASC),
    PRIMARY KEY (`id` ASC)
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

    INDEX `lead_customer_merge_logs_batchId_action_createdAt_idx`(`batchId` ASC, `action` ASC, `createdAt` ASC),
    INDEX `lead_customer_merge_logs_customerId_createdAt_idx`(`customerId` ASC, `createdAt` ASC),
    INDEX `lead_customer_merge_logs_leadId_createdAt_idx`(`leadId` ASC, `createdAt` ASC),
    INDEX `lead_customer_merge_logs_phone_createdAt_idx`(`phone` ASC, `createdAt` ASC),
    INDEX `lead_customer_merge_logs_rowId_idx`(`rowId` ASC),
    PRIMARY KEY (`id` ASC)
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

    INDEX `lead_dedup_logs_batchId_createdAt_idx`(`batchId` ASC, `createdAt` ASC),
    INDEX `lead_dedup_logs_phone_dedupType_idx`(`phone` ASC, `dedupType` ASC),
    INDEX `lead_dedup_logs_rowId_idx`(`rowId` ASC),
    PRIMARY KEY (`id` ASC)
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
    `report` JSON NULL,
    `importedAt` DATETIME(3) NULL,
    `errorMessage` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `createdCustomerRows` INTEGER NOT NULL DEFAULT 0,
    `matchedCustomerRows` INTEGER NOT NULL DEFAULT 0,

    INDEX `lead_import_batches_createdById_createdAt_idx`(`createdById` ASC, `createdAt` ASC),
    INDEX `lead_import_batches_status_createdAt_idx`(`status` ASC, `createdAt` ASC),
    INDEX `lead_import_batches_templateId_idx`(`templateId` ASC),
    PRIMARY KEY (`id` ASC)
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

    UNIQUE INDEX `lead_import_rows_batchId_rowNumber_key`(`batchId` ASC, `rowNumber` ASC),
    INDEX `lead_import_rows_batchId_status_idx`(`batchId` ASC, `status` ASC),
    INDEX `lead_import_rows_normalizedPhone_idx`(`normalizedPhone` ASC),
    PRIMARY KEY (`id` ASC)
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

    INDEX `lead_import_templates_createdById_idx`(`createdById` ASC),
    INDEX `lead_import_templates_isActive_createdAt_idx`(`isActive` ASC, `createdAt` ASC),
    UNIQUE INDEX `lead_import_templates_name_key`(`name` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `lead_tags` (
    `id` VARCHAR(191) NOT NULL,
    `leadId` VARCHAR(191) NOT NULL,
    `tagId` VARCHAR(191) NOT NULL,
    `assignedById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `lead_tags_assignedById_idx`(`assignedById` ASC),
    UNIQUE INDEX `lead_tags_leadId_tagId_key`(`leadId` ASC, `tagId` ASC),
    INDEX `lead_tags_tagId_createdAt_idx`(`tagId` ASC, `createdAt` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `leadassignment` (
    `id` VARCHAR(191) NOT NULL,
    `leadId` VARCHAR(191) NOT NULL,
    `fromUserId` VARCHAR(191) NULL,
    `toUserId` VARCHAR(191) NOT NULL,
    `assignedById` VARCHAR(191) NOT NULL,
    `assignmentType` ENUM('MANUAL', 'BATCH', 'RECYCLE', 'REASSIGN') NOT NULL DEFAULT 'MANUAL',
    `note` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `LeadAssignment_assignedById_fkey`(`assignedById` ASC),
    INDEX `LeadAssignment_fromUserId_fkey`(`fromUserId` ASC),
    INDEX `LeadAssignment_leadId_createdAt_idx`(`leadId` ASC, `createdAt` ASC),
    INDEX `LeadAssignment_toUserId_createdAt_idx`(`toUserId` ASC, `createdAt` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `liveinvitation` (
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

    INDEX `LiveInvitation_customerId_idx`(`customerId` ASC),
    INDEX `LiveInvitation_leadId_idx`(`leadId` ASC),
    INDEX `LiveInvitation_liveSessionId_salesId_idx`(`liveSessionId` ASC, `salesId` ASC),
    INDEX `LiveInvitation_salesId_fkey`(`salesId` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `livesession` (
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

    INDEX `LiveSession_createdById_idx`(`createdById` ASC),
    INDEX `LiveSession_status_startAt_idx`(`status` ASC, `startAt` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `logisticsfollowuptask` (
    `id` VARCHAR(191) NOT NULL,
    `salesOrderId` VARCHAR(191) NOT NULL,
    `shippingTaskId` VARCHAR(191) NOT NULL,
    `customerId` VARCHAR(191) NOT NULL,
    `ownerId` VARCHAR(191) NOT NULL,
    `status` ENUM('PENDING', 'IN_PROGRESS', 'DONE', 'CANCELED') NOT NULL DEFAULT 'PENDING',
    `intervalDays` INTEGER NOT NULL DEFAULT 2,
    `nextTriggerAt` DATETIME(3) NOT NULL,
    `lastTriggeredAt` DATETIME(3) NULL,
    `lastFollowedUpAt` DATETIME(3) NULL,
    `closedAt` DATETIME(3) NULL,
    `remark` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `tradeOrderId` VARCHAR(191) NULL,

    INDEX `LogisticsFollowUpTask_customerId_status_nextTriggerAt_idx`(`customerId` ASC, `status` ASC, `nextTriggerAt` ASC),
    INDEX `LogisticsFollowUpTask_ownerId_status_nextTriggerAt_idx`(`ownerId` ASC, `status` ASC, `nextTriggerAt` ASC),
    INDEX `LogisticsFollowUpTask_salesOrderId_status_nextTriggerAt_idx`(`salesOrderId` ASC, `status` ASC, `nextTriggerAt` ASC),
    INDEX `LogisticsFollowUpTask_shippingTaskId_status_nextTriggerAt_idx`(`shippingTaskId` ASC, `status` ASC, `nextTriggerAt` ASC),
    INDEX `lgfollow_trade_sales_next_idx`(`tradeOrderId` ASC, `salesOrderId` ASC, `status` ASC, `nextTriggerAt` ASC),
    INDEX `lgfollow_trade_ship_next_idx`(`tradeOrderId` ASC, `shippingTaskId` ASC, `status` ASC, `nextTriggerAt` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `operationlog` (
    `id` VARCHAR(191) NOT NULL,
    `actorId` VARCHAR(191) NULL,
    `module` ENUM('USER', 'TEAM', 'ROLE', 'LEAD', 'LEAD_IMPORT', 'CUSTOMER', 'ASSIGNMENT', 'FOLLOW_UP', 'CALL', 'WECHAT', 'LIVE_SESSION', 'ORDER', 'GIFT', 'SHIPPING', 'SUPPLIER', 'PRODUCT', 'SALES_ORDER', 'SHIPPING_EXPORT', 'LOGISTICS', 'PAYMENT', 'COLLECTION', 'MASTER_DATA', 'SYSTEM') NOT NULL,
    `action` VARCHAR(191) NOT NULL,
    `targetType` ENUM('USER', 'TEAM', 'ROLE', 'LEAD', 'LEAD_IMPORT_BATCH', 'LEAD_IMPORT_ROW', 'LEAD_IMPORT_TEMPLATE', 'LEAD_DEDUP_LOG', 'LEAD_CUSTOMER_MERGE_LOG', 'CUSTOMER', 'LEAD_ASSIGNMENT', 'FOLLOW_UP_TASK', 'CALL_RECORD', 'WECHAT_RECORD', 'LIVE_SESSION', 'LIVE_INVITATION', 'ORDER', 'GIFT_RECORD', 'SHIPPING_TASK', 'SUPPLIER', 'PRODUCT', 'PRODUCT_SKU', 'SALES_ORDER', 'SALES_ORDER_ITEM', 'SALES_ORDER_GIFT_ITEM', 'TRADE_ORDER', 'TRADE_ORDER_ITEM', 'TRADE_ORDER_ITEM_COMPONENT', 'PRODUCT_BUNDLE', 'PRODUCT_BUNDLE_ITEM', 'SHIPPING_EXPORT_BATCH', 'SHIPPING_EXPORT_LINE', 'LOGISTICS_FOLLOW_UP_TASK', 'COD_COLLECTION_RECORD', 'PAYMENT_PLAN', 'PAYMENT_RECORD', 'COLLECTION_TASK', 'TAG_GROUP', 'TAG_CATEGORY', 'TAG', 'CATEGORY', 'DICTIONARY_TYPE', 'DICTIONARY_ITEM', 'CALL_RESULT_SETTING') NOT NULL,
    `targetId` VARCHAR(191) NOT NULL,
    `description` TEXT NULL,
    `beforeData` JSON NULL,
    `afterData` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `OperationLog_actorId_createdAt_idx`(`actorId` ASC, `createdAt` ASC),
    INDEX `OperationLog_module_createdAt_idx`(`module` ASC, `createdAt` ASC),
    INDEX `OperationLog_targetType_targetId_idx`(`targetType` ASC, `targetId` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `order` (
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
    `remark` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `trackingNumber` VARCHAR(191) NULL,

    INDEX `Order_customerId_createdAt_idx`(`customerId` ASC, `createdAt` ASC),
    INDEX `Order_leadId_idx`(`leadId` ASC),
    INDEX `Order_ownerId_idx`(`ownerId` ASC),
    INDEX `Order_status_paymentStatus_shippingStatus_idx`(`status` ASC, `paymentStatus` ASC, `shippingStatus` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `paymentplan` (
    `id` VARCHAR(191) NOT NULL,
    `sourceType` ENUM('SALES_ORDER', 'GIFT_RECORD') NOT NULL,
    `salesOrderId` VARCHAR(191) NULL,
    `giftRecordId` VARCHAR(191) NULL,
    `shippingTaskId` VARCHAR(191) NULL,
    `customerId` VARCHAR(191) NULL,
    `ownerId` VARCHAR(191) NULL,
    `subjectType` ENUM('GOODS', 'FREIGHT') NOT NULL,
    `stageType` ENUM('FULL', 'DEPOSIT', 'BALANCE') NOT NULL,
    `collectionChannel` ENUM('PREPAID', 'COD') NOT NULL,
    `plannedAmount` DECIMAL(10, 2) NOT NULL,
    `submittedAmount` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    `confirmedAmount` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    `remainingAmount` DECIMAL(10, 2) NOT NULL,
    `dueAt` DATETIME(3) NULL,
    `status` ENUM('PENDING', 'SUBMITTED', 'PARTIALLY_COLLECTED', 'COLLECTED', 'CANCELED') NOT NULL DEFAULT 'PENDING',
    `sequence` INTEGER NOT NULL DEFAULT 1,
    `remark` TEXT NULL,
    `createdById` VARCHAR(191) NULL,
    `updatedById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `tradeOrderId` VARCHAR(191) NULL,

    INDEX `PaymentPlan_createdById_fkey`(`createdById` ASC),
    INDEX `PaymentPlan_customerId_status_dueAt_idx`(`customerId` ASC, `status` ASC, `dueAt` ASC),
    INDEX `PaymentPlan_giftRecordId_status_dueAt_idx`(`giftRecordId` ASC, `status` ASC, `dueAt` ASC),
    INDEX `PaymentPlan_ownerId_status_dueAt_idx`(`ownerId` ASC, `status` ASC, `dueAt` ASC),
    INDEX `PaymentPlan_salesOrderId_status_dueAt_idx`(`salesOrderId` ASC, `status` ASC, `dueAt` ASC),
    INDEX `PaymentPlan_shippingTaskId_status_dueAt_idx`(`shippingTaskId` ASC, `status` ASC, `dueAt` ASC),
    INDEX `PaymentPlan_sourceType_createdAt_idx`(`sourceType` ASC, `createdAt` ASC),
    INDEX `PaymentPlan_updatedById_fkey`(`updatedById` ASC),
    INDEX `payplan_trade_sales_due_idx`(`tradeOrderId` ASC, `salesOrderId` ASC, `status` ASC, `dueAt` ASC),
    INDEX `payplan_trade_source_due_idx`(`tradeOrderId` ASC, `sourceType` ASC, `status` ASC, `dueAt` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `paymentrecord` (
    `id` VARCHAR(191) NOT NULL,
    `paymentPlanId` VARCHAR(191) NOT NULL,
    `sourceType` ENUM('SALES_ORDER', 'GIFT_RECORD') NOT NULL,
    `salesOrderId` VARCHAR(191) NULL,
    `giftRecordId` VARCHAR(191) NULL,
    `shippingTaskId` VARCHAR(191) NULL,
    `customerId` VARCHAR(191) NULL,
    `ownerId` VARCHAR(191) NULL,
    `amount` DECIMAL(10, 2) NOT NULL,
    `channel` ENUM('ORDER_FORM_DECLARED', 'BANK_TRANSFER', 'WECHAT_TRANSFER', 'ALIPAY_TRANSFER', 'COD', 'CASH', 'OTHER') NOT NULL,
    `status` ENUM('SUBMITTED', 'CONFIRMED', 'REJECTED') NOT NULL DEFAULT 'SUBMITTED',
    `occurredAt` DATETIME(3) NOT NULL,
    `submittedById` VARCHAR(191) NOT NULL,
    `confirmedById` VARCHAR(191) NULL,
    `confirmedAt` DATETIME(3) NULL,
    `referenceNo` VARCHAR(191) NULL,
    `remark` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `tradeOrderId` VARCHAR(191) NULL,

    INDEX `PaymentRecord_confirmedById_status_occurredAt_idx`(`confirmedById` ASC, `status` ASC, `occurredAt` ASC),
    INDEX `PaymentRecord_customerId_status_occurredAt_idx`(`customerId` ASC, `status` ASC, `occurredAt` ASC),
    INDEX `PaymentRecord_giftRecordId_status_occurredAt_idx`(`giftRecordId` ASC, `status` ASC, `occurredAt` ASC),
    INDEX `PaymentRecord_ownerId_status_occurredAt_idx`(`ownerId` ASC, `status` ASC, `occurredAt` ASC),
    INDEX `PaymentRecord_paymentPlanId_status_occurredAt_idx`(`paymentPlanId` ASC, `status` ASC, `occurredAt` ASC),
    INDEX `PaymentRecord_salesOrderId_status_occurredAt_idx`(`salesOrderId` ASC, `status` ASC, `occurredAt` ASC),
    INDEX `PaymentRecord_shippingTaskId_status_occurredAt_idx`(`shippingTaskId` ASC, `status` ASC, `occurredAt` ASC),
    INDEX `PaymentRecord_sourceType_occurredAt_idx`(`sourceType` ASC, `occurredAt` ASC),
    INDEX `PaymentRecord_submittedById_status_occurredAt_idx`(`submittedById` ASC, `status` ASC, `occurredAt` ASC),
    INDEX `payrec_trade_sales_occ_idx`(`tradeOrderId` ASC, `salesOrderId` ASC, `status` ASC, `occurredAt` ASC),
    INDEX `payrec_trade_source_occ_idx`(`tradeOrderId` ASC, `sourceType` ASC, `status` ASC, `occurredAt` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `product` (
    `id` VARCHAR(191) NOT NULL,
    `supplierId` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `description` TEXT NULL,
    `enabled` BOOLEAN NOT NULL DEFAULT true,
    `createdById` VARCHAR(191) NULL,
    `updatedById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Product_code_key`(`code` ASC),
    INDEX `Product_createdById_fkey`(`createdById` ASC),
    INDEX `Product_supplierId_enabled_createdAt_idx`(`supplierId` ASC, `enabled` ASC, `createdAt` ASC),
    INDEX `Product_updatedById_fkey`(`updatedById` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `productbundle` (
    `id` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `bundleType` ENUM('STANDARD', 'LIVE_SESSION', 'CAMPAIGN') NOT NULL DEFAULT 'STANDARD',
    `status` ENUM('DRAFT', 'ACTIVE', 'INACTIVE', 'ARCHIVED') NOT NULL DEFAULT 'DRAFT',
    `enabled` BOOLEAN NOT NULL DEFAULT true,
    `description` TEXT NULL,
    `defaultBundlePrice` DECIMAL(10, 2) NULL,
    `version` INTEGER NOT NULL DEFAULT 1,
    `createdById` VARCHAR(191) NULL,
    `updatedById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `ProductBundle_code_key`(`code` ASC),
    INDEX `ProductBundle_status_enabled_createdAt_idx`(`status` ASC, `enabled` ASC, `createdAt` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `productbundleitem` (
    `id` VARCHAR(191) NOT NULL,
    `bundleId` VARCHAR(191) NOT NULL,
    `lineNo` INTEGER NOT NULL,
    `supplierId` VARCHAR(191) NOT NULL,
    `productId` VARCHAR(191) NOT NULL,
    `skuId` VARCHAR(191) NOT NULL,
    `qty` INTEGER NOT NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `enabled` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `ProductBundleItem_bundleId_lineNo_key`(`bundleId` ASC, `lineNo` ASC),
    INDEX `ProductBundleItem_bundleId_sortOrder_idx`(`bundleId` ASC, `sortOrder` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `productsku` (
    `id` VARCHAR(191) NOT NULL,
    `productId` VARCHAR(191) NOT NULL,
    `skuCode` VARCHAR(191) NOT NULL,
    `skuName` VARCHAR(191) NOT NULL,
    `specText` VARCHAR(191) NOT NULL,
    `unit` VARCHAR(191) NOT NULL,
    `defaultUnitPrice` DECIMAL(10, 2) NOT NULL,
    `codSupported` BOOLEAN NOT NULL DEFAULT false,
    `insuranceSupported` BOOLEAN NOT NULL DEFAULT false,
    `defaultInsuranceAmount` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    `enabled` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `ProductSku_productId_enabled_createdAt_idx`(`productId` ASC, `enabled` ASC, `createdAt` ASC),
    UNIQUE INDEX `ProductSku_skuCode_key`(`skuCode` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `role` (
    `id` VARCHAR(191) NOT NULL,
    `code` ENUM('ADMIN', 'SUPERVISOR', 'SALES', 'OPS', 'SHIPPER') NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `description` VARCHAR(191) NULL,
    `isSystem` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Role_code_key`(`code` ASC),
    UNIQUE INDEX `Role_name_key`(`name` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `salesorder` (
    `id` VARCHAR(191) NOT NULL,
    `orderNo` VARCHAR(191) NOT NULL,
    `customerId` VARCHAR(191) NOT NULL,
    `ownerId` VARCHAR(191) NULL,
    `supplierId` VARCHAR(191) NOT NULL,
    `reviewStatus` ENUM('PENDING_REVIEW', 'APPROVED', 'REJECTED') NOT NULL DEFAULT 'PENDING_REVIEW',
    `paymentMode` ENUM('DEPOSIT', 'FULL_PAYMENT', 'COD') NOT NULL,
    `goodsAmount` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    `discountAmount` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    `finalAmount` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    `paidAmount` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    `remainingAmount` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    `codAmount` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    `insuranceRequired` BOOLEAN NOT NULL DEFAULT false,
    `insuranceAmount` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    `discountReason` TEXT NULL,
    `receiverNameSnapshot` VARCHAR(191) NOT NULL,
    `receiverPhoneSnapshot` VARCHAR(191) NOT NULL,
    `receiverAddressSnapshot` TEXT NOT NULL,
    `reviewerId` VARCHAR(191) NULL,
    `reviewedAt` DATETIME(3) NULL,
    `rejectReason` TEXT NULL,
    `remark` TEXT NULL,
    `createdById` VARCHAR(191) NULL,
    `updatedById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `paymentScheme` ENUM('FULL_PREPAID', 'DEPOSIT_PLUS_BALANCE', 'FULL_COD', 'DEPOSIT_PLUS_COD') NOT NULL DEFAULT 'FULL_PREPAID',
    `listAmount` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    `dealAmount` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    `depositAmount` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    `collectedAmount` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    `tradeOrderId` VARCHAR(191) NULL,
    `subOrderNo` VARCHAR(191) NULL,
    `supplierSequence` INTEGER NULL,
    `subOrderStatus` ENUM('PENDING_PARENT_REVIEW', 'READY_FOR_FULFILLMENT', 'IN_FULFILLMENT', 'COMPLETED', 'CANCELED') NULL,

    INDEX `SalesOrder_createdById_fkey`(`createdById` ASC),
    INDEX `SalesOrder_customerId_createdAt_idx`(`customerId` ASC, `createdAt` ASC),
    UNIQUE INDEX `SalesOrder_orderNo_key`(`orderNo` ASC),
    INDEX `SalesOrder_ownerId_reviewStatus_createdAt_idx`(`ownerId` ASC, `reviewStatus` ASC, `createdAt` ASC),
    INDEX `SalesOrder_paymentMode_createdAt_idx`(`paymentMode` ASC, `createdAt` ASC),
    INDEX `SalesOrder_paymentScheme_createdAt_idx`(`paymentScheme` ASC, `createdAt` ASC),
    INDEX `SalesOrder_reviewStatus_createdAt_idx`(`reviewStatus` ASC, `createdAt` ASC),
    INDEX `SalesOrder_reviewerId_fkey`(`reviewerId` ASC),
    INDEX `SalesOrder_supplierId_reviewStatus_createdAt_idx`(`supplierId` ASC, `reviewStatus` ASC, `createdAt` ASC),
    INDEX `SalesOrder_tradeOrderId_createdAt_idx`(`tradeOrderId` ASC, `createdAt` ASC),
    UNIQUE INDEX `SalesOrder_tradeOrderId_supplierId_key`(`tradeOrderId` ASC, `supplierId` ASC),
    INDEX `SalesOrder_updatedById_fkey`(`updatedById` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `salesordergiftitem` (
    `id` VARCHAR(191) NOT NULL,
    `salesOrderId` VARCHAR(191) NOT NULL,
    `giftName` VARCHAR(191) NOT NULL,
    `qty` INTEGER NOT NULL DEFAULT 1,
    `remark` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `SalesOrderGiftItem_salesOrderId_createdAt_idx`(`salesOrderId` ASC, `createdAt` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `salesorderitem` (
    `id` VARCHAR(191) NOT NULL,
    `salesOrderId` VARCHAR(191) NOT NULL,
    `productId` VARCHAR(191) NOT NULL,
    `skuId` VARCHAR(191) NOT NULL,
    `productNameSnapshot` VARCHAR(191) NOT NULL,
    `skuNameSnapshot` VARCHAR(191) NOT NULL,
    `specSnapshot` VARCHAR(191) NOT NULL,
    `unitSnapshot` VARCHAR(191) NOT NULL,
    `listPriceSnapshot` DECIMAL(10, 2) NOT NULL,
    `dealPriceSnapshot` DECIMAL(10, 2) NOT NULL,
    `qty` INTEGER NOT NULL,
    `subtotal` DECIMAL(10, 2) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `tradeOrderId` VARCHAR(191) NULL,
    `tradeOrderItemId` VARCHAR(191) NULL,
    `tradeOrderItemComponentId` VARCHAR(191) NULL,
    `lineNo` INTEGER NULL,
    `itemTypeSnapshot` ENUM('SKU', 'BUNDLE', 'GIFT') NULL,
    `titleSnapshot` VARCHAR(191) NULL,
    `exportDisplayNameSnapshot` VARCHAR(191) NULL,
    `discountAmount` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,

    INDEX `SalesOrderItem_productId_idx`(`productId` ASC),
    INDEX `SalesOrderItem_salesOrderId_createdAt_idx`(`salesOrderId` ASC, `createdAt` ASC),
    INDEX `SalesOrderItem_skuId_idx`(`skuId` ASC),
    INDEX `SalesOrderItem_tradeOrderId_salesOrderId_idx`(`tradeOrderId` ASC, `salesOrderId` ASC),
    INDEX `SalesOrderItem_tradeOrderItemComponentId_idx`(`tradeOrderItemComponentId` ASC),
    INDEX `SalesOrderItem_tradeOrderItemId_idx`(`tradeOrderItemId` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `shippingexportbatch` (
    `id` VARCHAR(191) NOT NULL,
    `exportNo` VARCHAR(191) NOT NULL,
    `supplierId` VARCHAR(191) NOT NULL,
    `exportedById` VARCHAR(191) NULL,
    `exportedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `orderCount` INTEGER NOT NULL DEFAULT 0,
    `fileName` VARCHAR(191) NOT NULL,
    `fileUrl` VARCHAR(191) NULL,
    `remark` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `subOrderCount` INTEGER NOT NULL DEFAULT 0,
    `tradeOrderCount` INTEGER NOT NULL DEFAULT 0,

    UNIQUE INDEX `ShippingExportBatch_exportNo_key`(`exportNo` ASC),
    INDEX `ShippingExportBatch_exportedById_exportedAt_idx`(`exportedById` ASC, `exportedAt` ASC),
    INDEX `ShippingExportBatch_supplierId_exportedAt_idx`(`supplierId` ASC, `exportedAt` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `shippingexportline` (
    `id` VARCHAR(191) NOT NULL,
    `exportBatchId` VARCHAR(191) NOT NULL,
    `rowNo` INTEGER NOT NULL,
    `tradeOrderId` VARCHAR(191) NOT NULL,
    `salesOrderId` VARCHAR(191) NOT NULL,
    `shippingTaskId` VARCHAR(191) NULL,
    `supplierId` VARCHAR(191) NOT NULL,
    `tradeNoSnapshot` VARCHAR(191) NOT NULL,
    `subOrderNoSnapshot` VARCHAR(191) NOT NULL,
    `receiverNameSnapshot` VARCHAR(191) NOT NULL,
    `receiverPhoneSnapshot` VARCHAR(191) NOT NULL,
    `receiverAddressSnapshot` TEXT NOT NULL,
    `productSummarySnapshot` TEXT NOT NULL,
    `pieceCountSnapshot` INTEGER NOT NULL,
    `codAmountSnapshot` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    `insuranceRequiredSnapshot` BOOLEAN NOT NULL DEFAULT false,
    `insuranceAmountSnapshot` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    `remarkSnapshot` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `ShippingExportLine_exportBatchId_rowNo_key`(`exportBatchId` ASC, `rowNo` ASC),
    INDEX `ShippingExportLine_salesOrderId_fkey`(`salesOrderId` ASC),
    INDEX `ShippingExportLine_shippingTaskId_idx`(`shippingTaskId` ASC),
    INDEX `ShippingExportLine_tradeOrderId_salesOrderId_idx`(`tradeOrderId` ASC, `salesOrderId` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `shippingtask` (
    `id` VARCHAR(191) NOT NULL,
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
    `customerId` VARCHAR(191) NOT NULL,
    `codAmount` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    `exportBatchId` VARCHAR(191) NULL,
    `insuranceAmount` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    `insuranceRequired` BOOLEAN NOT NULL DEFAULT false,
    `reportStatus` ENUM('PENDING', 'REPORTED') NOT NULL DEFAULT 'PENDING',
    `reportedAt` DATETIME(3) NULL,
    `salesOrderId` VARCHAR(191) NULL,
    `shippingProvider` VARCHAR(191) NULL,
    `shippingStatus` ENUM('PENDING', 'READY_TO_SHIP', 'SHIPPED', 'DELIVERED', 'COMPLETED', 'CANCELED') NOT NULL DEFAULT 'PENDING',
    `supplierId` VARCHAR(191) NULL,
    `tradeOrderId` VARCHAR(191) NULL,
    `receiverNameSnapshot` VARCHAR(191) NULL,
    `receiverPhoneSnapshot` VARCHAR(191) NULL,
    `receiverAddressSnapshot` TEXT NULL,

    INDEX `ShippingTask_assigneeId_status_createdAt_idx`(`assigneeId` ASC, `status` ASC, `createdAt` ASC),
    INDEX `ShippingTask_customerId_status_createdAt_idx`(`customerId` ASC, `status` ASC, `createdAt` ASC),
    INDEX `ShippingTask_exportBatchId_idx`(`exportBatchId` ASC),
    UNIQUE INDEX `ShippingTask_giftRecordId_key`(`giftRecordId` ASC),
    UNIQUE INDEX `ShippingTask_orderId_key`(`orderId` ASC),
    UNIQUE INDEX `ShippingTask_salesOrderId_key`(`salesOrderId` ASC),
    INDEX `ShippingTask_supplierId_reportStatus_shippingStatus_createdA_idx`(`supplierId` ASC, `reportStatus` ASC, `shippingStatus` ASC, `createdAt` ASC),
    INDEX `ShippingTask_trackingNumber_idx`(`trackingNumber` ASC),
    INDEX `shiptask_trade_scope_idx`(`tradeOrderId` ASC, `supplierId` ASC, `reportStatus` ASC, `shippingStatus` ASC, `createdAt` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `supplier` (
    `id` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `contactName` VARCHAR(191) NULL,
    `contactPhone` VARCHAR(191) NULL,
    `remark` TEXT NULL,
    `enabled` BOOLEAN NOT NULL DEFAULT true,
    `createdById` VARCHAR(191) NULL,
    `updatedById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Supplier_code_key`(`code` ASC),
    INDEX `Supplier_createdById_fkey`(`createdById` ASC),
    INDEX `Supplier_enabled_createdAt_idx`(`enabled` ASC, `createdAt` ASC),
    INDEX `Supplier_updatedById_fkey`(`updatedById` ASC),
    PRIMARY KEY (`id` ASC)
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

    UNIQUE INDEX `tag_categories_code_key`(`code` ASC),
    INDEX `tag_categories_groupId_isActive_sortOrder_idx`(`groupId` ASC, `isActive` ASC, `sortOrder` ASC),
    PRIMARY KEY (`id` ASC)
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

    UNIQUE INDEX `tag_groups_code_key`(`code` ASC),
    INDEX `tag_groups_isActive_sortOrder_idx`(`isActive` ASC, `sortOrder` ASC),
    PRIMARY KEY (`id` ASC)
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

    INDEX `tags_categoryId_isActive_sortOrder_idx`(`categoryId` ASC, `isActive` ASC, `sortOrder` ASC),
    UNIQUE INDEX `tags_code_key`(`code` ASC),
    INDEX `tags_groupId_isActive_sortOrder_idx`(`groupId` ASC, `isActive` ASC, `sortOrder` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `team_public_pool_settings` (
    `id` VARCHAR(191) NOT NULL,
    `teamId` VARCHAR(191) NOT NULL,
    `autoRecycleEnabled` BOOLEAN NOT NULL DEFAULT true,
    `ownerExitRecycleEnabled` BOOLEAN NOT NULL DEFAULT true,
    `defaultInactiveDays` INTEGER NOT NULL DEFAULT 14,
    `respectClaimLock` BOOLEAN NOT NULL DEFAULT true,
    `strongEffectProtectionDays` INTEGER NOT NULL DEFAULT 7,
    `mediumEffectProtectionDays` INTEGER NOT NULL DEFAULT 3,
    `weakEffectResetsClock` BOOLEAN NOT NULL DEFAULT false,
    `negativeRequiresSupervisorReview` BOOLEAN NOT NULL DEFAULT true,
    `salesCanClaim` BOOLEAN NOT NULL DEFAULT true,
    `salesCanRelease` BOOLEAN NOT NULL DEFAULT false,
    `batchRecycleEnabled` BOOLEAN NOT NULL DEFAULT true,
    `batchAssignEnabled` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `autoAssignBatchSize` INTEGER NOT NULL DEFAULT 20,
    `autoAssignEnabled` BOOLEAN NOT NULL DEFAULT false,
    `autoAssignStrategy` ENUM('NONE', 'ROUND_ROBIN', 'LOAD_BALANCING') NOT NULL DEFAULT 'NONE',
    `maxActiveCustomersPerSales` INTEGER NULL,
    `roundRobinCursorUserId` VARCHAR(191) NULL,

    UNIQUE INDEX `team_public_pool_settings_teamId_key`(`teamId` ASC),
    PRIMARY KEY (`id` ASC)
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

    UNIQUE INDEX `teams_code_key`(`code` ASC),
    UNIQUE INDEX `teams_name_key`(`name` ASC),
    UNIQUE INDEX `teams_supervisorId_key`(`supervisorId` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `tradeorder` (
    `id` VARCHAR(191) NOT NULL,
    `tradeNo` VARCHAR(191) NOT NULL,
    `customerId` VARCHAR(191) NOT NULL,
    `ownerId` VARCHAR(191) NULL,
    `reviewStatus` ENUM('PENDING_REVIEW', 'APPROVED', 'REJECTED') NOT NULL DEFAULT 'PENDING_REVIEW',
    `tradeStatus` ENUM('DRAFT', 'PENDING_REVIEW', 'APPROVED', 'REJECTED', 'CANCELED') NOT NULL DEFAULT 'DRAFT',
    `paymentScheme` ENUM('FULL_PREPAID', 'DEPOSIT_PLUS_BALANCE', 'FULL_COD', 'DEPOSIT_PLUS_COD') NOT NULL DEFAULT 'FULL_PREPAID',
    `listAmount` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    `dealAmount` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    `goodsAmount` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    `discountAmount` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    `finalAmount` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    `depositAmount` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    `collectedAmount` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    `paidAmount` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    `remainingAmount` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    `codAmount` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    `insuranceRequired` BOOLEAN NOT NULL DEFAULT false,
    `insuranceAmount` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    `discountReason` TEXT NULL,
    `receiverNameSnapshot` VARCHAR(191) NOT NULL,
    `receiverPhoneSnapshot` VARCHAR(191) NOT NULL,
    `receiverAddressSnapshot` TEXT NOT NULL,
    `reviewerId` VARCHAR(191) NULL,
    `reviewedAt` DATETIME(3) NULL,
    `rejectReason` TEXT NULL,
    `remark` TEXT NULL,
    `createdById` VARCHAR(191) NULL,
    `updatedById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `TradeOrder_customerId_createdAt_idx`(`customerId` ASC, `createdAt` ASC),
    INDEX `TradeOrder_ownerId_reviewStatus_createdAt_idx`(`ownerId` ASC, `reviewStatus` ASC, `createdAt` ASC),
    INDEX `TradeOrder_reviewStatus_tradeStatus_createdAt_idx`(`reviewStatus` ASC, `tradeStatus` ASC, `createdAt` ASC),
    UNIQUE INDEX `TradeOrder_tradeNo_key`(`tradeNo` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `tradeorderitem` (
    `id` VARCHAR(191) NOT NULL,
    `tradeOrderId` VARCHAR(191) NOT NULL,
    `lineNo` INTEGER NOT NULL,
    `itemType` ENUM('SKU', 'BUNDLE', 'GIFT') NOT NULL,
    `itemSourceType` ENUM('DIRECT_SKU', 'BUNDLE_SALE', 'MANUAL_GIFT', 'LIVE_SESSION_PRODUCT') NOT NULL,
    `productId` VARCHAR(191) NULL,
    `skuId` VARCHAR(191) NULL,
    `bundleId` VARCHAR(191) NULL,
    `titleSnapshot` VARCHAR(191) NOT NULL,
    `productNameSnapshot` VARCHAR(191) NULL,
    `skuNameSnapshot` VARCHAR(191) NULL,
    `specSnapshot` VARCHAR(191) NULL,
    `unitSnapshot` VARCHAR(191) NULL,
    `bundleCodeSnapshot` VARCHAR(191) NULL,
    `bundleNameSnapshot` VARCHAR(191) NULL,
    `bundleVersionSnapshot` INTEGER NULL,
    `listUnitPriceSnapshot` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    `dealUnitPriceSnapshot` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    `qty` INTEGER NOT NULL,
    `subtotal` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    `discountAmount` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    `remark` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `TradeOrderItem_bundleId_idx`(`bundleId` ASC),
    INDEX `TradeOrderItem_tradeOrderId_itemType_createdAt_idx`(`tradeOrderId` ASC, `itemType` ASC, `createdAt` ASC),
    UNIQUE INDEX `TradeOrderItem_tradeOrderId_lineNo_key`(`tradeOrderId` ASC, `lineNo` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `tradeorderitemcomponent` (
    `id` VARCHAR(191) NOT NULL,
    `tradeOrderId` VARCHAR(191) NOT NULL,
    `tradeOrderItemId` VARCHAR(191) NOT NULL,
    `componentSeq` INTEGER NOT NULL,
    `componentType` ENUM('GOODS', 'GIFT') NOT NULL,
    `componentSourceType` ENUM('DIRECT_SKU', 'BUNDLE_COMPONENT', 'GIFT_COMPONENT') NOT NULL,
    `supplierId` VARCHAR(191) NOT NULL,
    `productId` VARCHAR(191) NULL,
    `skuId` VARCHAR(191) NULL,
    `supplierNameSnapshot` VARCHAR(191) NOT NULL,
    `productNameSnapshot` VARCHAR(191) NOT NULL,
    `skuNameSnapshot` VARCHAR(191) NULL,
    `specSnapshot` VARCHAR(191) NULL,
    `unitSnapshot` VARCHAR(191) NULL,
    `exportDisplayNameSnapshot` VARCHAR(191) NOT NULL,
    `qty` INTEGER NOT NULL,
    `allocatedListUnitPriceSnapshot` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    `allocatedDealUnitPriceSnapshot` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    `allocatedSubtotal` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    `allocatedDiscountAmount` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `TradeOrderItemComponent_tradeOrderId_supplierId_createdAt_idx`(`tradeOrderId` ASC, `supplierId` ASC, `createdAt` ASC),
    UNIQUE INDEX `TradeOrderItemComponent_tradeOrderItemId_componentSeq_key`(`tradeOrderItemId` ASC, `componentSeq` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `user` (
    `id` VARCHAR(191) NOT NULL,
    `username` VARCHAR(191) NOT NULL,
    `passwordHash` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `phone` VARCHAR(191) NULL,
    `roleId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `disabledAt` DATETIME(3) NULL,
    `disabledById` VARCHAR(191) NULL,
    `invitedAt` DATETIME(3) NULL,
    `invitedById` VARCHAR(191) NULL,
    `lastLoginAt` DATETIME(3) NULL,
    `mustChangePassword` BOOLEAN NOT NULL DEFAULT false,
    `supervisorId` VARCHAR(191) NULL,
    `teamId` VARCHAR(191) NULL,
    `userStatus` ENUM('ACTIVE', 'INACTIVE') NOT NULL DEFAULT 'ACTIVE',
    `avatarPath` VARCHAR(191) NULL,

    INDEX `User_disabledById_idx`(`disabledById` ASC),
    INDEX `User_invitedById_idx`(`invitedById` ASC),
    UNIQUE INDEX `User_phone_key`(`phone` ASC),
    INDEX `User_roleId_idx`(`roleId` ASC),
    INDEX `User_supervisorId_idx`(`supervisorId` ASC),
    INDEX `User_teamId_idx`(`teamId` ASC),
    INDEX `User_userStatus_idx`(`userStatus` ASC),
    UNIQUE INDEX `User_username_key`(`username` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `wechatrecord` (
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

    INDEX `WechatRecord_customerId_createdAt_idx`(`customerId` ASC, `createdAt` ASC),
    INDEX `WechatRecord_leadId_createdAt_idx`(`leadId` ASC, `createdAt` ASC),
    INDEX `WechatRecord_salesId_createdAt_idx`(`salesId` ASC, `createdAt` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `callrecord` ADD CONSTRAINT `CallRecord_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `customer`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `callrecord` ADD CONSTRAINT `CallRecord_leadId_fkey` FOREIGN KEY (`leadId`) REFERENCES `lead`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `callrecord` ADD CONSTRAINT `CallRecord_salesId_fkey` FOREIGN KEY (`salesId`) REFERENCES `user`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `codcollectionrecord` ADD CONSTRAINT `CodCollectionRecord_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `customer`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `codcollectionrecord` ADD CONSTRAINT `CodCollectionRecord_ownerId_fkey` FOREIGN KEY (`ownerId`) REFERENCES `user`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `codcollectionrecord` ADD CONSTRAINT `CodCollectionRecord_paymentPlanId_fkey` FOREIGN KEY (`paymentPlanId`) REFERENCES `paymentplan`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `codcollectionrecord` ADD CONSTRAINT `CodCollectionRecord_paymentRecordId_fkey` FOREIGN KEY (`paymentRecordId`) REFERENCES `paymentrecord`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `codcollectionrecord` ADD CONSTRAINT `CodCollectionRecord_salesOrderId_fkey` FOREIGN KEY (`salesOrderId`) REFERENCES `salesorder`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `codcollectionrecord` ADD CONSTRAINT `CodCollectionRecord_shippingTaskId_fkey` FOREIGN KEY (`shippingTaskId`) REFERENCES `shippingtask`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `codcollectionrecord` ADD CONSTRAINT `CodCollectionRecord_tradeOrderId_fkey` FOREIGN KEY (`tradeOrderId`) REFERENCES `tradeorder`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `collectiontask` ADD CONSTRAINT `CollectionTask_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `user`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `collectiontask` ADD CONSTRAINT `CollectionTask_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `customer`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `collectiontask` ADD CONSTRAINT `CollectionTask_giftRecordId_fkey` FOREIGN KEY (`giftRecordId`) REFERENCES `giftrecord`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `collectiontask` ADD CONSTRAINT `CollectionTask_ownerId_fkey` FOREIGN KEY (`ownerId`) REFERENCES `user`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `collectiontask` ADD CONSTRAINT `CollectionTask_paymentPlanId_fkey` FOREIGN KEY (`paymentPlanId`) REFERENCES `paymentplan`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `collectiontask` ADD CONSTRAINT `CollectionTask_salesOrderId_fkey` FOREIGN KEY (`salesOrderId`) REFERENCES `salesorder`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `collectiontask` ADD CONSTRAINT `CollectionTask_shippingTaskId_fkey` FOREIGN KEY (`shippingTaskId`) REFERENCES `shippingtask`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `collectiontask` ADD CONSTRAINT `CollectionTask_tradeOrderId_fkey` FOREIGN KEY (`tradeOrderId`) REFERENCES `tradeorder`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `collectiontask` ADD CONSTRAINT `CollectionTask_updatedById_fkey` FOREIGN KEY (`updatedById`) REFERENCES `user`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `customer` ADD CONSTRAINT `Customer_lastOwnerId_fkey` FOREIGN KEY (`lastOwnerId`) REFERENCES `user`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `customer` ADD CONSTRAINT `Customer_ownerId_fkey` FOREIGN KEY (`ownerId`) REFERENCES `user`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `customer` ADD CONSTRAINT `Customer_publicPoolTeamId_fkey` FOREIGN KEY (`publicPoolTeamId`) REFERENCES `teams`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `customer_tags` ADD CONSTRAINT `customer_tags_assignedById_fkey` FOREIGN KEY (`assignedById`) REFERENCES `user`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `customer_tags` ADD CONSTRAINT `customer_tags_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `customer`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `customer_tags` ADD CONSTRAINT `customer_tags_tagId_fkey` FOREIGN KEY (`tagId`) REFERENCES `tags`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `customerownershipevent` ADD CONSTRAINT `CustomerOwnershipEvent_actorId_fkey` FOREIGN KEY (`actorId`) REFERENCES `user`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `customerownershipevent` ADD CONSTRAINT `CustomerOwnershipEvent_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `customer`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `customerownershipevent` ADD CONSTRAINT `CustomerOwnershipEvent_fromOwnerId_fkey` FOREIGN KEY (`fromOwnerId`) REFERENCES `user`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `customerownershipevent` ADD CONSTRAINT `CustomerOwnershipEvent_teamId_fkey` FOREIGN KEY (`teamId`) REFERENCES `teams`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `customerownershipevent` ADD CONSTRAINT `CustomerOwnershipEvent_toOwnerId_fkey` FOREIGN KEY (`toOwnerId`) REFERENCES `user`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `dictionary_items` ADD CONSTRAINT `dictionary_items_typeId_fkey` FOREIGN KEY (`typeId`) REFERENCES `dictionary_types`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `dictionary_types` ADD CONSTRAINT `dictionary_types_categoryId_fkey` FOREIGN KEY (`categoryId`) REFERENCES `categories`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `followuptask` ADD CONSTRAINT `FollowUpTask_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `user`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `followuptask` ADD CONSTRAINT `FollowUpTask_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `customer`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `followuptask` ADD CONSTRAINT `FollowUpTask_leadId_fkey` FOREIGN KEY (`leadId`) REFERENCES `lead`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `followuptask` ADD CONSTRAINT `FollowUpTask_ownerId_fkey` FOREIGN KEY (`ownerId`) REFERENCES `user`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `giftrecord` ADD CONSTRAINT `GiftRecord_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `customer`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `giftrecord` ADD CONSTRAINT `GiftRecord_leadId_fkey` FOREIGN KEY (`leadId`) REFERENCES `lead`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `giftrecord` ADD CONSTRAINT `GiftRecord_liveSessionId_fkey` FOREIGN KEY (`liveSessionId`) REFERENCES `livesession`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `giftrecord` ADD CONSTRAINT `GiftRecord_salesId_fkey` FOREIGN KEY (`salesId`) REFERENCES `user`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `lead` ADD CONSTRAINT `Lead_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `customer`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `lead` ADD CONSTRAINT `Lead_ownerId_fkey` FOREIGN KEY (`ownerId`) REFERENCES `user`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `lead_customer_merge_logs` ADD CONSTRAINT `lead_customer_merge_logs_batchId_fkey` FOREIGN KEY (`batchId`) REFERENCES `lead_import_batches`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `lead_customer_merge_logs` ADD CONSTRAINT `lead_customer_merge_logs_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `customer`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `lead_customer_merge_logs` ADD CONSTRAINT `lead_customer_merge_logs_leadId_fkey` FOREIGN KEY (`leadId`) REFERENCES `lead`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `lead_customer_merge_logs` ADD CONSTRAINT `lead_customer_merge_logs_rowId_fkey` FOREIGN KEY (`rowId`) REFERENCES `lead_import_rows`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `lead_dedup_logs` ADD CONSTRAINT `lead_dedup_logs_batchId_fkey` FOREIGN KEY (`batchId`) REFERENCES `lead_import_batches`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `lead_dedup_logs` ADD CONSTRAINT `lead_dedup_logs_rowId_fkey` FOREIGN KEY (`rowId`) REFERENCES `lead_import_rows`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `lead_import_batches` ADD CONSTRAINT `lead_import_batches_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `user`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `lead_import_batches` ADD CONSTRAINT `lead_import_batches_templateId_fkey` FOREIGN KEY (`templateId`) REFERENCES `lead_import_templates`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `lead_import_rows` ADD CONSTRAINT `lead_import_rows_batchId_fkey` FOREIGN KEY (`batchId`) REFERENCES `lead_import_batches`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `lead_import_templates` ADD CONSTRAINT `lead_import_templates_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `user`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `lead_tags` ADD CONSTRAINT `lead_tags_assignedById_fkey` FOREIGN KEY (`assignedById`) REFERENCES `user`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `lead_tags` ADD CONSTRAINT `lead_tags_leadId_fkey` FOREIGN KEY (`leadId`) REFERENCES `lead`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `lead_tags` ADD CONSTRAINT `lead_tags_tagId_fkey` FOREIGN KEY (`tagId`) REFERENCES `tags`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `leadassignment` ADD CONSTRAINT `LeadAssignment_assignedById_fkey` FOREIGN KEY (`assignedById`) REFERENCES `user`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `leadassignment` ADD CONSTRAINT `LeadAssignment_fromUserId_fkey` FOREIGN KEY (`fromUserId`) REFERENCES `user`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `leadassignment` ADD CONSTRAINT `LeadAssignment_leadId_fkey` FOREIGN KEY (`leadId`) REFERENCES `lead`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `leadassignment` ADD CONSTRAINT `LeadAssignment_toUserId_fkey` FOREIGN KEY (`toUserId`) REFERENCES `user`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `liveinvitation` ADD CONSTRAINT `LiveInvitation_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `customer`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `liveinvitation` ADD CONSTRAINT `LiveInvitation_leadId_fkey` FOREIGN KEY (`leadId`) REFERENCES `lead`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `liveinvitation` ADD CONSTRAINT `LiveInvitation_liveSessionId_fkey` FOREIGN KEY (`liveSessionId`) REFERENCES `livesession`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `liveinvitation` ADD CONSTRAINT `LiveInvitation_salesId_fkey` FOREIGN KEY (`salesId`) REFERENCES `user`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `livesession` ADD CONSTRAINT `LiveSession_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `user`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `logisticsfollowuptask` ADD CONSTRAINT `LogisticsFollowUpTask_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `customer`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `logisticsfollowuptask` ADD CONSTRAINT `LogisticsFollowUpTask_ownerId_fkey` FOREIGN KEY (`ownerId`) REFERENCES `user`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `logisticsfollowuptask` ADD CONSTRAINT `LogisticsFollowUpTask_salesOrderId_fkey` FOREIGN KEY (`salesOrderId`) REFERENCES `salesorder`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `logisticsfollowuptask` ADD CONSTRAINT `LogisticsFollowUpTask_shippingTaskId_fkey` FOREIGN KEY (`shippingTaskId`) REFERENCES `shippingtask`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `logisticsfollowuptask` ADD CONSTRAINT `LogisticsFollowUpTask_tradeOrderId_fkey` FOREIGN KEY (`tradeOrderId`) REFERENCES `tradeorder`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `operationlog` ADD CONSTRAINT `OperationLog_actorId_fkey` FOREIGN KEY (`actorId`) REFERENCES `user`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `order` ADD CONSTRAINT `Order_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `customer`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `order` ADD CONSTRAINT `Order_leadId_fkey` FOREIGN KEY (`leadId`) REFERENCES `lead`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `order` ADD CONSTRAINT `Order_ownerId_fkey` FOREIGN KEY (`ownerId`) REFERENCES `user`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `paymentplan` ADD CONSTRAINT `PaymentPlan_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `user`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `paymentplan` ADD CONSTRAINT `PaymentPlan_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `customer`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `paymentplan` ADD CONSTRAINT `PaymentPlan_giftRecordId_fkey` FOREIGN KEY (`giftRecordId`) REFERENCES `giftrecord`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `paymentplan` ADD CONSTRAINT `PaymentPlan_ownerId_fkey` FOREIGN KEY (`ownerId`) REFERENCES `user`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `paymentplan` ADD CONSTRAINT `PaymentPlan_salesOrderId_fkey` FOREIGN KEY (`salesOrderId`) REFERENCES `salesorder`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `paymentplan` ADD CONSTRAINT `PaymentPlan_shippingTaskId_fkey` FOREIGN KEY (`shippingTaskId`) REFERENCES `shippingtask`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `paymentplan` ADD CONSTRAINT `PaymentPlan_tradeOrderId_fkey` FOREIGN KEY (`tradeOrderId`) REFERENCES `tradeorder`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `paymentplan` ADD CONSTRAINT `PaymentPlan_updatedById_fkey` FOREIGN KEY (`updatedById`) REFERENCES `user`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `paymentrecord` ADD CONSTRAINT `PaymentRecord_confirmedById_fkey` FOREIGN KEY (`confirmedById`) REFERENCES `user`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `paymentrecord` ADD CONSTRAINT `PaymentRecord_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `customer`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `paymentrecord` ADD CONSTRAINT `PaymentRecord_giftRecordId_fkey` FOREIGN KEY (`giftRecordId`) REFERENCES `giftrecord`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `paymentrecord` ADD CONSTRAINT `PaymentRecord_ownerId_fkey` FOREIGN KEY (`ownerId`) REFERENCES `user`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `paymentrecord` ADD CONSTRAINT `PaymentRecord_paymentPlanId_fkey` FOREIGN KEY (`paymentPlanId`) REFERENCES `paymentplan`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `paymentrecord` ADD CONSTRAINT `PaymentRecord_salesOrderId_fkey` FOREIGN KEY (`salesOrderId`) REFERENCES `salesorder`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `paymentrecord` ADD CONSTRAINT `PaymentRecord_shippingTaskId_fkey` FOREIGN KEY (`shippingTaskId`) REFERENCES `shippingtask`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `paymentrecord` ADD CONSTRAINT `PaymentRecord_submittedById_fkey` FOREIGN KEY (`submittedById`) REFERENCES `user`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `paymentrecord` ADD CONSTRAINT `PaymentRecord_tradeOrderId_fkey` FOREIGN KEY (`tradeOrderId`) REFERENCES `tradeorder`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `product` ADD CONSTRAINT `Product_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `user`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `product` ADD CONSTRAINT `Product_supplierId_fkey` FOREIGN KEY (`supplierId`) REFERENCES `supplier`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `product` ADD CONSTRAINT `Product_updatedById_fkey` FOREIGN KEY (`updatedById`) REFERENCES `user`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `productbundleitem` ADD CONSTRAINT `ProductBundleItem_bundleId_fkey` FOREIGN KEY (`bundleId`) REFERENCES `productbundle`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `productsku` ADD CONSTRAINT `ProductSku_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `product`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `salesorder` ADD CONSTRAINT `SalesOrder_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `user`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `salesorder` ADD CONSTRAINT `SalesOrder_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `customer`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `salesorder` ADD CONSTRAINT `SalesOrder_ownerId_fkey` FOREIGN KEY (`ownerId`) REFERENCES `user`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `salesorder` ADD CONSTRAINT `SalesOrder_reviewerId_fkey` FOREIGN KEY (`reviewerId`) REFERENCES `user`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `salesorder` ADD CONSTRAINT `SalesOrder_supplierId_fkey` FOREIGN KEY (`supplierId`) REFERENCES `supplier`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `salesorder` ADD CONSTRAINT `SalesOrder_tradeOrderId_fkey` FOREIGN KEY (`tradeOrderId`) REFERENCES `tradeorder`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `salesorder` ADD CONSTRAINT `SalesOrder_updatedById_fkey` FOREIGN KEY (`updatedById`) REFERENCES `user`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `salesordergiftitem` ADD CONSTRAINT `SalesOrderGiftItem_salesOrderId_fkey` FOREIGN KEY (`salesOrderId`) REFERENCES `salesorder`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `salesorderitem` ADD CONSTRAINT `SalesOrderItem_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `product`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `salesorderitem` ADD CONSTRAINT `SalesOrderItem_salesOrderId_fkey` FOREIGN KEY (`salesOrderId`) REFERENCES `salesorder`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `salesorderitem` ADD CONSTRAINT `SalesOrderItem_skuId_fkey` FOREIGN KEY (`skuId`) REFERENCES `productsku`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `salesorderitem` ADD CONSTRAINT `SalesOrderItem_tradeOrderId_fkey` FOREIGN KEY (`tradeOrderId`) REFERENCES `tradeorder`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `salesorderitem` ADD CONSTRAINT `SalesOrderItem_tradeOrderItemComponentId_fkey` FOREIGN KEY (`tradeOrderItemComponentId`) REFERENCES `tradeorderitemcomponent`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `salesorderitem` ADD CONSTRAINT `SalesOrderItem_tradeOrderItemId_fkey` FOREIGN KEY (`tradeOrderItemId`) REFERENCES `tradeorderitem`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `shippingexportbatch` ADD CONSTRAINT `ShippingExportBatch_exportedById_fkey` FOREIGN KEY (`exportedById`) REFERENCES `user`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `shippingexportbatch` ADD CONSTRAINT `ShippingExportBatch_supplierId_fkey` FOREIGN KEY (`supplierId`) REFERENCES `supplier`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `shippingexportline` ADD CONSTRAINT `ShippingExportLine_exportBatchId_fkey` FOREIGN KEY (`exportBatchId`) REFERENCES `shippingexportbatch`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `shippingexportline` ADD CONSTRAINT `ShippingExportLine_salesOrderId_fkey` FOREIGN KEY (`salesOrderId`) REFERENCES `salesorder`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `shippingexportline` ADD CONSTRAINT `ShippingExportLine_shippingTaskId_fkey` FOREIGN KEY (`shippingTaskId`) REFERENCES `shippingtask`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `shippingexportline` ADD CONSTRAINT `ShippingExportLine_tradeOrderId_fkey` FOREIGN KEY (`tradeOrderId`) REFERENCES `tradeorder`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `shippingtask` ADD CONSTRAINT `ShippingTask_assigneeId_fkey` FOREIGN KEY (`assigneeId`) REFERENCES `user`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `shippingtask` ADD CONSTRAINT `ShippingTask_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `customer`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `shippingtask` ADD CONSTRAINT `ShippingTask_exportBatchId_fkey` FOREIGN KEY (`exportBatchId`) REFERENCES `shippingexportbatch`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `shippingtask` ADD CONSTRAINT `ShippingTask_giftRecordId_fkey` FOREIGN KEY (`giftRecordId`) REFERENCES `giftrecord`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `shippingtask` ADD CONSTRAINT `ShippingTask_orderId_fkey` FOREIGN KEY (`orderId`) REFERENCES `order`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `shippingtask` ADD CONSTRAINT `ShippingTask_salesOrderId_fkey` FOREIGN KEY (`salesOrderId`) REFERENCES `salesorder`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `shippingtask` ADD CONSTRAINT `ShippingTask_supplierId_fkey` FOREIGN KEY (`supplierId`) REFERENCES `supplier`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `shippingtask` ADD CONSTRAINT `ShippingTask_tradeOrderId_fkey` FOREIGN KEY (`tradeOrderId`) REFERENCES `tradeorder`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `supplier` ADD CONSTRAINT `Supplier_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `user`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `supplier` ADD CONSTRAINT `Supplier_updatedById_fkey` FOREIGN KEY (`updatedById`) REFERENCES `user`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `tag_categories` ADD CONSTRAINT `tag_categories_groupId_fkey` FOREIGN KEY (`groupId`) REFERENCES `tag_groups`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `tags` ADD CONSTRAINT `tags_categoryId_fkey` FOREIGN KEY (`categoryId`) REFERENCES `tag_categories`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `tags` ADD CONSTRAINT `tags_groupId_fkey` FOREIGN KEY (`groupId`) REFERENCES `tag_groups`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `team_public_pool_settings` ADD CONSTRAINT `team_public_pool_settings_teamId_fkey` FOREIGN KEY (`teamId`) REFERENCES `teams`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `teams` ADD CONSTRAINT `teams_supervisorId_fkey` FOREIGN KEY (`supervisorId`) REFERENCES `user`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `tradeorder` ADD CONSTRAINT `TradeOrder_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `customer`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `tradeorderitem` ADD CONSTRAINT `TradeOrderItem_bundleId_fkey` FOREIGN KEY (`bundleId`) REFERENCES `productbundle`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `tradeorderitem` ADD CONSTRAINT `TradeOrderItem_tradeOrderId_fkey` FOREIGN KEY (`tradeOrderId`) REFERENCES `tradeorder`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `tradeorderitemcomponent` ADD CONSTRAINT `TradeOrderItemComponent_tradeOrderId_fkey` FOREIGN KEY (`tradeOrderId`) REFERENCES `tradeorder`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `tradeorderitemcomponent` ADD CONSTRAINT `TradeOrderItemComponent_tradeOrderItemId_fkey` FOREIGN KEY (`tradeOrderItemId`) REFERENCES `tradeorderitem`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `user` ADD CONSTRAINT `User_disabledById_fkey` FOREIGN KEY (`disabledById`) REFERENCES `user`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `user` ADD CONSTRAINT `User_invitedById_fkey` FOREIGN KEY (`invitedById`) REFERENCES `user`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `user` ADD CONSTRAINT `User_roleId_fkey` FOREIGN KEY (`roleId`) REFERENCES `role`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `user` ADD CONSTRAINT `User_supervisorId_fkey` FOREIGN KEY (`supervisorId`) REFERENCES `user`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `user` ADD CONSTRAINT `User_teamId_fkey` FOREIGN KEY (`teamId`) REFERENCES `teams`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `wechatrecord` ADD CONSTRAINT `WechatRecord_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `customer`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `wechatrecord` ADD CONSTRAINT `WechatRecord_leadId_fkey` FOREIGN KEY (`leadId`) REFERENCES `lead`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `wechatrecord` ADD CONSTRAINT `WechatRecord_salesId_fkey` FOREIGN KEY (`salesId`) REFERENCES `user`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

