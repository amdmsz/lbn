/**
 * Phase C — 发货人退货工作台 SSR 列表 query.
 *
 * 独立文件而非塞回 lib/shipping/returns.ts, 目的是把 service-layer (returns.ts)
 * 跟 UI-aggregation layer 解耦:
 *   - returns.ts: 写路径 / state machine / 跨域副作用 (RefundRequest 联动等)
 *   - returns-shipper-list.ts: 只读聚合, 仅服务 /shipping/returns workbench 这一个入口
 *
 * 范围:
 *   - 发货人 / 管理员看到的退货物流任务
 *   - 默认窗口: 当前活跃 (PENDING_RETURN_TRACKING / IN_RETURN_TRANSIT) + 最近 14 天的
 *     RETURNED_TO_WAREHOUSE, 后者用来给发货人确认 "我刚入库的单子" 提供 self-audit 视图
 */

import type { RoleCode } from "@prisma/client";
import { ShippingReturnStatus } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";

export type ShippingReturnShipperListActor = {
  id: string;
  role: RoleCode;
};

// 默认 RETURNED_TO_WAREHOUSE 回看窗口 — 不读太久远, 避免 panel 长尾
const RETURNED_LOOKBACK_DAYS = 14;

export type ShippingReturnShipperListRow = Awaited<
  ReturnType<typeof listShippingReturnsForShipper>
>[number];

/**
 * 发货人 / 管理员侧的退货物流跟踪列表.
 *
 * 状态过滤:
 *   - PENDING_RETURN_TRACKING — 待填运单 (待办)
 *   - IN_RETURN_TRANSIT       — 回程在途 (跟踪中)
 *   - RETURNED_TO_WAREHOUSE   — 近 N 天的已入库 (audit 用, 不放久远历史)
 *
 * 显式不返:
 *   - PENDING_REVIEW — 还在主管复审, 跟发货人无关
 *   - REJECTED / CANCELED — 终态, 由 orders/[id] 时间线查阅, 不在 workbench 占行
 *
 * 排序: 按 status 状态优先级 (待办在前), 然后按 requestedAt desc.
 *
 * NB: 这里不做 role gating — 由 page 通过 canFillShippingReturnTracking /
 * canConfirmShippingReturnReceived 决定能否进入, service 层信任 actor.
 */
export async function listShippingReturnsForShipper(
  _actor: ShippingReturnShipperListActor,
) {
  const lookbackStart = new Date();
  lookbackStart.setDate(lookbackStart.getDate() - RETURNED_LOOKBACK_DAYS);

  const rows = await prisma.shippingReturn.findMany({
    where: {
      OR: [
        {
          status: {
            in: [
              ShippingReturnStatus.PENDING_RETURN_TRACKING,
              ShippingReturnStatus.IN_RETURN_TRANSIT,
            ],
          },
        },
        {
          status: ShippingReturnStatus.RETURNED_TO_WAREHOUSE,
          receivedAt: { gte: lookbackStart },
        },
      ],
    },
    include: {
      tradeOrder: {
        select: {
          id: true,
          tradeNo: true,
          items: {
            select: {
              titleSnapshot: true,
              productNameSnapshot: true,
              skuNameSnapshot: true,
              qty: true,
            },
            orderBy: { lineNo: "asc" },
            take: 4,
          },
        },
      },
      customer: { select: { id: true, name: true, phone: true } },
      requester: { select: { id: true, name: true, username: true } },
      reviewer: { select: { id: true, name: true, username: true } },
      trackingFilledBy: { select: { id: true, name: true, username: true } },
      receivedBy: { select: { id: true, name: true, username: true } },
      shippingTask: {
        select: {
          id: true,
          trackingNumber: true,
          carrier: true,
          shippedAt: true,
        },
      },
    },
    orderBy: [{ status: "asc" }, { requestedAt: "desc" }],
    take: 80,
  });

  return rows.map((row) => ({
    ...row,
    productSummary: summarizeTradeOrderItems(row.tradeOrder.items),
  }));
}

function summarizeTradeOrderItems(
  items: ReadonlyArray<{
    titleSnapshot: string;
    productNameSnapshot: string | null;
    skuNameSnapshot: string | null;
    qty: number;
  }>,
) {
  if (items.length === 0) return "";
  const head = items
    .slice(0, 2)
    .map((it) => {
      const label =
        it.productNameSnapshot?.trim() ||
        it.titleSnapshot.trim() ||
        it.skuNameSnapshot?.trim() ||
        "未命名商品";
      return `${label} ×${it.qty}`;
    })
    .join(" / ");
  return items.length > 2 ? `${head} 等 ${items.length} 项` : head;
}
