"use client";

import type { TradeOrderDraftComputation } from "@/lib/trade-orders/workflow";

function formatCurrency(value: number) {
  return new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency: "CNY",
    minimumFractionDigits: 2,
  }).format(value);
}

function getItemTypeLabel(itemType: TradeOrderDraftComputation["items"][number]["itemType"]) {
  if (itemType === "BUNDLE") {
    return "套餐";
  }

  if (itemType === "GIFT") {
    return "赠品";
  }

  return "商品";
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
              ? `提交后将保留 ${computation.items.length} 条成交行，并按 supplier 拆成 ${computation.groups.length} 张执行子单`
              : "当前明细还未满足提交条件"}
          </div>
          <p className="text-xs leading-6 text-black/55">
            上层展示成交语义行，下层展示 supplier 执行分组。拆单只影响执行归属，不会把多个独立酒回写成一条成交商品。
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

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
        <div className="space-y-3">
          <div>
            <div className="text-sm font-medium text-black/82">成交层独立行</div>
            <div className="mt-1 text-xs leading-6 text-black/55">
              多个独立酒默认保持多条成交行；只有明确套餐才进入 bundle/component。
            </div>
          </div>

          {computation.items.length > 0 ? (
            <div className="space-y-2.5">
              {computation.items.map((item) => (
                <div
                  key={item.lineId}
                  className="rounded-2xl border border-black/8 bg-white/76 px-4 py-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full border border-black/10 px-2 py-0.5 text-[11px] text-black/56">
                        行 {item.lineNo}
                      </span>
                      <span className="rounded-full border border-black/10 px-2 py-0.5 text-[11px] text-black/56">
                        {getItemTypeLabel(item.itemType)}
                      </span>
                    </div>
                    <div className="text-sm font-medium text-black/76">
                      {item.itemType === "GIFT" ? "赠品" : formatCurrency(item.finalAmount)}
                    </div>
                  </div>
                  <div className="mt-2 text-sm font-medium text-black/84">{item.title}</div>
                  <div className="mt-1 text-xs leading-6 text-black/52">
                    数量 {item.qty}
                    {item.itemType === "BUNDLE"
                      ? ` / 组件 ${item.components.length} / 覆盖 ${item.supplierNames.length} 个 supplier`
                      : ""}
                  </div>
                  <div className="mt-1 text-xs leading-6 text-black/52">
                    执行归属：{item.supplierNames.join(" / ")}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-black/10 bg-white/55 px-4 py-3 text-sm text-black/55">
              添加商品、赠品或套餐后，这里会先显示成交层独立行。
            </div>
          )}
        </div>

        <div className="space-y-3">
          <div>
            <div className="text-sm font-medium text-black/82">supplier 执行分组</div>
            <div className="mt-1 text-xs leading-6 text-black/55">
              这里仅表示提交审核后生成的执行子单归属，不代表成交层商品被合并。
            </div>
          </div>

          {computation.groups.length > 0 ? (
            <div className="space-y-2.5">
              {computation.groups.map((group) => {
                const groupGoodsLineCount = group.skuLineCount + group.bundleLineCount;

                return (
                  <div
                    key={group.supplierId}
                    className="rounded-2xl border border-black/8 bg-white/76 px-4 py-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <div className="text-sm font-medium text-black/82">
                          {group.supplierName}
                        </div>
                        <div className="mt-1 text-xs text-black/50">
                          成交行 {group.lineCount} / 商品 {groupGoodsLineCount} / 赠品{" "}
                          {group.giftLineCount}
                        </div>
                      </div>
                      <div className="text-sm font-medium text-black/76">
                        {formatCurrency(group.finalAmount)}
                      </div>
                    </div>
                    <div className="mt-2 text-xs leading-6 text-black/52">
                      执行组件 {group.componentCount} / 总件数 {group.qtyTotal}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-black/10 bg-white/55 px-4 py-3 text-sm text-black/55">
              成交明细完整后，这里会显示按 supplier 自动拆分出的执行分组。
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
