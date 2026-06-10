import { Phone } from "lucide-react";
import { cn } from "@/lib/utils";

type CustomerTodayStatsProps = {
  /** 今日已拨出电话数. */
  dialedToday: number;
  /** 今日新加微信数. */
  wechatToday: number;
  /** 当前队列待拨打剩余人数. */
  pendingDialCount: number;
  className?: string;
};

const numberFormatter = new Intl.NumberFormat("zh-CN");

function formatCount(value: number) {
  return numberFormatter.format(Math.max(0, value));
}

/**
 * 今日战绩条 — 纯展示 server 组件. 一行 (移动端自然换行),
 * 无进度条 / 无目标值, 只读三个数. 不碰 table / workbench / dialog.
 */
export function CustomerTodayStats({
  dialedToday,
  wechatToday,
  pendingDialCount,
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
        <strong className="font-semibold tabular-nums">{formatCount(dialedToday)}</strong>
      </span>
      <span aria-hidden className="text-muted-foreground/50">
        ·
      </span>
      <span className="inline-flex items-baseline gap-1">
        加微
        <strong className="font-semibold tabular-nums">{formatCount(wechatToday)}</strong>
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
