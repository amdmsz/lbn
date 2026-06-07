# F09 schema FK 补全 — 阶段方案 (plan only, 本 PR 不落 migration)

## 1. 背景

本文档对齐 `NIGHT_SUMMARY.md` 中 audit 风险登记表第 226 行 (F09 风险条):

> F09 (FK / @relation 补全) | 需要 migration + 历史数据可能不符合 FK 约束 |
> 先跑诊断脚本看历史脏数据

audit 进一步给出的 schema FK 候选缺口如下 (复制自 audit 输出):

```json
[
  {
    "model": "ProductBundleItem",
    "missingFields": [
      "supplierId String (no Supplier relation)",
      "productId String (no Product relation)",
      "skuId String (no ProductSku relation)"
    ]
  },
  {
    "model": "TradeOrderItemComponent",
    "missingFields": [
      "supplierId String (no Supplier relation)",
      "productId String? (no Product relation)",
      "skuId String? (no ProductSku relation)"
    ]
  },
  {
    "model": "ShippingExportLine",
    "missingFields": [
      "supplierId String (no Supplier relation)"
    ]
  }
]
```

本 PR 只交付两样东西:

- `scripts/diagnose-fk-orphans.mjs` — read-only 诊断脚本
- 本 plan 文档 — migration 草稿

**本 PR 不修改 `prisma/schema.prisma`, 不生成 `prisma/migrations/*` 目录,
也不在生产数据库上做任何 DDL**. 加 FK 是 **不可逆** 的强约束动作,
必须先有诊断结果 + 业务确认才能进入下一阶段.

---

## 2. FK 缺失现状

下表对应 `scripts/diagnose-fk-orphans.mjs` 中硬编码白名单. 列名按
`@@map` 之后的实际 MariaDB 物理表名书写, 不用 Prisma 模型名.

| 子表 (物理表)              | 子列         | 期望父表    | 期望父列 | 子列可空 | 期望 ON DELETE 策略 (建议) |
| -------------------------- | ------------ | ----------- | -------- | -------- | -------------------------- |
| `productbundleitem`        | `supplierId` | `supplier`  | `id`     | NOT NULL | RESTRICT                   |
| `productbundleitem`        | `productId`  | `product`   | `id`     | NOT NULL | RESTRICT                   |
| `productbundleitem`        | `skuId`      | `productsku`| `id`     | NOT NULL | RESTRICT                   |
| `tradeorderitemcomponent`  | `supplierId` | `supplier`  | `id`     | NOT NULL | RESTRICT                   |
| `tradeorderitemcomponent`  | `productId`  | `product`   | `id`     | NULL     | SET NULL                   |
| `tradeorderitemcomponent`  | `skuId`      | `productsku`| `id`     | NULL     | SET NULL                   |
| `shippingexportline`       | `supplierId` | `supplier`  | `id`     | NOT NULL | RESTRICT                   |

策略说明:

- **NOT NULL + RESTRICT**: 子行必须始终关联到一个真实父行. 业务侧已经把
  `supplier / product / sku` 当作必填快照来源, 若要删父行必须先处理子行,
  这是审计链需要的行为.
- **NULL + SET NULL**: `TradeOrderItemComponent.productId / skuId` 在
  schema 上本来就 nullable (复合套餐 / 仅文字行可以不挂 SKU). 父行被
  删时清空指针, 不破坏历史成交单.

`ON UPDATE CASCADE` 全部按 Prisma migration 默认走, 不主动配制.

---

## 3. 迁移策略 (三阶段, 严格顺序)

### 阶段 1 — 诊断 (本 PR)

- 落地 `scripts/diagnose-fk-orphans.mjs`.
- 在能访问目标库的环境运行:

  ```bash
  node scripts/diagnose-fk-orphans.mjs
  ```

- 把脚本末尾输出的 JSON summary 贴回本文档 "诊断结果" 区 (见第 5 节).
- 验收口径:
  - 每条 check 必须有 `total / orphans / sampleOrphans`.
  - 至少跑一次 **生产库** (运维代跑) + 一次 **预发库**.

### 阶段 2 — 决策与数据修复 (下一个 PR)

按诊断结果分两种走法.

**情况 A: 全部 `orphans === 0`** (期望情况):

- 直接进入阶段 3.
- 文档中记录跑诊断的时间戳, 防止数据期间又写入新 orphan.

**情况 B: 任一表存在 orphan**:

- 在本 plan 文档新增 "orphan 处置子方案" 章节, 按表列出:
  - orphan 行数 / 样例 id.
  - 业务侧确认: 该 orphan 是 "历史脏数据可直接软删" 还是 "需要补回父记录".
  - 处置 SQL (软删 / UPDATE NULL / 重建父行) — 走单独 review.
- 处置完成后再次跑诊断脚本, 确认 `allClean === true` 才允许进入阶段 3.

### 阶段 3 — schema + migration 落地 (再一个 PR)

- 在 `prisma/schema.prisma` 给上述 7 个字段补 `@relation`.
  - 注意: 同一个 `Supplier` 同时被 `Product / SalesOrder /
    ShippingTask / ShippingExportBatch` 反向引用过, 给
    `ProductBundleItem / TradeOrderItemComponent / ShippingExportLine`
    新增反向 relation 时, 要用具名 `relation` 避免与现有反向列冲突.
- 在 `Supplier / Product / ProductSku` 模型补对应 `OneToMany` 反向列
  (例如 `Supplier.productBundleItems ProductBundleItem[]`).
