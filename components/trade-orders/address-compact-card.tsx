/**
 * AddressCompactCard — 订单详情 5 区聚焦后的"收货地址"主区单卡.
 *
 * 设计目标:
 * - 销售点进订单详情时, 收货是 5 大主区之一, 必须紧凑、可读、便于跟客户核对.
 * - 单卡 rounded-xl, 头部 icon + 标题, 内部紧凑 (姓名 + 电话 + 地址三行).
 * - 不展示内部 enum / id, 仅展示客户能看懂的人话.
 */

import { MapPin, Phone, User } from "lucide-react";

import { cn } from "@/lib/utils";

export type AddressCompactCardProps = Readonly<{
  receiverName: string;
  receiverPhone: string;
  receiverAddress: string;
}>;

export function AddressCompactCard({
  receiverName,
  receiverPhone,
  receiverAddress,
}: AddressCompactCardProps) {
  return (
    <section
      aria-label="收货地址"
      className={cn(
        "rounded-xl border border-border/60 bg-card px-4 py-3 shadow-sm",
      )}
    >
      <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
        收货
      </div>

      <div className="mt-2 space-y-1.5">
        <div className="flex items-center gap-2">
          <User className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span className="text-sm font-semibold text-foreground">
            {receiverName || "—"}
          </span>
          {receiverPhone ? (
            <>
              <span aria-hidden="true" className="text-border">·</span>
              <span className="inline-flex items-center gap-1 font-mono text-xs text-muted-foreground">
                <Phone className="h-3 w-3" aria-hidden="true" />
                {receiverPhone}
              </span>
            </>
          ) : null}
        </div>
        <div
          className="text-sm leading-5 text-muted-foreground"
          title={receiverAddress}
        >
          {receiverAddress || "—"}
        </div>
      </div>
    </section>
  );
}

export default AddressCompactCard;
