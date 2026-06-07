/**
 * CustomerCompactCard — 订单详情第二轮瘦身后的"下单人"主区卡片.
 *
 * 设计目标:
 * - 销售点进订单详情第一眼: 谁下的, 怎么联系, 哪个销售负责.
 * - 单卡 rounded-xl, 1 行排版 (头像 + 姓名 + 电话 + 销售归属), 不堆陈业务字段.
 * - Stripe Payment / Linear Issue 风格的紧凑主区头.
 * - 不在卡内塞 customer.id / ownerId / 内部 enum.
 */

import Link from "next/link";
import { Phone, User } from "lucide-react";

import { cn } from "@/lib/utils";

export type CustomerCompactCardProps = Readonly<{
  customerId: string;
  customerName: string;
  customerPhone?: string | null;
  owner: { name: string | null; username: string } | null;
}>;

function Avatar({ name }: { name: string }) {
  const ch = name.trim().slice(0, 1) || "·";
  return (
    <div
      aria-hidden="true"
      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border/60 bg-muted/40 text-sm font-semibold text-foreground"
    >
      {ch}
    </div>
  );
}

export function CustomerCompactCard({
  customerId,
  customerName,
  customerPhone,
  owner,
}: CustomerCompactCardProps) {
  const ownerLabel = owner?.name || owner?.username || "暂无归属销售";

  return (
    <section
      aria-label="下单人"
      className={cn(
        "flex flex-wrap items-center gap-x-5 gap-y-2 rounded-xl border border-border/60 bg-card px-4 py-3 shadow-sm",
      )}
    >
      <div className="flex min-w-0 items-center gap-3">
        <Avatar name={customerName} />
        <div className="min-w-0 space-y-0.5">
          <div className="flex items-center gap-2">
            <Link
              href={`/customers/${customerId}`}
              className="truncate text-[15px] font-semibold leading-tight text-foreground transition-colors hover:text-primary"
            >
              {customerName}
            </Link>
          </div>
          {customerPhone ? (
            <div className="inline-flex items-center gap-1.5 font-mono text-xs text-muted-foreground">
              <Phone className="h-3 w-3" aria-hidden="true" />
              {customerPhone}
            </div>
          ) : null}
        </div>
      </div>

      <div className="ml-auto inline-flex items-center gap-1.5 text-xs text-muted-foreground">
        <User className="h-3.5 w-3.5" aria-hidden="true" />
        <span className="text-muted-foreground/70">销售</span>
        <span className="font-medium text-foreground">{ownerLabel}</span>
      </div>
    </section>
  );
}

export default CustomerCompactCard;
