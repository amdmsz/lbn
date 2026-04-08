-- AlterTable
ALTER TABLE `SalesOrder`
    ADD COLUMN `paymentScheme` ENUM('FULL_PREPAID', 'DEPOSIT_PLUS_BALANCE', 'FULL_COD', 'DEPOSIT_PLUS_COD') NOT NULL DEFAULT 'FULL_PREPAID',
    ADD COLUMN `listAmount` DECIMAL(10, 2) NOT NULL DEFAULT 0,
    ADD COLUMN `dealAmount` DECIMAL(10, 2) NOT NULL DEFAULT 0,
    ADD COLUMN `depositAmount` DECIMAL(10, 2) NOT NULL DEFAULT 0,
    ADD COLUMN `collectedAmount` DECIMAL(10, 2) NOT NULL DEFAULT 0;

-- Backfill new settlement fields from the existing compatibility columns
UPDATE `SalesOrder`
SET
    `paymentScheme` = CASE
        WHEN `paymentMode` = 'FULL_PAYMENT' THEN 'FULL_PREPAID'
        WHEN `paymentMode` = 'COD' THEN 'FULL_COD'
        WHEN `paymentMode` = 'DEPOSIT' AND `codAmount` > 0 THEN 'DEPOSIT_PLUS_COD'
        ELSE 'DEPOSIT_PLUS_BALANCE'
    END,
    `listAmount` = `goodsAmount` + `discountAmount`,
    `dealAmount` = `goodsAmount`,
    `depositAmount` = CASE
        WHEN `paymentMode` = 'DEPOSIT' THEN `paidAmount`
        ELSE 0
    END,
    `collectedAmount` = `paidAmount`;

-- CreateIndex
CREATE INDEX `SalesOrder_paymentScheme_createdAt_idx` ON `SalesOrder`(`paymentScheme`, `createdAt`);
