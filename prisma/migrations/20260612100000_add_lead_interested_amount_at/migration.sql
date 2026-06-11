-- 信息流名单导入: lead 增加意向金额 / 意向发生时间 (Excel 的"金额""日期"列)
ALTER TABLE `lead`
    ADD COLUMN `interestedAmount` DECIMAL(10, 2) NULL,
    ADD COLUMN `interestedAt` DATETIME(3) NULL;
