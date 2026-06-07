"use client";

import { useState, type ReactNode } from "react";
import { ArrowLeftRight, Banknote, PackageX, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

// 订单详情行动区
//
// 设计原则:
// - 把 "调整订单 / 退款 / 退货" 3 个 banner 合并成 1 张行动卡
// - 顶部行: tab/chip 切换 (仅显示当前可用动作)
// - 选中后下方展开 children 面板
// - 没有任何可用动作时, 显示 calm "本订单可正常推进" 提示
// - dark mode 兼容 (使用 tone token: amber / info / danger)
// - 不引入新依赖, lucide-react icon

export type OrderActionZoneTabKey = "revision" | "refund" | "return";

type ToneKey = "amber" | "info" | "danger";

const TAB_TONE: Record<OrderActionZoneTabKey, ToneKey> = {
  revision: "amber",
  refund: "info",
  return: "danger",
};

const TAB_LABEL: Record<OrderActionZoneTabKey, string> = {
  revision: "调整订单",
  refund: "退款",
  return: "退货",
};

const TAB_ICON: Record<OrderActionZoneTabKey, typeof ArrowLeftRight> = {
  revision: ArrowLeftRight,
  refund: Banknote,
  return: PackageX,
};

// tone → 选中态/未选中态/边框 token. 全部走 tailwind 的可达 token, 兼容 dark mode.
const TONE_ACTIVE: Record<ToneKey, string> = {
  amber:
    "border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-200",
  info: "border-[rgba(61,124,255,0.35)] bg-[rgba(61,124,255,0.10)] text-[var(--color-info)]",
  danger:
    "border-[rgba(209,91,118,0.35)] bg-[rgba(209,91,118,0.10)] text-[var(--color-danger)]",
};

const TONE_INACTIVE =
  "border-border/60 bg-card text-muted-foreground hover:border-border hover:text-foreground";

export type OrderActionZoneTab = Readonly<{
  key: OrderActionZoneTabKey;
  available: boolean;
  hint?: string | null;
  // 子面板 (现有 RevisionPanel / RefundPanel / ShippingReturnPanel 等)
  // 注: 类型用 ReactNode, 由调用方自己决定 server / client.
  content?: ReactNode;
  // 高亮标记 (例如有进行中流程时小红点)
  active?: boolean;
}>;

export type OrderActionZoneProps = Readonly<{
  tabs: OrderActionZoneTab[];
  // 默认展开哪一个 tab; 未传则取第一个 active 或第一个 available
  defaultTab?: OrderActionZoneTabKey;
}>;

function resolveDefaultTab(
  tabs: OrderActionZoneTab[],
  preferred?: OrderActionZoneTabKey,
): OrderActionZoneTabKey | null {
  if (preferred) {
    const hit = tabs.find((t) => t.key === preferred && t.available);
    if (hit) return preferred;
  }
  const ongoing = tabs.find((t) => t.available && t.active);
  if (ongoing) return ongoing.key;
  const firstAvailable = tabs.find((t) => t.available);
  return firstAvailable?.key ?? null;
}

export function OrderActionZone({ tabs, defaultTab }: OrderActionZoneProps) {
  const initial = resolveDefaultTab(tabs, defaultTab);
  const [active, setActive] = useState<OrderActionZoneTabKey | null>(initial);

  const availableTabs = tabs.filter((t) => t.available);

  // 空态: 没有任何可用动作, 显示 calm 提示
  if (availableTabs.length === 0) {
    return (
      <section className="rounded-xl border border-border/60 bg-card px-4 py-3 shadow-sm">
        <div className="flex items-center gap-2.5 text-sm text-muted-foreground">
          <Sparkles
            className="h-4 w-4 shrink-0 text-muted-foreground"
            aria-hidden="true"
          />
          <span>本订单可正常推进, 客户反悔时这里会出现快捷入口。</span>
        </div>
      </section>
    );
  }

  const activeTab = active ? availableTabs.find((t) => t.key === active) : null;
  const resolvedActive = activeTab ?? availableTabs[0];

  return (
    <section className="rounded-xl border border-border/60 bg-card px-4 py-4 shadow-sm">
      {/* tab 行 */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          行动区
        </span>
        <div className="flex flex-wrap gap-1.5">
          {availableTabs.map((tab) => {
            const Icon = TAB_ICON[tab.key];
            const tone = TAB_TONE[tab.key];
            const isActive = resolvedActive.key === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActive(tab.key)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                  isActive ? TONE_ACTIVE[tone] : TONE_INACTIVE,
                )}
                aria-pressed={isActive}
              >
                <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                <span>{TAB_LABEL[tab.key]}</span>
                {tab.active ? (
                  <span
                    aria-hidden="true"
                    className={cn(
                      "h-1.5 w-1.5 rounded-full",
                      tone === "amber"
                        ? "bg-amber-500"
                        : tone === "info"
                          ? "bg-[var(--color-info)]"
                          : "bg-[var(--color-danger)]",
                    )}
                  />
                ) : null}
              </button>
            );
          })}
        </div>
      </div>

      {/* 当前 tab 的 hint */}
      {resolvedActive.hint ? (
        <p className="mt-2 text-xs text-muted-foreground">{resolvedActive.hint}</p>
      ) : null}

      {/* 当前 tab 内容 */}
      {resolvedActive.content ? (
        <div className="mt-3">{resolvedActive.content}</div>
      ) : null}
    </section>
  );
}

export default OrderActionZone;
