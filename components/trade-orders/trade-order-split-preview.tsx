"use client";

import type { TradeOrderDraftComputation } from "@/lib/trade-orders/workflow";

function formatCurrency(value: number) {
  return new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency: "CNY",
    minimumFractionDigits: 2,
  }).format(value);
}

export function TradeOrderSplitPreview({
  computation,
}: Readonly<{
  computation: TradeOrderDraftComputation;
}>) {
  const ready = computation.items.length > 0 && computation.issues.length === 0;
  const goodsLineCount =
    computation.totals.skuLineCount + computation.totals.bundleLineCount;

  return (
    <section className="crm-subtle-panel space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="crm-detail-label">拆单预览</p>
          <div className="text-sm font-medium text-black/82">
            {ready
              ? `提交后将按 supplier 拆成 ${computation.groups.length} 张子单`
              : "当前明细还未满足提交条件"}
          </div>
          <p className="text-xs leading-6 text-black/55">
            这里仅展示当前成交主单提交审核后，按 supplier 自动拆单的结果预览。
          </p>
        </div>

        <div className="grid min-w-[260px] gap-2 text-right text-xs text-black/52">
          <div>商品行：{goodsLineCount}</div>
          <div>赠品行：{computation.totals.giftLineCount}</div>
          <div>展开后总件数：{computation.totals.qtyTotal}</div>
          <div>成交金额：{formatCurrency(computation.totals.finalAmount)}</div>
        </div>
      </div>

      {computation.issues.length > 0 ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50/80 px-4 py-3 text-sm text-amber-900">
          <div className="font-medium">提交前还需要处理这些问题</div>
          <ul className="mt-2 space-y-1.5 text-xs leading-6 text-amber-900/82">
            {computation.issues.map((issue, index) => (
              <li key={`${issue.code}-${issue.lineId ?? index}`}>{issue.message}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {computation.groups.length > 0 ? (
        <div className="grid gap-3 xl:grid-cols-2">
          {computation.groups.map((group) => {
            const groupGoodsLineCount = group.skuLineCount + group.bundleLineCount;

            return (
              <div
                key={group.supplierId}
                className="rounded-2xl border border-black/8 bg-white/76 px-4 py-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="text-sm font-medium text-black/82">{group.supplierName}</div>
                    <div className="mt-1 text-xs text-black/50">
                      商品行 {groupGoodsLineCount} / 赠品 {group.giftLineCount}
                    </div>
                  </div>
                  <div className="text-sm font-medium text-black/76">
                    {formatCurrency(group.finalAmount)}
                  </div>
                </div>
                <div className="mt-2 text-xs leading-6 text-black/52">
                  展开后 {group.componentCount} 个执行组件 / 共 {group.qtyTotal} 件
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-black/10 bg-white/55 px-4 py-3 text-sm text-black/55">
          添加商品或赠品后，这里会显示最终按 supplier 自动拆分的结果。
        </div>
      )}
    </section>
  );
}
