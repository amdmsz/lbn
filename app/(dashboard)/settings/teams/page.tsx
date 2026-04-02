import { redirect } from "next/navigation";
import { SettingsWorkspaceNav } from "@/components/settings/settings-workspace-nav";
import { ActionBanner } from "@/components/shared/action-banner";
import { DataTableWrapper } from "@/components/shared/data-table-wrapper";
import { EmptyState } from "@/components/shared/empty-state";
import { StatusBadge } from "@/components/shared/status-badge";
import { SummaryHeader } from "@/components/shared/summary-header";
import {
  formatDateTimeLabel,
  getRoleBadgeVariant,
  getUserStatusLabel,
  getUserStatusVariant,
} from "@/lib/account-management/metadata";
import { getTeamsPageData } from "@/lib/account-management/queries";
import { upsertTeamAction } from "@/lib/account-management/actions";
import {
  canAccessTeamsSetting,
  getDefaultRouteForRole,
  roleLabels,
} from "@/lib/auth/access";
import { auth } from "@/lib/auth/session";

const redirectTo = "/settings/teams";

export default async function SettingsTeamsPage({
  searchParams,
}: Readonly<{
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}>) {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  if (!canAccessTeamsSetting(session.user.role)) {
    redirect(getDefaultRouteForRole(session.user.role));
  }

  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const data = await getTeamsPageData(
    {
      id: session.user.id,
      role: session.user.role,
    },
    resolvedSearchParams,
  );

  return (
    <div className="crm-page">
      <SummaryHeader
        eyebrow="组织结构"
        title="团队管理"
        description="团队页用于维护团队基础信息和团队主管。第一版只有管理员可新增 / 编辑团队，主管在这里仅查看自己的团队结构。"
        badges={
          <>
            <StatusBadge
              label={data.canManageTeams ? "管理员可维护团队" : "主管只读查看"}
              variant={data.canManageTeams ? "info" : "warning"}
            />
            <StatusBadge label={`共 ${data.teams.length} 个可见团队`} variant="success" />
          </>
        }
        metrics={[
          {
            label: "可见团队",
            value: String(data.teams.length),
            hint: data.canManageTeams ? "当前为全公司团队范围" : "当前仅展示你的团队",
          },
          {
            label: "已配置主管",
            value: String(data.teams.filter((item) => item.supervisorId).length),
            hint: "已明确团队主管的团队数量",
          },
          {
            label: "总成员数",
            value: String(data.teams.reduce((sum, item) => sum + item._count.users, 0)),
            hint: "当前可见团队下的成员数量汇总",
          },
        ]}
      />

      {data.notice ? (
        <ActionBanner tone={data.notice.tone}>{data.notice.message}</ActionBanner>
      ) : null}

      {!data.canManageTeams ? (
        <ActionBanner tone="danger">
          团队的新建、编辑和指定团队主管目前仅开放给管理员。主管可在本页查看自己团队的结构和成员归属。
        </ActionBanner>
      ) : null}

      <div className="crm-subtle-panel">
        <SettingsWorkspaceNav activeValue="teams" />
      </div>

      {data.canManageTeams ? (
        <DataTableWrapper
          title="新增团队"
          description="先创建团队，再去账号管理页把主管账号归属到该团队，最后回到这里指定团队主管。"
        >
          <form action={upsertTeamAction} className="grid gap-3.5 xl:grid-cols-[1fr_1fr]">
            <input type="hidden" name="redirectTo" value={redirectTo} />

            <label className="space-y-1.5">
              <span className="crm-label">团队名称</span>
              <input name="name" className="crm-input" placeholder="例如：华东销售一组" required />
            </label>

            <label className="space-y-1.5">
              <span className="crm-label">团队编码</span>
              <input name="code" className="crm-input" placeholder="例如：EAST_SALES" required />
            </label>

            <label className="space-y-1.5 xl:col-span-2">
              <span className="crm-label">团队说明</span>
              <textarea
                name="description"
                rows={3}
                maxLength={1000}
                className="crm-textarea"
                placeholder="补充团队职责、适用范围和管理说明"
              />
            </label>

            <div className="flex justify-end xl:col-span-2">
              <button type="submit" className="crm-button crm-button-primary">
                创建团队
              </button>
            </div>
          </form>
        </DataTableWrapper>
      ) : null}

      <DataTableWrapper
        className="mt-5"
        title="团队列表"
        description="团队主管需要先在账号页归属到对应团队，再回到这里完成指定。"
      >
        {data.teams.length > 0 ? (
          <div className="grid gap-4">
            {data.teams.map((team) => (
              <div key={team.id} className="crm-card-muted p-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-lg font-semibold text-black/82">{team.name}</h3>
                      <StatusBadge label={team.code} variant="neutral" />
                      <StatusBadge label={`${team._count.users} 位成员`} variant="info" />
                    </div>
                    <p className="mt-2 text-sm leading-6 text-black/58">
                      {team.description?.trim() || "暂无团队说明。"}
                    </p>
                    <p className="mt-2 text-sm text-black/55">
                      团队主管：
                      {team.supervisor
                        ? ` ${team.supervisor.name} (@${team.supervisor.username})`
                        : " 未指定"}
                    </p>
                  </div>
                  <div className="text-sm text-black/50">
                    更新于 {formatDateTimeLabel(team.updatedAt)}
                  </div>
                </div>

                {data.canManageTeams ? (
                  <form action={upsertTeamAction} className="mt-4 space-y-3.5">
                    <input type="hidden" name="id" value={team.id} />
                    <input type="hidden" name="redirectTo" value={redirectTo} />

                    <div className="grid gap-3.5 xl:grid-cols-[1fr_1fr]">
                      <label className="space-y-1.5">
                        <span className="crm-label">团队名称</span>
                        <input name="name" defaultValue={team.name} className="crm-input" required />
                      </label>

                      <label className="space-y-1.5">
                        <span className="crm-label">团队编码</span>
                        <input name="code" defaultValue={team.code} className="crm-input" required />
                      </label>

                      <label className="space-y-1.5 xl:col-span-2">
                        <span className="crm-label">团队说明</span>
                        <textarea
                          name="description"
                          rows={3}
                          maxLength={1000}
                          defaultValue={team.description ?? ""}
                          className="crm-textarea"
                        />
                      </label>

                      <label className="space-y-1.5 xl:col-span-2">
                        <span className="crm-label">团队主管</span>
                        <select
                          name="supervisorId"
                          defaultValue={team.supervisorId ?? ""}
                          className="crm-select"
                        >
                          <option value="">暂不指定团队主管</option>
                          {data.supervisorOptions
                            .filter(
                              (item) =>
                                item.teamId === team.id || item.id === team.supervisorId,
                            )
                            .map((item) => (
                            <option key={item.id} value={item.id}>
                              {item.name} (@{item.username})
                              {item.supervisedTeam && item.supervisedTeam.id !== team.id
                                ? ` · 当前负责 ${item.supervisedTeam.name}`
                                : ""}
                            </option>
                            ))}
                        </select>
                      </label>
                    </div>

                    <div className="flex justify-end">
                      <button type="submit" className="crm-button crm-button-primary">
                        保存团队信息
                      </button>
                    </div>
                  </form>
                ) : null}

                <div className="mt-4 border-t border-black/8 pt-4">
                  {team.users.length > 0 ? (
                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                      {team.users.map((member) => (
                        <div key={member.id} className="rounded-2xl border border-black/8 bg-white/65 p-3">
                          <div className="flex flex-wrap gap-1.5">
                            <StatusBadge
                              label={roleLabels[member.role.code]}
                              variant={getRoleBadgeVariant(member.role.code)}
                            />
                            <StatusBadge
                              label={getUserStatusLabel(member.userStatus)}
                              variant={getUserStatusVariant(member.userStatus)}
                            />
                          </div>
                          <p className="mt-3 text-sm font-medium text-black/82">{member.name}</p>
                          <p className="mt-1 text-xs text-black/48">@{member.username}</p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <EmptyState
                      title="团队下暂无成员"
                      description="可以先去账号管理页创建或调整成员账号，再回到这里查看团队结构。"
                    />
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            title="暂无团队"
            description="当前还没有团队记录，请先创建一个团队并在账号页补齐成员归属。"
          />
        )}
      </DataTableWrapper>
    </div>
  );
}
