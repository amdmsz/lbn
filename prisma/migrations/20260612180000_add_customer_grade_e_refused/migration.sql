-- 客户分级 grade 补 E (拒加) — 与"客户分类"合并为一套 A/B/C/D/E/F
ALTER TABLE `customer`
    MODIFY `grade` ENUM('A', 'B', 'C', 'D', 'E', 'F') NULL;
