/**
 * OrderItemCard 是订单详情页"父单商品与成交信息"区域的单行成交项可视化卡片.
 *
 * 设计目标 (来自 DESIGN.md + 用户反馈):
 * - 用卡片化布局替代旧 TradeOrderItemsSection 里的"标签 + 字段堆"风格.
 * - 左侧固定 icon 占位 (lucide Package), 后续可换商品图; 商品名走大字主轴;
 *   规格 / SKU / 供货商以小 chip 流形式聚合在商品名之下.
 * - 右侧主轴: 数量 chip + 单价 + 大字行金额, 让"卖了什么 × 多少 = 多少"一眼可读.
 * - GIFT 类型用 dashed border 表达"赠送, 不收钱", 不在卡片里继续重复内部 enum.
 * - 不在前台展示内部 snapshot ID (bundleId / componentSourceType / componentSeq 等),
 *   也不重复展示原价 vs 成交价的"运维口径"分摊语义; 折扣金额只在 >0 时才出现.
 *
 * Dark mode: tone 颜色全部走 token (text-foreground / muted-foreground /
 * border-border / text-emerald-* / text-amber-*).
 */

import { Gift, Layers3, Package } from "lucide-react";

import { StatusBadge } from "@/components/shared/status-badge";
import { cn } from "@/lib/utils";

export type OrderItemCardItemType = "SKU" | "GIFT" | "BUNDLE";

export type OrderItemCardInput = Readonly<{
  /** 行类型, 决定卡片视觉 (dashed for GIFT, layers icon for BUNDLE) */
  itemType: OrderItemCardItemType;
  /** 行序号, 用于排序辅助显示 (例如 #1) */
  lineNo?: number;
  /** 标题快照 (优先) */
  titleSnapshot?: string | null;
  /** 商品名快照 */
  productNameSnapshot?: string | null;
  /** SKU 名称 */
  skuNameSnapshot?: string | null;
  /** 规格 */
  specSnapshot?: string | null;
  /** 单位 */
  unitSnapshot?: string | null;
  /** 数量 */
  qty: number;
  /** 成交单价 (已格式化字符串) */
  unitPrice: string;
  /** 行金额 (已格式化字符串) */
  subtotal: string;
  /** 折扣金额 (已格式化字符串), 0 时不展示 */
  discountAmount?: string;
  /** 供货商展示名 (来自 component supplierNameSnapshot 聚合) */
  supplierName?: string | null;
  /** 套餐编码 (仅 BUNDLE) */
  bundleCode?: string | null;
  /** 备注 */
  remark?: string | null;
}>;

function getDisplayTitle(input: OrderItemCardInput) {
  // 优先 productNameSnapshot (干净的商品名); titleSnapshot 通常是销售拼接的
  // "前缀 / 商品名 (规格) +赠品" 多段堆叠, 销售第一眼不需要; 落 chip 的信息
  // 已经在副行覆盖, 因此标题只显示 productName 或 sku, 不再回退到 title.
  const title =
    input.productNameSnapshot?.trim() ||
    input.skuNameSnapshot?.trim() ||
    input.titleSnapshot?.trim() ||
    "未命名商品";
  return title;
}

/** chip 去重: 与 title 完全相等或包含/被包含的 chip 不再渲染. */
function chipDistinctFromTitle(value: string | undefined | null, title: string) {
  const v = value?.trim();
  if (!v) return false;
  if (v === title) return false;
  if (title.includes(v)) return false;
  if (v.includes(title)) return false;
  return true;
}

function formatQty(qty: number, unit?: string | null) {
  const u = unit?.trim() ?? "";
  return u ? `×${qty}${u}` : `×${qty}`;
}

function isZeroAmount(amount?: string) {
  if (!amount) return true;
  const num = Number(amount.replace(/[^\d.-]/g, ""));
  return !Number.isFinite(num) || num === 0;
}

