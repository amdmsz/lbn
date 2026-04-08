-- CreateTable
CREATE TABLE `user_permission_grants` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `permissionCode` ENUM('LIVE_SESSION_MANAGE', 'PRODUCT_MANAGE') NOT NULL,
    `grantedById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `user_permission_grants_userId_permissionCode_key`(`userId` ASC, `permissionCode` ASC),
    INDEX `user_permission_grants_permissionCode_idx`(`permissionCode` ASC),
    INDEX `user_permission_grants_grantedById_createdAt_idx`(`grantedById` ASC, `createdAt` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `user_permission_grants` ADD CONSTRAINT `user_permission_grants_userId_fkey`
FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `user_permission_grants` ADD CONSTRAINT `user_permission_grants_grantedById_fkey`
FOREIGN KEY (`grantedById`) REFERENCES `user`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