- 用 `npx prisma migrate dev --create-only` 生成 migration 草稿, **不要直接
  apply 到生产**.
- migration SQL 草稿见第 4 节.
- 上线流程仍走 `bash scripts/release-preflight.sh` +
  `prisma migrate deploy`, 不允许 `migrate dev` / `db push`.

---

## 4. 迁移 SQL 草稿 (供阶段 3 参考)

> 仅作草稿, Prisma 生成的实际 SQL 可能在列顺序 / index 命名上略有差异,
> 以 `prisma migrate dev --create-only` 真实产物为准.

```sql
-- Step A: ProductBundleItem
ALTER TABLE `productbundleitem`
  ADD CONSTRAINT `productbundleitem_supplierId_fkey`
  FOREIGN KEY (`supplierId`) REFERENCES `supplier`(`id`)
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `productbundleitem`
  ADD CONSTRAINT `productbundleitem_productId_fkey`
  FOREIGN KEY (`productId`) REFERENCES `product`(`id`)
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `productbundleitem`
  ADD CONSTRAINT `productbundleitem_skuId_fkey`
  FOREIGN KEY (`skuId`) REFERENCES `productsku`(`id`)
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX `productbundleitem_supplierId_idx` ON `productbundleitem` (`supplierId`);
CREATE INDEX `productbundleitem_productId_idx`  ON `productbundleitem` (`productId`);
CREATE INDEX `productbundleitem_skuId_idx`      ON `productbundleitem` (`skuId`);

-- Step B: TradeOrderItemComponent
ALTER TABLE `tradeorderitemcomponent`
  ADD CONSTRAINT `tradeorderitemcomponent_supplierId_fkey`
  FOREIGN KEY (`supplierId`) REFERENCES `supplier`(`id`)
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `tradeorderitemcomponent`
  ADD CONSTRAINT `tradeorderitemcomponent_productId_fkey`
  FOREIGN KEY (`productId`) REFERENCES `product`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `tradeorderitemcomponent`
  ADD CONSTRAINT `tradeorderitemcomponent_skuId_fkey`
  FOREIGN KEY (`skuId`) REFERENCES `productsku`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX `tradeorderitemcomponent_supplierId_idx` ON `tradeorderitemcomponent` (`supplierId`);
CREATE INDEX `tradeorderitemcomponent_productId_idx`  ON `tradeorderitemcomponent` (`productId`);
CREATE INDEX `tradeorderitemcomponent_skuId_idx`      ON `tradeorderitemcomponent` (`skuId`);

-- Step C: ShippingExportLine
ALTER TABLE `shippingexportline`
  ADD CONSTRAINT `shippingexportline_supplierId_fkey`
  FOREIGN KEY (`supplierId`) REFERENCES `supplier`(`id`)
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX `shippingexportline_supplierId_idx` ON `shippingexportline` (`supplierId`);
```

注意点:

- 若 `tradeorderitemcomponent.productId / skuId` 已经存在合法 NULL 行,
  `SET NULL` 行为对它们透明; 但只要存在 **非 NULL 但找不到父行** 的
  orphan, 加 FK 仍然会失败 — 必须先在阶段 2 把 orphan 清成 NULL 或
  补回父行.
- MariaDB 在 InnoDB 下加 FK 会全表锁短时间, 走变更窗口前要预估子表大小.
- 单纯靠这套 FK 不会让任何业务行为变化, 只是收紧写入边界 — 但
  **会阻断未来盲删 supplier / product / sku 的脚本**. 阶段 3 上线前要
  通知 OPS / 数据团队, 让他们的清理脚本改成 "先扫子表".

---

## 5. 诊断结果 (运行 `scripts/diagnose-fk-orphans.mjs` 后填入)

| 跑批环境 | 跑批时间 (UTC) | allClean | 备注 |
| -------- | -------------- | -------- | ---- |
| (预发)   | TBD            | TBD      | 待跑 |
| (生产)   | TBD            | TBD      | 待跑 |

`<完整 JSON summary 粘贴位>`

```json
// 占位: 请把脚本输出的 "[diagnose-fk-orphans] === JSON summary ===" 之间内容贴在这里
{
  "generatedAt": "TBD",
  "allClean": null,
  "checks": []
}
```

---

## 6. 强制原则 (执行人请逐条复读)

1. **加 FK 是不可逆的强约束动作**. 一旦上线, 后续清理 supplier /
   product / sku 历史数据的难度会变大, 必须先与业务方确认 "永久禁止裸
   删父表" 的边界.
2. **本 PR 不动 schema, 不动 migrations**. 任何 commit 包含
   `prisma/schema.prisma` 或 `prisma/migrations/*` 的改动, 都意味着越界,
   要拆回新 PR.
3. **诊断必须在真实库跑**. 本地 dev 库的 orphan 情况不能代表生产 — 阶段 2
   决策必须有生产环境跑批的 JSON 输入.
4. **orphan 处置走单独 review**. 不允许在 migration PR 里夹带 UPDATE /
   DELETE / SOFT DELETE 数据修复 SQL — 数据修复 PR 与 schema PR 必须分开.
5. **OperationLog 不受影响**. 这套 FK 改动只影响子表写入边界, 不改任何
   业务写路径, 因此不新增 OperationLog 写入点.
6. **回滚预案**. 上线后若发现 FK 影响生产写入, 立刻执行
   `ALTER TABLE ... DROP FOREIGN KEY <constraint_name>` 回滚, 再回到阶段 2
   定位是哪个写路径绕过了 schema.
