-- AlterTable
ALTER TABLE `recycle_bin_entries` ADD COLUMN `archivePayloadJson` JSON NULL,
    MODIFY `status` ENUM('ACTIVE', 'RESTORED', 'PURGED', 'ARCHIVED') NOT NULL DEFAULT 'ACTIVE';
