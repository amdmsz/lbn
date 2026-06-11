/**
 * 客户分级 (Customer Grade) — A/B/C/D/E/F.
 *
 * 业务定义 (销售口述, 不要再改语义):
 *
 *   A 级 = 有订单的客户 (approved TradeOrder, 或历史 SalesOrder, 任一即可)
 *   B 级 = 加了微信的客户 (有 wechatId 或 wechatRecord.addedAt 已落)
 *   C 级 = 已邀约直播的客户 (有 liveInvitation)
 *   D 级 = 未接听电话的客户 (有 callRecord 但都没接通)
 *   E 级 = 拒加 (客户明确拒绝加微信: 通话 result = REFUSED_WECHAT 或微信申请被拒)
 *   F 级 = 空号 (手机号无效, 通话 result = INVALID_NUMBER 或被显式标记)
 *
 * 优先级 (高 -> 低): A > B > C > F > E > D
 *   - A 一旦给定就不降级, 除非订单全部被撤销 (调用方需在 reCompute 时确保数据已撤销)
 *   - "加微信" + "邀约直播" 并存时, B (微信) 优于 C (直播)
 *   - 空号 F / 拒加 E 都是稳定结论, 比 D ("暂时没接到") 强; F 比 E 强 (号都打不通)
 *   - 完全没数据时返回 null, mutation 不写入 grade, 让上游决定
 *
 * 历史: E 档原来只存在于"客户分类"(executionClass, 查询期内存推导); 用户要求两套
 * 合并后, grade 成为唯一对外的客户分类口径, E 在此落库.
 *
 * 这个文件只有纯函数, 没有 prisma client. lib/customers/queries.ts 在做 customer
 * snapshot 时可以拿到必要字段后调用; mutation 改完客户后也可以重新调一次, 把
 * grade 写回去.
 */
import {
  CallResult,
  CustomerGrade,
  TradeOrderStatus,
  WechatAddStatus,
  type Prisma,
  type PrismaClient,
} from "@prisma/client";

export type CustomerGradeSignal = {
  /**
   * 已审批的 TradeOrder 数 + 历史 SalesOrder 数. 大于 0 = A.
   * 调用方应该传 reviewed/approved 状态的订单, 不能算上 DRAFT.
   */
  approvedOrderCount: number;
  /**
   * 是否加了微信. 任一为 true 即视为 B 候选:
   *   - Customer.wechatId 非空
   *   - WechatRecord 至少一条 addedStatus = ADDED (或 addedAt 非空)
   */
  hasWechat: boolean;
  /**
   * 是否已邀约直播. LiveInvitation 至少一条即为 true.
   */
  hasLiveInvitation: boolean;
  /**
   * 手机号是否为空号. 任一为 true 即为 F:
   *   - 调用方显式传 true (例如运营手工标记)
   *   - CallRecord 中存在 result = INVALID_NUMBER
   */
  isInvalidNumber: boolean;
  /**
   * 是否明确拒绝加微信. 任一为 true 即为 E 候选:
   *   - CallRecord 中存在 result = REFUSED_WECHAT
   *   - WechatRecord 存在 addedStatus = REJECTED
   */
  hasRefusedWechat: boolean;
  /**
   * 是否打过电话但全部没接通. 仅当上述 A/B/C/F 都不满足时才看. 任一为 true 即为 D:
   *   - CallRecord 至少一条 result = NOT_CONNECTED / HUNG_UP / CONNECTED_NO_TALK
   *   - 简化策略: 调用方传 "有通话且 0 个 INTERESTED/WECHAT_ADDED" 也可以
   */
  hasUnansweredCall: boolean;
};

/**
 * 推导客户分级. 优先级: A > B > C > F > E > D.
 *
 * 返回 null 表示当前数据不足以判定 (新建客户还没动作, 不应该硬塞 D).
 */
export function deriveCustomerGrade(
  signal: CustomerGradeSignal,
): CustomerGrade | null {
  if (signal.approvedOrderCount > 0) {
    return CustomerGrade.A;
  }
  if (signal.hasWechat) {
    return CustomerGrade.B;
  }
  if (signal.hasLiveInvitation) {
    return CustomerGrade.C;
  }
  if (signal.isInvalidNumber) {
    return CustomerGrade.F;
  }
  if (signal.hasRefusedWechat) {
    return CustomerGrade.E;
  }
  if (signal.hasUnansweredCall) {
    return CustomerGrade.D;
  }
  return null;
}

/**
 * 高优 grade 不能被低优 grade 覆盖.
 *
 * 用法 (典型 mutation 路径):
 *   const next = deriveCustomerGrade(signal);
 *   const final = pickHigherGrade(current, next);
 *   if (final && final !== current) await tx.customer.update({...});
 *
 * 例外: 订单全部撤销后 (approvedOrderCount = 0) 想从 A 降级, 调用方应该绕过这个
 * 函数, 直接拿 deriveCustomerGrade 的结果写库. 这里只挡 "顺手 update" 路径.
 */
