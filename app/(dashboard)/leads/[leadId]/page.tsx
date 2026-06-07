import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { UserRound } from "lucide-react";
import { LeadTagsPanel } from "@/components/leads/lead-tags-panel";
import { ActionBanner } from "@/components/shared/action-banner";
import { DetailItem } from "@/components/shared/detail-item";
import { EmptyState } from "@/components/shared/empty-state";
import EntityTimeline, {
  type EntityTimelineEvent,
} from "@/components/shared/entity-timeline";
import { PageHero } from "@/components/shared/page-hero";
import { StatusBadge } from "@/components/shared/status-badge";
import {
  canAccessLeadModule,
  canUseLeadTags,
  getDefaultRouteForRole,
} from "@/lib/auth/access";
import { auth } from "@/lib/auth/session";
import {
  getLeadCustomerMergeActionLabel,
  getLeadImportSourceLabel,
} from "@/lib/lead-imports/metadata";
import { getLeadDetail } from "@/lib/leads/queries";
import {
  formatDateTime,
  getLeadStatusLabel,
  getLeadStatusVariant,
} from "@/lib/leads/metadata";
import { parseMasterDataNotice } from "@/lib/master-data/metadata";

export default async function LeadDetailPage({
  params,
  searchParams,
}: Readonly<{
  params: Promise<{ leadId: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}>) {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  if (!canAccessLeadModule(session.user.role)) {
    redirect(getDefaultRouteForRole(session.user.role));
  }

  const { leadId } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const notice = parseMasterDataNotice(resolvedSearchParams);
  const lead = await getLeadDetail(
    {
      id: session.user.id,
      role: session.user.role,
    },
    leadId,
  );

  if (!lead) {
    notFound();
  }

  const canManageTags = canUseLeadTags(session.user.role);
  const region = [lead.province, lead.city, lead.district].filter(Boolean).join(" / ");
  const addressValue =
    lead.address?.trim() || region || "未填写";

  const timelineEvents: EntityTimelineEvent[] = [
    ...lead.assignments.map((assignment) => {
      const title = assignment.fromUser
        ? `${assignment.fromUser.name} -> ${assignment.toUser.name}`
        : `首次分配 -> ${assignment.toUser.name}`;
      const detailParts = [`类型：${assignment.assignmentType}`];
      const note = assignment.note?.trim();
      if (note) {
        detailParts.push(`备注：${note}`);
      }
      return {
        id: `assignment-${assignment.id}`,
        kind: "review" as const,
        occurredAt: assignment.createdAt,
        title,
        detail: detailParts.join(" · "),
        actor: assignment.assignedBy.name,
      };
    }),
    ...lead.operationLogs.map((log) => ({
      id: `log-${log.id}`,
      kind: "revision" as const,
      occurredAt: log.createdAt,
      title: log.action,
      detail: log.description?.trim() || undefined,
      actor: log.actor?.name,
    })),
  ];

  return (
    <div className="crm-page">
      <PageHero
        icon={{ kind: "node", node: <UserRound className="h-5 w-5" /> }}
        title={lead.name?.trim() || lead.phone}
        subtitle={
          <>
            <span>{lead.phone}</span>
            <span aria-hidden>·</span>
            <span>创建于 {formatDateTime(lead.createdAt)}</span>
            <span aria-hidden>·</span>
            <span>更新于 {formatDateTime(lead.updatedAt)}</span>
          </>
        }
        primaryBadge={{
          label: lead.owner ? `负责人：${lead.owner.name}` : "未分配",
          variant: lead.owner ? "info" : "neutral",
        }}
        actions={
          <>
            <Link href="/leads" className="crm-text-link">
              返回线索列表
            </Link>
            {lead.customer ? (
              <Link
                href={`/customers/${lead.customer.id}`}
                className="crm-text-link"
              >
                查看客户详情
              </Link>
            ) : null}
          </>
        }
      />

      {notice ? (
        <ActionBanner tone={notice.tone} className="mt-6">
          {notice.message}
        </ActionBanner>
      ) : null}

      <section className="crm-card p-6">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <DetailItem label="手机号" value={lead.phone} />
          <DetailItem
            label="意向产品"
            value={lead.interestedProduct?.trim() || "未填写"}
          />
          <DetailItem
            label="当前状态"
            value={
              <StatusBadge
                label={getLeadStatusLabel(lead.status)}
                variant={getLeadStatusVariant(lead.status)}
              />
            }
          />
          <DetailItem
            label="关联客户"
            value={
              lead.customer
                ? `${lead.customer.name} (${lead.customer.phone})`
                : "未关联客户"
            }
          />
          <DetailItem label="地址" value={addressValue} />
          <DetailItem
            label="备注"
            value={lead.remark?.trim() || "暂无备注"}
          />
        </div>
      </section>

      <LeadTagsPanel
        leadId={lead.id}
        redirectTo={`/leads/${lead.id}`}
        tags={lead.leadTags}
        availableTags={lead.availableTags}
        canManage={canManageTags}
      />

      <section className="crm-card p-6">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-foreground">归并结果</h2>
          <StatusBadge
            label={`${lead.mergeLogs.length} 条`}
            variant="info"
          />
        </div>

        {lead.mergeLogs.length > 0 ? (
          <div className="mt-4 space-y-3">
            {lead.mergeLogs.map((mergeLog) => {
              const mergedCustomerName =
                mergeLog.customer?.name ?? mergeLog.note?.trim() ?? "已删除客户";
              const mergedCustomerPhone =
                mergeLog.customer?.phone ?? mergeLog.phone ?? "暂无手机号";
              const customerDeleted = !mergeLog.customer;
              const record = {
                ...mergeLog,
                customer: mergeLog.customer ?? {
                  id: null,
                  name: mergedCustomerName,
                  phone: mergedCustomerPhone,
                },
              };

              return (
                <div key={record.id} className="crm-subtle-panel">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge
                      label={getLeadCustomerMergeActionLabel(record.action)}
                      variant="info"
                    />
                    <StatusBadge
                      label={getLeadImportSourceLabel(record.source)}
                      variant="neutral"
                    />
                    {customerDeleted ? (
                      <StatusBadge label="客户已删除" variant="warning" />
                    ) : null}
                  </div>
                  <p className="mt-3 text-sm font-medium text-foreground">
                    客户：{record.customer.name} ({record.customer.phone})
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    导入批次：{record.batch.fileName}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    来源标签同步：{record.tagSynced ? "已同步" : "未同步"}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    时间：{formatDateTime(record.createdAt)}
                  </p>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="mt-4">
            <EmptyState
              title="暂无归并记录"
              description="这条线索还没有来自导入批次的 Lead-Customer 归并记录。"
            />
          </div>
        )}
      </section>

      <section className="crm-card p-6">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-foreground">活动时间线</h2>
          <StatusBadge
            label={`${timelineEvents.length} 条`}
            variant="neutral"
          />
        </div>

        <div className="mt-4">
          {timelineEvents.length > 0 ? (
            <EntityTimeline
              events={timelineEvents}
              maxVisible={3}
              emptyText="这条线索还没有分配记录或操作日志。"
            />
          ) : (
            <EmptyState
              title="暂无活动记录"
              description="这条线索还没有分配记录或操作日志。"
            />
          )}
        </div>
      </section>
    </div>
  );
}
