import { Phone } from "lucide-react";
import { cn } from "@/lib/utils";

type CustomerTodayStatsProps = {
  /** 当前登录人今日拨打数 (CallRecord.salesId = viewer, callTime 在今日). */
  myDialedToday: number;
  /**
   * 可见范围内今日拨打总数. SALES 视角后端已与 myDialedToday 合一
   * (scope = 自己), 两者数值相同.
   */
  scopeDialedToday: number;
  /** 可见范围内今日新加微数. */
  wechatAddedToday: number;
  /** 待拨打队列剩余人数. */
  pendingDialCount: number;
  /**
   * SALES 视角 "今日已拨" 只显示一个数; SUPERVISOR/ADMIN 显示范围总数 +
   * 括注个人数 "(我 M)".
   */
  isSalesViewer: boolean;
  className?: string;
};

const numberFormatter = new Intl.NumberFormat("zh-CN");

function formatCount(value: number) {
  return numberFormatter.format(Math.max(0, value));
}

/**
 * 今日战绩条 — 纯展示 server 组件. 一行 (移动端自然换行),
 * 无进度条 / 无目标值, 只读 count. 不碰 table / workbench / dialog.
 *
 * - SALES: "今日已拨 N · 加微 N · 待拨打还剩 N 人".
 * - SUPERVISOR/ADMIN: "今日已拨 N (我 M) · 加微 N · 待拨打还剩 N 人" —
 *   范围总数与个人数并列.
 */
export function CustomerTodayStats({
  myDialedToday,
  scopeDialedToday,
  wechatAddedToday,
  pendingDialCount,
  isSalesViewer,
  className,
}: CustomerTodayStatsProps) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg bg-secondary px-4 py-3",
        "text-[0.8125rem] text-secondary-foreground",
        className,
      )}
    >
      <Phone className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
      <span className="inline-flex items-baseline gap-1">
        今日已拨
        <strong className="font-semibold tabular-nums">
          {formatCount(scopeDialedToday)}
        </strong>
        {isSalesViewer ? null : (
          <span className="text-muted-foreground">
            (我 <span className="tabular-nums">{formatCount(myDialedToday)}</span>)
          </span>
        )}
      </span>
      <span aria-hidden className="text-muted-foreground/50">
        ·
      </span>
      <span className="inline-flex items-baseline gap-1">
        加微
        <strong className="font-semibold tabular-nums">
          {formatCount(wechatAddedToday)}
        </strong>
      </span>
      <span aria-hidden className="text-muted-foreground/50">
        ·
      </span>
      <span className="inline-flex items-baseline gap-1 text-muted-foreground">
        待拨打还剩
        <strong className="font-semibold tabular-nums text-foreground">
          {formatCount(pendingDialCount)}
        </strong>
        人
      </span>
    </div>
  );
}
