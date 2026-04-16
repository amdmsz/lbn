-- AlterTable
ALTER TABLE `recycle_bin_entries`
    MODIFY `targetType` ENUM(
        'PRODUCT',
        'PRODUCT_SKU',
        'SUPPLIER',
        'LIVE_SESSION',
        'LEAD',
        'TRADE_ORDER',
        'CUSTOMER'
    ) NOT NULL,
    MODIFY `domain` ENUM(
        'PRODUCT_MASTER_DATA',
        'LIVE_SESSION',
        'LEAD',
        'TRADE_ORDER',
        'CUSTOMER'
    ) NOT NULL;
