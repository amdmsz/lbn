-- Round 1 audit F08: 客户中心按 ownerId / teamId 分页 + 排序 (updatedAt, id)
-- 必走索引. 当前仅有单列 ownerId 索引, 在大表上做 ORDER BY updatedAt 仍要回表
-- 排序. 增加复合索引覆盖 cursor 分页路径.

CREATE INDEX `cust_owner_updated_id_idx` ON `customer` (`ownerId`, `updatedAt`, `id`);
CREATE INDEX `cust_team_updated_id_idx` ON `customer` (`teamId`, `updatedAt`, `id`);