export function OrderItemCard(props: OrderItemCardInput) {
  const title = getDisplayTitle(props);
  const isGift = props.itemType === "GIFT";
  const isBundle = props.itemType === "BUNDLE";

  // 副信息 chip 流: sku / spec / supplier / bundleCode
  // 只在有值时落 chip, 与 title 重复/包含的不再渲染, 避免商品名重复 3 次.
  const chips: Array<{ key: string; label: string; variant: "neutral" | "info" | "warning" }> = [];
  if (chipDistinctFromTitle(props.skuNameSnapshot, title)) {
    chips.push({
      key: "sku",
      label: props.skuNameSnapshot!.trim(),
      variant: "neutral",
    });
  }
  if (chipDistinctFromTitle(props.specSnapshot, title)) {
    chips.push({
      key: "spec",
      label: props.specSnapshot!.trim(),
      variant: "neutral",
    });
  }
  if (chipDistinctFromTitle(props.supplierName, title)) {
    chips.push({
      key: "supplier",
      label: props.supplierName!.trim(),
      variant: "info",
    });
  }
  if (isBundle && props.bundleCode?.trim()) {
    chips.push({ key: "bundle", label: `套餐 ${props.bundleCode.trim()}`, variant: "warning" });
  }

  const Icon = isGift ? Gift : isBundle ? Layers3 : Package;

  const iconWrapClass = cn(
    "flex h-12 w-12 shrink-0 items-center justify-center rounded-lg",
    isGift && "bg-amber-500/10 text-amber-600 dark:bg-amber-500/15 dark:text-amber-300",
    isBundle && "bg-primary/10 text-primary",
    !isGift && !isBundle && "bg-muted/40 text-muted-foreground",
  );

  const wrapClass = cn(
    "flex flex-col gap-3 rounded-xl px-4 py-3.5 transition-[border-color,background-color] duration-150 sm:flex-row sm:items-center sm:gap-4",
    isGift
      ? "border border-dashed border-amber-300/70 bg-amber-50/30 dark:border-amber-500/30 dark:bg-amber-500/5"
      : "border border-border/60 bg-card hover:border-primary/30 hover:bg-muted/10",
  );

  return (
    <div className={wrapClass}>
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <span className={iconWrapClass} aria-hidden="true">
          <Icon className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate text-[15px] font-semibold leading-tight text-foreground">
              {title}
            </span>
            {isGift ? (
              <StatusBadge label="赠品" variant="warning" />
            ) : isBundle ? (
              <StatusBadge label="套餐" variant="info" />
            ) : null}
            {props.lineNo ? (
              <span className="text-[11px] font-medium text-muted-foreground">
                #{props.lineNo}
              </span>
            ) : null}
          </div>
          {chips.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {chips.map((chip) => (
                <StatusBadge key={chip.key} label={chip.label} variant={chip.variant} />
              ))}
            </div>
          ) : null}
          {props.remark ? (
            <p className="text-xs leading-5 text-muted-foreground">{props.remark}</p>
          ) : null}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-4 sm:flex-col sm:items-end sm:gap-1.5">
        <span className="inline-flex items-center rounded-full border border-border/60 bg-muted/30 px-2 py-[0.18rem] text-[11px] font-semibold tracking-[0.04em] text-muted-foreground">
          {formatQty(props.qty, props.unitSnapshot)}
        </span>
        <div className="text-right">
          {isGift ? (
            <div className="font-mono text-[15px] font-semibold text-amber-600 dark:text-amber-300">
              赠送
            </div>
          ) : (
            <>
              <div className="font-mono text-[1.05rem] font-semibold leading-tight text-foreground">
                {props.subtotal}
              </div>
              <div className="font-mono text-[11px] leading-4 text-muted-foreground">
                单价 {props.unitPrice}
              </div>
              {!isZeroAmount(props.discountAmount) ? (
                <div className="font-mono text-[11px] leading-4 text-amber-600 dark:text-amber-300">
                  折 {props.discountAmount}
                </div>
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
