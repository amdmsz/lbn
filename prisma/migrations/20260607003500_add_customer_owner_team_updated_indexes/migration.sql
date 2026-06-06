-- Round 1 audit F08: 客户中心按 ownerId 分页 + 排序 (updatedAt, id) 必走索引.
-- 当前仅有单列 ownerId 索引, 在大表上做 ORDER BY updatedAt 仍要回表排序.
-- 增加复合索引覆盖 cursor 分页路径.
--
-- (注意: 原计划同时加 teamId 复合索引, 但 Customer 表自身没有 teamId 字段,
-- 团队维度的客户访问是经由 owner → owner.team 间接关联. team 侧的索引应该
-- 加在 User.teamId 上, 留作后续单独评估.)

CREATE INDEX `cust_owner_updated_id_idx` ON `customer` (`ownerId`, `updatedAt`, `id`);
