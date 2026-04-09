import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { LeadTagsPanel } from "@/components/leads/lead-tags-panel";
import { LeadStatusBadge } from "@/components/leads/lead-status-badge";
import { ActionBanner } from "@/components/shared/action-banner";
import { DetailItem } from "@/components/shared/detail-item";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
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
  getLeadSourceLabel,
  getLeadStatusLabel,
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

  const region = [lead.province, lead.city, lead.district].filter(Boolean).join(" / ");
  const isSalesReferenceView = false;
  const canManageTags = canUseLeadTags(session.user.role);

  return (
    <div className="crm-page">
      <PageHeader
        title={lead.name?.trim() || lead.phone}
        description={
          isSalesReferenceView
            ? "线索详情页仅保留追溯、归并结果和分配历史的参考用途。实际承接与后续动作请转到客户中心。"
            : "线索详情页展示基础资料、归并结果、负责人、状态、分配记录与操作日志。"
        }
        actions={
          <>
            <LeadStatusBadge status={lead.status} />
            <StatusBadge
              label={lead.owner ? `负责人：${lead.owner.name}` : "未分配"}
              variant={lead.owner ? "info" : "neutral"}
            />
          </>
        }
      />

      {notice ? (
        <ActionBanner tone={notice.tone} className="mt-6">
          {notice.message}
        </ActionBanner>
      ) : null}

      {isSalesReferenceView ? (
        <ActionBanner tone="danger" className="mt-6">
          销售的主业务入口已切换为客户中心。当前线索页仅作导入来源、归并结果和分配历史的只读参考。
        </ActionBanner>
      ) : null}

      <div className="crm-page-meta">
        <div className="flex flex-wrap items-center gap-4">
          <Link href="/leads" className="crm-text-link">
            返回线索列表
          </Link>
          {lead.customer ? (
            <Link href={`/customers/${lead.customer.id}`} className="crm-text-link">
              查看客户详情
            </Link>
          ) : null}
        </div>
        <p className="text-sm text-black/55">
          创建于 {formatDateTime(lead.createdAt)}，最近更新于 {formatDateTime(lead.updatedAt)}
        </p>
      </div>

      <section className="crm-card p-6">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <DetailItem label="手机号" value={lead.phone} />
          <DetailItem label="导入来源" value={getLeadSourceLabel(lead.source)} />
          <DetailItem
            label="已购产品"
            value={lead.interestedProduct?.trim() || "未填写"}
          />
          <DetailItem label="当前状态" value={getLeadStatusLabel(lead.status)} />
          <DetailItem
            label="当前负责人"
            value={lead.owner ? `${lead.owner.name} (@${lead.owner.username})` : "未分配"}
          />
          <DetailItem
            label="关联客户"
            value={
              lead.customer
                ? `${lead.customer.name} (${lead.customer.phone})`
                : "未关联客户"
            }
          />
          <DetailItem label="来源详情" value={lead.sourceDetail?.trim() || "未填写"} />
          <DetailItem label="物流单号" value={lead.campaignName?.trim() || "未填写"} />
          <DetailItem label="区域" value={region || "未填写"} />
          <DetailItem label="详细地址" value={lead.address?.trim() || "未填写"} />
          <DetailItem
            label="最近跟进时间"
            value={lead.lastFollowUpAt ? formatDateTime(lead.lastFollowUpAt) : "暂无"}
          />
          <DetailItem
            label="下次跟进时间"
            value={lead.nextFollowUpAt ? formatDateTime(lead.nextFollowUpAt) : "暂无"}
          />
          <DetailItem label="分配记录数" value={String(lead._count.assignments)} />
        </div>

        <div className="crm-subtle-panel mt-4">
          <p className="crm-detail-label">备注</p>
          <p className="mt-2 text-sm leading-7 text-black/70">
            {lead.remark?.trim() || "暂无备注"}
          </p>
        </div>
      </section>

      <section className="crm-card p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-black/85">归并结果</h2>
          <StatusBadge label={`${lead.mergeLogs.length} 条`} variant="info" />
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
                <p className="mt-3 text-sm font-medium text-black/80">
                  客户：{record.customer.name} ({record.customer.phone})
                </p>
                <p className="mt-1 text-sm text-black/60">
                  导入批次：{record.batch.fileName}
                </p>
                <p className="mt-1 text-sm text-black/60">
                  来源标签同步：{record.tagSynced ? "已同步" : "未同步"}
                </p>
                <p className="mt-1 text-sm text-black/60">
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

      <LeadTagsPanel
        leadId={lead.id}
        redirectTo={`/leads/${lead.id}`}
        tags={lead.leadTags}
        availableTags={lead.availableTags}
        canManage={canManageTags}
      />

      <section className="grid gap-6 xl:grid-cols-2">
        <div className="crm-card p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-black/85">最近分配记录</h2>
            <StatusBadge label={`${lead.assignments.length} 条`} variant="neutral" />
          </div>

          {lead.assignments.length > 0 ? (
            <div className="mt-4 space-y-3">
              {lead.assignments.map((assignment) => (
                <div key={assignment.id} className="crm-subtle-panel">
                  <p className="text-sm font-medium text-black/80">
                    {assignment.fromUser
                      ? `${assignment.fromUser.name} -> ${assignment.toUser.name}`
                      : `首次分配 -> ${assignment.toUser.name}`}
                  </p>
                  <p className="mt-2 text-sm text-black/60">
                    执行人：{assignment.assignedBy.name} (@{assignment.assignedBy.username})
                  </p>
                  <p className="mt-1 text-sm text-black/60">
                    时间：{formatDateTime(assignment.createdAt)}
                  </p>
                  <p className="mt-1 text-sm text-black/60">
                    类型：{assignment.assignmentType}
                  </p>
                  <p className="mt-1 text-sm text-black/60">
                    备注：{assignment.note?.trim() || "无"}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-4">
              <EmptyState title="暂无分配记录" description="这条线索还没有分配记录。" />
            </div>
          )}
        </div>

        <div className="crm-card p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-black/85">最近操作日志</h2>
            <StatusBadge label={`${lead.operationLogs.length} 条`} variant="neutral" />
          </div>

          {lead.operationLogs.length > 0 ? (
            <div className="mt-4 space-y-3">
              {lead.operationLogs.map((log) => (
                <div key={log.id} className="crm-subtle-panel">
                  <p className="text-sm font-medium text-black/80">{log.action}</p>
                  <p className="mt-2 text-sm text-black/60">
                    操作人：{log.actor?.name ?? "系统"}
                    {log.actor ? ` (@${log.actor.username})` : ""}
                  </p>
                  <p className="mt-1 text-sm text-black/60">
                    时间：{formatDateTime(log.createdAt)}
                  </p>
                  <p className="mt-1 text-sm leading-7 text-black/60">
                    {log.description?.trim() || "无描述"}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-4">
              <EmptyState title="暂无操作日志" description="这条线索还没有操作日志。" />
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
