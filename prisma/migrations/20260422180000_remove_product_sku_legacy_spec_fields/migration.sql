ALTER TABLE `productsku`
    DROP INDEX `ProductSku_skuCode_key`,
    DROP COLUMN `skuCode`,
    DROP COLUMN `specText`,
    DROP COLUMN `unit`,
    DROP COLUMN `capacityMl`,
    DROP COLUMN `alcoholPercent`,
    DROP COLUMN `packageFormCode`;