export function pickHigherGrade(
  current: CustomerGrade | null,
  next: CustomerGrade | null,
): CustomerGrade | null {
  if (!current) {
    return next;
  }
  if (!next) {
    return current;
  }
  const currentRank = GRADE_RANK[current];
  const nextRank = GRADE_RANK[next];
  return nextRank > currentRank ? next : current;
}

/**
 * grade 排序权重. 数字越大越高优. 用于 pickHigherGrade.
 *
 * 顺序: A(6) > B(5) > C(4) > F(3) > E(2) > D(1).
 * F / E > D 因为 "空号 / 拒加" 是稳定结论, "未接听" 是最弱信号.
 */
const GRADE_RANK: Record<CustomerGrade, number> = {
  [CustomerGrade.A]: 6,
  [CustomerGrade.B]: 5,
  [CustomerGrade.C]: 4,
  [CustomerGrade.F]: 3,
  [CustomerGrade.E]: 2,
  [CustomerGrade.D]: 1,
};

/**
 * UI tone 映射 (compact-badge-group). primary 给 A (最高, 主色强调),
 * success 给 B (加微信, 销售里程碑), info 给 C (邀约直播, 进行中),
 * warning 给 D (未接听, 需要再跟), danger 给 F (空号, 死路).
 */
export const CUSTOMER_GRADE_BADGE_TONE: Record<
  CustomerGrade,
  "primary" | "success" | "info" | "warning" | "danger"
> = {
  [CustomerGrade.A]: "primary",
  [CustomerGrade.B]: "success",
  [CustomerGrade.C]: "info",
  [CustomerGrade.D]: "warning",
  [CustomerGrade.E]: "danger",
  [CustomerGrade.F]: "danger",
};

/**
 * UI 显示标签. 含 grade 字母 + 含义短描述.
 */
export const CUSTOMER_GRADE_LABEL: Record<CustomerGrade, string> = {
  [CustomerGrade.A]: "A · 已成交",
  [CustomerGrade.B]: "B · 已加微",
  [CustomerGrade.C]: "C · 邀约直播",
  [CustomerGrade.D]: "D · 未接通",
  [CustomerGrade.E]: "E · 拒加",
  [CustomerGrade.F]: "F · 空号",
};

/**
 * 筛选面板用的含义短描述 (与原"客户分类"文案对齐).
 */
export const CUSTOMER_GRADE_DESCRIPTION: Record<CustomerGrade, string> = {
  [CustomerGrade.A]: "已形成成交结果。",
  [CustomerGrade.B]: "已进入微信承接。",
  [CustomerGrade.C]: "已形成直播邀约动作。",
  [CustomerGrade.D]: "打过电话但还未建立有效联系。",
  [CustomerGrade.E]: "客户明确拒绝加微信。",
  [CustomerGrade.F]: "手机号无效（空号）。",
};

/**
 * 短 chip 显示 (列表里, 1 个字).
 */
export const CUSTOMER_GRADE_SHORT_LABEL: Record<CustomerGrade, string> = {
  [CustomerGrade.A]: "A",
  [CustomerGrade.B]: "B",
  [CustomerGrade.C]: "C",
  [CustomerGrade.D]: "D",
  [CustomerGrade.E]: "E",
  [CustomerGrade.F]: "F",
};

export const CUSTOMER_GRADE_VALUES = [
  CustomerGrade.A,
  CustomerGrade.B,
  CustomerGrade.C,
  CustomerGrade.D,
  CustomerGrade.E,
  CustomerGrade.F,
] as const satisfies readonly CustomerGrade[];

/**
 * Prisma 事务客户端的最小子集 (够 grade 计算用).
 *
 * 我们不直接接 `prisma.PrismaClient` — 客户中心 mutation 都在 `$transaction` 里
 * 跑, 透传一个 `tx` 进来更稳, 也方便单测换 stub.
 */
type CustomerGradeTx = Pick<
  PrismaClient,
  "customer" | "tradeOrder" | "salesOrder" | "wechatRecord" | "liveInvitation" | "callRecord"
>;

/**
 * 读取派生 grade 所需的全部信号. 调用方一次性把 5 个状态 (订单 / 微信 / 直播 /
 * 空号 / 未接通) 查清楚, 然后 deriveCustomerGrade.
 *
 * 注意:
 *   - approvedOrderCount 只算 APPROVED 的 TradeOrder + 任一 SalesOrder. 不算
 *     DRAFT / REJECTED / CANCELED.
 *   - hasWechat 看 Customer.wechatId 非空 *或* WechatRecord.addedStatus = ADDED.
 *   - hasUnansweredCall: 至少 1 条 callRecord, 且其中至少 1 条 result 命中
 *     "未接通" 三种 (NOT_CONNECTED / HUNG_UP / CONNECTED_NO_TALK).
 *     如果同时存在 INVALID_NUMBER, 走 isInvalidNumber.
 */
