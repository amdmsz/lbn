# 酒水私域 CRM PRD

## 文档状态

- 版本：商业级当前基线
- 更新时间：2026-04-02
- 用途：作为仓库内唯一产品基线文档，约束当前交易模型、页面主视角、执行边界与后续切流方向

---

## 1. 产品定位

本系统是服务于酒水私域销售团队的内部 CRM，不是泛 ERP。

它服务的真实业务链路是：

- 线索导入
- 去重与归并
- 分配销售
- 客户承接
- 销售跟进
- 直播邀约与转化
- 成交下单
- 收款推进与催收
- 发货履约
- 物流跟进
- 审计留痕

---

## 2. 当前产品基线

### 2.1 客户与销售主线

- `Customer` 是销售执行主对象
- `Customer.ownerId` 是销售承接主字段
- Sales 主要从 `/customers` 工作，而不是 `/leads`
- `/leads` 主要服务 `ADMIN / SUPERVISOR` 做导入、审核、分配

### 2.2 交易与执行主线

- `TradeOrder` 是成交主单
- `SalesOrder` 是供应商子单
- `TradeOrderItem` 是销售侧父行，支持 `SKU / GIFT / BUNDLE`
- `TradeOrderItemComponent` 是执行层拆分真相
- `ShippingTask` 是子单级履约执行记录
- `PaymentPlan / PaymentRecord / CollectionTask` 是 payment layer 真相
- `CodCollectionRecord` 与 `LogisticsFollowUpTask` 分别承接 COD 与物流执行结果

### 2.3 当前页面主视角

- `/customers/[id]` 已切到 `TradeOrder` 新写路径
- `/orders` 已切到 `TradeOrder` 父单视角
- `/orders/[id]` 已切到父单详情页，供应商子单作为次级执行对象
- `/shipping`、`/payment-records`、`/collection-tasks` 仍保持子单执行主视角

---

## 3. 交易模型基线

### 3.1 父单与子单

- 一个 `TradeOrder` 表示客户这次整体买了什么、送了什么、总成交金额、总收款结构、统一审核状态
- 一个 `TradeOrder` 可以拆成多个 `SalesOrder`
- 一个 `SalesOrder` 只属于一个 supplier
- 同一 supplier 的商品或组件会自动合并到同一张子单
- 不同 supplier 的商品或组件必须拆成不同子单

### 3.2 当前新写路径已支持

- 多 SKU 直售
- 多 supplier 自动拆子单
- 标准 SKU 化赠品
- 套餐父行展开为多个组件并自动拆子单

### 3.3 当前不应回退的设计

- 不允许再把 `SalesOrder` 当作交易主单思考
- 不允许绕过 `TradeOrderItemComponent` 去做跨 supplier 履约
- 不允许把订单赠品重新写回自由文本 `SalesOrderGiftItem`
- 不允许让 `/shipping`、`/payment-records`、`/collection-tasks` 提前切成父单主视角

---

## 4. 商品与套餐基线

### 4.1 商品层

- `Supplier`
- `Product`
- `ProductSku`
- `ProductBundle`
- `ProductBundleItem`

### 4.2 套餐规则

- 套餐在销售侧以 `TradeOrderItem(type=BUNDLE)` 表达
- 套餐在执行侧展开为多个 `TradeOrderItemComponent`
- 组件按 supplier 自动拆入多个子单
- 导出、发货、物流、COD、保价都只看展开后的组件与 `SalesOrderItem`

### 4.3 套餐价格分摊

- 套餐父行保留成交价
- 组件按 `ProductSku.defaultUnitPrice * qty` 作为参考值做比例分摊
- 若参考值总和为 `0`，退回按数量比例
- 使用最大余数补分
- 精确到分
- 组件分摊金额总和必须严格等于套餐父行成交金额

---

## 5. 赠品基线

- 订单赠品的新写路径是 `TradeOrderItem(type=GIFT) + TradeOrderItemComponent(type=GIFT)`
- 第一版赠品必须选择标准 SKU
- 不支持自由文本赠品新写路径
- supplier 从赠品 SKU 自动继承
- 赠品金额恒为 `0`
- 赠品进入统一 supplier grouping、子单履约与导出件数

### 5.1 与 GiftRecord 的边界

- `GiftRecord` 继续服务营销 / 资格 / 运费语义
- 不把 `GiftRecord` 与订单赠品混成一条链

---

## 6. 审核、支付与履约规则

### 6.1 审核

- `TradeOrder.reviewStatus` 是主审核真相
- `SalesOrder.reviewStatus` 只是兼容镜像
- 提交审核时才物化子单
- 审核通过后才初始化 shipping / payment artifacts
- 审核拒绝时不初始化 artifacts

### 6.2 支付

- payment truth 在 `PaymentPlan / PaymentRecord / CollectionTask`
- `paymentScheme` 是订单侧场景分类，不是最终收款真相
- gift-only 子单不生成 payment artifacts
- 混合子单只按付费商品生成 payment artifacts

### 6.3 履约

- 一个 `SalesOrder` 当前仍只允许一个主 `ShippingTask`
- 导出、发货、物流、COD、保价都按子单粒度执行
- 导出品名与件数来自展开后的 `SalesOrderItem`

---

## 7. 角色边界

### ADMIN

- 全平台可见
- 管理组织、账号、团队、系统设置
- 可看全部客户、父单、子单、支付、履约、日志

### SUPERVISOR

- 团队级业务 owner
- 审核父单
- 看团队客户、团队父单、团队子单、团队支付与催收

### SALES

- 主要在 `/customers` 工作
- 创建和编辑自己客户的 `TradeOrder`
- 提交支付记录
- 跟进自己的催收与物流结果

### SHIPPER

- 主要在 `/shipping` 工作
- 处理 supplier 维度报单、导出、回填单号、推进履约状态
- 不承担交易审核与支付确认

### OPS

- 主要在直播与运营配置区域工作
- 不默认获得销售客户视图

---

## 8. 当前必须稳定的边界

- 不改 Prisma schema，除非进入新的 schema 里程碑
- 不回退 `TradeOrder` 写路径
- 不把 `/shipping`、`/payment-records`、`/collection-tasks` 改成父单主视角
- 不回头扩大 `GiftRecord` 写链
- 不扩展 legacy `Order`
- 不扩展 legacy `ShippingTask.orderId`
- 重要动作必须继续写 `OperationLog`

---

## 9. 下一阶段建议

当前推荐的后续方向不是再改 schema，而是继续做 V2 交易主线的执行层收口：

- 统一 execution surfaces 中的 `tradeNo / subOrderNo / supplier` 展示
- 补订单中心与子单执行页的产品层体验
- 继续完善 bundle / gift 在执行侧的可读性
- 仅在确有必要时再评估新的 schema 里程碑

