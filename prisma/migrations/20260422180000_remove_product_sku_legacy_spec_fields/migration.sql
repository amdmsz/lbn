ALTER TABLE `productsku`
    DROP INDEX `productsku_skuCode_key`,
    DROP COLUMN `skuCode`,
    DROP COLUMN `specText`,
    DROP COLUMN `unit`,
    DROP COLUMN `capacityMl`,
    DROP COLUMN `alcoholPercent`,
    DROP COLUMN `packageFormCode`;