export async function readCustomerGradeSignal(
  tx: CustomerGradeTx,
  customerId: string,
): Promise<CustomerGradeSignal> {
  const [
    customer,
    approvedTradeOrderCount,
    salesOrderCount,
    wechatAddedCount,
    liveInvitationCount,
    invalidCallCount,
    refusedWechatCallCount,
    wechatRejectedCount,
    unansweredCallCount,
  ] = await Promise.all([
    tx.customer.findUnique({
      where: { id: customerId },
      select: { wechatId: true },
    }),
    tx.tradeOrder.count({
      where: { customerId, tradeStatus: TradeOrderStatus.APPROVED },
    }),
    tx.salesOrder.count({ where: { customerId } }),
    tx.wechatRecord.count({
      where: { customerId, addedStatus: WechatAddStatus.ADDED },
    }),
    tx.liveInvitation.count({ where: { customerId } }),
    tx.callRecord.count({
      where: { customerId, result: CallResult.INVALID_NUMBER },
    }),
    tx.callRecord.count({
      where: { customerId, result: CallResult.REFUSED_WECHAT },
    }),
    tx.wechatRecord.count({
      where: { customerId, addedStatus: WechatAddStatus.REJECTED },
    }),
    tx.callRecord.count({
      where: {
        customerId,
        result: {
          in: [
            CallResult.NOT_CONNECTED,
            CallResult.HUNG_UP,
            CallResult.CONNECTED_NO_TALK,
          ],
        },
      },
    }),
  ]);

  return {
    approvedOrderCount: approvedTradeOrderCount + salesOrderCount,
    hasWechat:
      Boolean(customer?.wechatId?.trim()) || wechatAddedCount > 0,
    hasLiveInvitation: liveInvitationCount > 0,
    isInvalidNumber: invalidCallCount > 0,
    hasRefusedWechat: refusedWechatCallCount > 0 || wechatRejectedCount > 0,
    hasUnansweredCall: unansweredCallCount > 0,
  };
}

export type RecomputeCustomerGradeOptions = {
  /**
   * 强制写入派生 grade, 哪怕推导值比当前还低. 用于订单全部撤销后的"降级" 路径.
   * 默认 false: 走 pickHigherGrade, 不允许低优 grade 顶替高优.
   */
  allowDowngrade?: boolean;
  /**
   * 已经查到的当前 grade, 调用方提供时可以省一次 SELECT. 不传则现查.
   */
  currentGrade?: CustomerGrade | null;
};

/**
 * 中心化的 "重算并写回 grade" 入口. 适合在 mutation 末尾调一次.
 *
 * 用法:
 *   await prisma.$transaction(async (tx) => {
 *     // ... 其他业务变更 ...
 *     await recomputeCustomerGrade(tx, customerId);
 *   });
 *
 * 返回 next grade (可能 = current, 表示没动).
 */
export async function recomputeCustomerGrade(
  tx: CustomerGradeTx,
  customerId: string,
  options: RecomputeCustomerGradeOptions = {},
): Promise<CustomerGrade | null> {
  const [signal, currentRow] = await Promise.all([
    readCustomerGradeSignal(tx, customerId),
    options.currentGrade !== undefined
      ? Promise.resolve({ grade: options.currentGrade })
      : tx.customer.findUnique({
          where: { id: customerId },
          select: { grade: true },
        }),
  ]);

  const derived = deriveCustomerGrade(signal);
  const current = currentRow?.grade ?? null;
  const next = options.allowDowngrade
    ? derived
    : pickHigherGrade(current, derived);

  if (next !== current) {
    await tx.customer.update({
      where: { id: customerId },
      data: { grade: next },
    });
  }

  return next;
}

/**
 * 给批量入口 (例如导入 / 批量分配) 的稳健入口. 不抛错, 即使读取信号 / 写入失败
 * 也不要打断主链路 — grade 是次要属性, 列表显示可以稍后再补.
 */
export async function safeRecomputeCustomerGrade(
  tx: CustomerGradeTx,
  customerId: string,
  options: RecomputeCustomerGradeOptions = {},
): Promise<void> {
  try {
    await recomputeCustomerGrade(tx, customerId, options);
  } catch {
    // grade 写入失败不破坏主 mutation. 列表显示会维持上一次值 / null.
  }
}

/**
 * 单元测试 / 类型外露: 让上游 select 拼出 grade 时不需要重复硬编码.
 */
export const customerGradeSelect = {
  grade: true,
} satisfies Prisma.CustomerSelect;
