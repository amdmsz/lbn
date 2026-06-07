/**
 * 主管 (SUPERVISOR) 跨团队写操作守卫.
 *
 * 背景:
 *   多团队部署下, 不同团队的主管不能互相批/改对方团队成员负责的对象 (例如撤单、移交).
 *   ADMIN 兜底不限制; SALES 已经走 `ownerId === actor.id` 自查;
 *   SUPERVISOR 才是这条 helper 的目标人群.
 *
 * 行为:
 *   - 仅在 actor.role === "SUPERVISOR" 时调用 (调用方先 gate 一次), 否则直接放行;
 *   - 若 ownerUserId 为 null/undefined (目标对象暂无负责人), 视为 SUPERVISOR 可继续 — 跟
 *     revisions.ts 阶段 A 的语义对齐 (公海或未指派的对象不卡跨团队);
 *   - 拿 actor / owner 的 teamId 双比对, 任一为空 (single-team 部署 / 用户已被解绑团队)
 *     默认放行, 跟历史 R06 行为一致;
 *   - 命中跨团队抛 Error, 文案统一.
 *
 * 不在此处校验角色和权限 — 调用方必须先调 canXxx() 之类的角色 gate, 这里只补 team scope.
 */

import type { RoleCode } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";

export type SupervisorTeamScopeActor = {
  id: string;
  role: RoleCode;
};

/**
 * 在 SUPERVISOR 执行高敏感 mutation 时, 确认目标对象的负责人和 SUPERVISOR 同一团队.
 *
 * @param actor 当前操作人 (必须已经过 role gate)
 * @param ownerUserId 目标对象当前负责人的 userId; null 表示无负责人, 直接放行
 * @throws Error 如果两者 teamId 都存在且不同
 */
export async function assertSupervisorTeamScope(
  actor: SupervisorTeamScopeActor,
  ownerUserId: string | null | undefined,
): Promise<void> {
  if (actor.role !== "SUPERVISOR") {
    return;
  }
  if (!ownerUserId) {
    return;
  }

  const [actorRow, ownerRow] = await Promise.all([
    prisma.user.findUnique({
      where: { id: actor.id },
      select: { teamId: true },
    }),
    prisma.user.findUnique({
      where: { id: ownerUserId },
      select: { teamId: true },
    }),
  ]);

  const actorTeamId = actorRow?.teamId ?? null;
  const ownerTeamId = ownerRow?.teamId ?? null;

  // single-team 部署所有 owner 同 team (或 owner/actor teamId 缺失), 此 check 无操作
  if (!actorTeamId || !ownerTeamId) {
    return;
  }

  if (actorTeamId !== ownerTeamId) {
    throw new Error(
      "您只能对本团队成员负责的对象执行此操作, 跨团队请联系对方主管或 ADMIN",
    );
  }
}
