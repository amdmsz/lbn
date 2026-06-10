import { cn } from "@/lib/utils";

type CustomerCallProgressProps = {
  /** 已拨打次数. */
  callCount: number;
  /** 是否已加微 — 已加微则无需再看拨打进度, 直接 null. */
  isWechatAdded: boolean;
  /** 判定阈值, 默认 5 次. */
  target?: number;
  className?: string;
};

/**
 * 极简拨打进度小灰字 "已拨 2/5". 纯展示, 不挡任何操作.
 *
 * - isWechatAdded → 不渲染 (加微后这条进度无意义).
 * - callCount >= target → warning 色, 轻提醒"该判定/换策略", 但不阻断.
 *
 * 不碰 table / workbench / dialog, 不画圆点 / 进度条.
 */
export function CustomerCallProgress({
  callCount,
  isWechatAdded,
  target = 5,
  className,
}: CustomerCallProgressProps) {
  if (isWechatAdded) {
    return null;
  }

  const safeCount = Math.max(0, callCount);
  const reachedTarget = safeCount >= target;

  return (
    <span
      className={cn(
        "text-[0.75rem] tabular-nums",
        reachedTarget ? "text-[hsl(var(--warning-hsl))]" : "text-muted-foreground/70",
        className,
      )}
    >
      已拨 {safeCount}/{target}
    </span>
  );
}
