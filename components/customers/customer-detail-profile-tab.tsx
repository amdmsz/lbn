import type { ReactNode } from "react";
import Link from "next/link";
import {
  PortraitSignalRail,
  QuietSectionMeta,
  type PortraitSignal,
} from "@/components/customers/customer-dossier-primitives";
import { ImportedCustomerDeletionPanel } from "@/components/customers/imported-customer-deletion-panel";
import { CustomerProfileEditForm } from "@/components/customers/customer-profile-edit-form";
import {
  CustomerEmptyState,
  CustomerTabSection,
  formatOwnerLabel,
} from "@/components/customers/customer-record-list";
import { CustomerTagsPanel } from "@/components/customers/customer-tags-panel";
import CollapsibleSection from "@/components/shared/collapsible-section";
import EntityTimeline, {
  type EntityTimelineEvent,
} from "@/components/shared/entity-timeline";
import type { StatusBadgeVariant } from "@/components/shared/status-badge";
import {
  formatDateTime,
  formatRegion,
  getCustomerExecutionDisplayDescription,
  getCustomerExecutionDisplayLongLabel,
  getCustomerExecutionDisplayVariant,
} from "@/lib/customers/metadata";
import type {
  getCustomerDetailProfileData,
  getCustomerDetailShell,
} from "@/lib/customers/queries";
import {
  appendCustomerDetailNavigationContext,
  type CustomerDetailNavigationContext,
} from "@/lib/customers/public-pool-filter-url";
import { getLeadSourceLabel, getLeadStatusLabel } from "@/lib/leads/metadata";
import { cn } from "@/lib/utils";

type CustomerProfileData = NonNullable<
  Awaited<ReturnType<typeof getCustomerDetailProfileData>>
>;
type CustomerDetailShellData = NonNullable<
  Awaited<ReturnType<typeof getCustomerDetailShell>>
>;

type ImportedCustomerDeletionAction = (input: {
  customerId: string;
  reason: string;
}) => Promise<{
  status: "success" | "error";
  message: string;
  redirectTo: string | null;
}>;

type ImportedCustomerDeletionReviewAction = (input: {
  requestId: string;
  decision: "approve" | "reject";
  reason?: string;
}) => Promise<{
  status: "success" | "error";
  message: string;
  redirectTo: string | null;
}>;

type UpdateCustomerProfileAction = (formData: FormData) => Promise<void>;

function appendHrefSearchParam(href: string, key: string, value: string) {
  const url = new URL(href, "https://crm.local");
  url.searchParams.set(key, value);
  return `${url.pathname}${url.search}${url.hash}`;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function getNumberField(value: unknown, key: string) {
  return isPlainRecord(value) && typeof value[key] === "number" ? value[key] : 0;
}

function getHistoryArchiveCounts(snapshot: unknown) {
  const counts = isPlainRecord(snapshot) ? snapshot.counts : null;
  return {
    leads: getNumberField(counts, "leads"),
    callRecords: getNumberField(counts, "callRecords"),
    wechatRecords: getNumberField(counts, "wechatRecords"),
    followUpTasks: getNumberField(counts, "followUpTasks"),
    customerTags: getNumberField(counts, "customerTags"),
    ownershipEvents: getNumberField(counts, "ownershipEvents"),
  };
}

function formatDateTimeSummary(value: Date | null | undefined, emptyLabel = "暂无") {
  return value ? formatDateTime(value) : emptyLabel;
}

function formatLeadSourceSummary(
  source: CustomerDetailShellData["importSummary"]["firstSource"],
) {
  return source ? getLeadSourceLabel(source) : "暂无";
}

function ProfileFieldList({
  items,
}: Readonly<{
  items: ReadonlyArray<{ label: string; value: ReactNode; full?: boolean }>;
}>) {
  return (
    <div className="grid gap-x-6 gap-y-3 md:grid-cols-2">
      {items.map((item) => (
        <div
          key={item.label}
          className={cn(
            "flex flex-col gap-0.5 border-b border-border/40 pb-2",
            item.full && "md:col-span-2",
          )}
        >
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            {item.label}
          </p>
          <div className="text-sm leading-5 text-foreground">{item.value}</div>
        </div>
      ))}
    </div>
  );
}

function HistoryArchiveCard({
  archive,
}: Readonly<{
  archive: CustomerProfileData["historyArchives"][number];
}>) {
  const counts = getHistoryArchiveCounts(archive.snapshot);
  const title = `${archive.sourceCustomerName} / ${archive.sourceCustomerPhone}`;
  const visibilityLabel =
    archive.visibility === "ALL_ROLES" ? "新负责人可见" : "仅主管以上可见";
  const ownerLabel = archive.sourceOwnerLabel ?? "暂无";
  const batchLabel = archive.sourceBatch ? archive.sourceBatch.fileName : null;
  const actorLabel = archive.createdBy
    ? `${archive.createdBy.name} (@${archive.createdBy.username})`
    : null;
  const snapshotLine = `线索 ${counts.leads} · 通话 ${counts.callRecords} · 微信 ${counts.wechatRecords} · 跟进 ${counts.followUpTasks} · 标签 ${counts.customerTags} · 归属 ${counts.ownershipEvents}`;

  return (
    <CollapsibleSection
      title={title}
      description={`处理于 ${formatDateTime(archive.createdAt)} · ${visibilityLabel}`}
      badge={<QuietSectionMeta>{`原负责人 ${ownerLabel}`}</QuietSectionMeta>}
    >
      <div className="space-y-2 text-[12px] leading-5 text-muted-foreground">
        <p>处理原因：{archive.reason}</p>
        <p>{snapshotLine}</p>
        {batchLabel ? <p>来源批次：{batchLabel}</p> : null}
        {actorLabel ? <p>操作人：{actorLabel}</p> : null}
        {archive.sourceBatch ? (
          <Link
            href={`/lead-imports/${archive.sourceBatch.id}`}
            className="crm-text-link inline-flex items-center"
          >
            查看导入批次
          </Link>
        ) : null}
      </div>
    </CollapsibleSection>
  );
}

function CustomerOriginTimeline({
  leads,
  mergeLogs,
}: Readonly<{
  leads: CustomerProfileData["leads"];
  mergeLogs: CustomerProfileData["mergeLogs"];
}>) {
  const events: EntityTimelineEvent[] = [];

  for (const lead of leads) {
    events.push({
      id: `lead-${lead.id}`,
      kind: "report",
      occurredAt: lead.createdAt,
      title: lead.name?.trim() || lead.phone,
      detail: `来源 ${getLeadSourceLabel(lead.source)} · 状态 ${getLeadStatusLabel(lead.status)} · 手机号 ${lead.phone}`,
      href: `/leads/${lead.id}`,
    });
  }

  for (const record of mergeLogs) {
    const liveLead = record.lead && !record.lead.rolledBackAt ? record.lead : null;
    const leadName =
      liveLead?.name?.trim() ||
      record.leadNameSnapshot?.trim() ||
      liveLead?.phone ||
      record.leadPhoneSnapshot ||
      record.leadIdSnapshot ||
      "未识别线索";
    const leadPhone =
      liveLead?.phone ||
      record.leadPhoneSnapshot ||
      record.leadIdSnapshot ||
      "-";
    const tagLabel = record.tagSynced ? "标签已同步" : "标签未同步";
    const snapshotHint = liveLead ? "" : "（历史快照）";

    events.push({
      id: `merge-${record.id}`,
      kind: "review",
      occurredAt: record.createdAt,
      title: `${leadName} · ${record.batch.fileName}`,
      detail: `${record.action} · 来源 ${getLeadSourceLabel(record.source)} · ${tagLabel} · 线索 ${leadPhone}${snapshotHint}`,
      href: liveLead ? `/leads/${liveLead.id}` : undefined,
    });
  }

  if (events.length === 0) {
    return (
      <CustomerEmptyState
        title="暂无来源 / 归并记录"
        description="尚未形成线索回流或导入归并的事件流。"
      />
    );
  }

  return <EntityTimeline events={events} maxVisible={6} />;
}

export function CustomerDetailProfileTab({
  shell,
  data,
  canManageTags,
  canEditProfile,
  isEditingProfile,
  updateCustomerProfileAction,
  navigationContext,
  requestImportedCustomerDeletionAction,
  reviewImportedCustomerDeletionAction,
  deleteImportedCustomerDirectAction,
}: Readonly<{
  shell: CustomerDetailShellData;
  data: CustomerProfileData;
  canManageTags: boolean;
  canEditProfile: boolean;
  isEditingProfile: boolean;
  updateCustomerProfileAction?: UpdateCustomerProfileAction;
  navigationContext?: CustomerDetailNavigationContext;
  requestImportedCustomerDeletionAction: ImportedCustomerDeletionAction;
  reviewImportedCustomerDeletionAction: ImportedCustomerDeletionReviewAction;
  deleteImportedCustomerDirectAction: ImportedCustomerDeletionAction;
}>) {
  const archiveHref = appendCustomerDetailNavigationContext(
    `/customers/${shell.id}`,
    navigationContext,
  );
  const editProfileHref = appendHrefSearchParam(archiveHref, "editProfile", "1");
  const executionDisplayInput = {
    executionClass: shell.executionClass,
    newImported: shell.newImported,
    pendingFirstCall: shell.pendingFirstCall,
  };
  const executionClassLabel: string = getCustomerExecutionDisplayLongLabel(executionDisplayInput);
  const executionClassDescription: string = getCustomerExecutionDisplayDescription(executionDisplayInput);
  const executionClassVariant: StatusBadgeVariant = getCustomerExecutionDisplayVariant(executionDisplayInput);
  const profileSectionActions = canEditProfile ? (
    isEditingProfile ? (
      <Link href={archiveHref} scroll={false} className="crm-text-link">
        取消编辑
      </Link>
    ) : (
      <Link href={editProfileHref} scroll={false} className="crm-text-link">
        编辑资料
      </Link>
    )
  ) : null;
  const regionSummary = formatRegion(shell.province, shell.city, shell.district);
  const teamLabel = shell.publicPoolTeam?.name ?? shell.owner?.team?.name ?? "暂无团队";
  const profileSignals: PortraitSignal[] = [
    {
      label: "正式分类",
      value: executionClassLabel,
      description: executionClassDescription,
    },
    {
      label: "地区",
      value: regionSummary,
      description: `归属团队 ${teamLabel}`,
    },
    {
      label: "接入时间",
      value: formatDateTimeSummary(shell.createdAt),
      description: `最近更新 ${formatDateTime(shell.updatedAt)}`,
    },
    {
      label: "经营归属",
      value: formatOwnerLabel(shell.owner),
      description: `保护期 ${formatDateTimeSummary(shell.claimLockedUntil, "未锁定")}`,
    },
  ];

  const continuationData = data.customerImportSummary?.data ?? null;
  const continuationCreatedAt = data.customerImportSummary?.createdAt ?? null;
  const continuationOwnerOutcomeLabel = continuationData
    ? continuationData.ownerOutcome === "ASSIGNED"
      ? "已匹配负责人"
      : continuationData.ownerOutcome === "KEPT_EXISTING"
        ? "保留原负责人"
        : continuationData.ownerOutcome === "PUBLIC_POOL"
          ? "进入公海"
          : "负责人未识别"
    : null;
  const continuationActionLabel = continuationData
    ? continuationData.action === "CREATED_CUSTOMER"
      ? "新建客户"
      : "命中已有客户"
    : null;
  const continuationSignals: PortraitSignal[] = continuationData
    ? [
        {
          label: "导入批次",
          value: continuationData.batchFileName,
          description: `导入时间 ${formatDateTimeSummary(continuationCreatedAt)}`,
        },
        {
          label: "本次结果",
          value: continuationActionLabel ?? "暂无",
          description: continuationOwnerOutcomeLabel ?? "暂无负责人结果",
        },
        {
          label: "迁移前累计消费",
          value: continuationData.summary.historicalTotalSpent || "暂无",
          description:
            continuationData.summary.purchaseCount !== null
              ? `${continuationData.summary.purchaseCount} 次购买`
              : "暂无购买次数",
        },
        {
          label: "最近购买 / 意向",
          value: continuationData.summary.latestPurchasedProduct || "暂无",
          description: `最近意向 ${continuationData.summary.latestIntent || "暂无"}`,
        },
      ]
    : [];

  const sourceSignals: PortraitSignal[] = [
    {
      label: "首个来源",
      value: formatLeadSourceSummary(shell.importSummary.firstSource),
      description: `最近来源 ${formatLeadSourceSummary(shell.importSummary.latestSource)}`,
    },
    {
      label: "最近接入",
      value: shell.importSummary.latestImportAt
        ? formatDateTime(shell.importSummary.latestImportAt)
        : "暂无接入记录",
      description: `负责人 ${formatOwnerLabel(shell.owner)}`,
    },
    {
      label: "关联线索",
      value: String(shell.importSummary.linkedLeadCount),
      description: `导入 / 归并事件 ${shell.importSummary.importEventCount} 条`,
    },
    {
      label: "当前经营状态",
      value: executionClassLabel,
      description: executionClassDescription,
    },
  ];

  return (
    <div className="space-y-4">
      <CustomerTabSection
        eyebrow="客户档案"
        title="身份档案"
        description="静态资料、标签与当前经营分类集中保留在这里。"
        actions={profileSectionActions}
      >
        <CustomerTagsPanel
          customerId={shell.id}
          redirectTo={archiveHref}
          tags={data.customerTags}
          availableTags={data.availableTags}
          canManage={canManageTags}
          variant="compact"
          className="border-none bg-transparent px-0 py-0"
        />

        <div className="mt-4">
          {isEditingProfile && updateCustomerProfileAction ? (
            <CustomerProfileEditForm
              shell={shell}
              archiveHref={archiveHref}
              executionClassLabel={executionClassLabel}
              executionClassDescription={executionClassDescription}
              executionClassVariant={executionClassVariant}
              action={updateCustomerProfileAction}
            />
          ) : (
            <div className="space-y-4">
              <PortraitSignalRail items={profileSignals} />
              <ProfileFieldList
                items={[
                  { label: "手机号", value: shell.phone },
                  { label: "微信号", value: shell.wechatId?.trim() || "未填写" },
                  { label: "地址", value: shell.address?.trim() || "未填写", full: true },
                  { label: "备注", value: shell.remark?.trim() || "暂无备注", full: true },
                ]}
              />
            </div>
          )}
        </div>
      </CustomerTabSection>

      <CustomerTabSection
        eyebrow="经营脉络"
        title="来源 / 归并时间线"
        description="按时间整合最初接入的线索回流与后续导入归并动作。"
        actions={
          <QuietSectionMeta>
            {`${data.leads.length} 条线索 · ${data.mergeLogs.length} 条归并`}
          </QuietSectionMeta>
        }
      >
        <CustomerOriginTimeline leads={data.leads} mergeLogs={data.mergeLogs} />
      </CustomerTabSection>

      {continuationData ? (
        <CollapsibleSection
          title="续接参考摘要"
          description={`迁移承接画像，不并入新系统真实成交 · 批次 ${continuationData.batchFileName}`}
        >
          <div className="space-y-3">
            <PortraitSignalRail items={continuationSignals} />
            <ProfileFieldList
              items={[
                {
                  label: "最近跟进时间",
                  value: continuationData.summary.latestFollowUpAt || "暂无",
                },
                {
                  label: "最近跟进结果",
                  value: continuationData.summary.latestFollowUpResult || "暂无",
                },
                {
                  label: "已挂接标签",
                  value: continuationData.tags.assigned.join(" / ") || "暂无",
                  full: true,
                },
                {
                  label: "未识别标签",
                  value: continuationData.tags.unresolved.join(" / ") || "无",
                },
                {
                  label: "迁移备注摘要",
                  value: continuationData.summary.note || "暂无",
                  full: true,
                },
              ]}
            />
            <Link
              href={`/lead-imports/${continuationData.batchId}?mode=customer_continuation`}
              className="crm-text-link inline-flex"
            >
              查看导入批次
            </Link>
          </div>
        </CollapsibleSection>
      ) : null}

      <CollapsibleSection
        title="来源画像信号"
        description="首个 / 最近来源、关联线索与当前经营状态。"
      >
        <PortraitSignalRail items={sourceSignals} />
      </CollapsibleSection>

      {data.historyArchives.length > 0 ? (
        <CustomerTabSection
          eyebrow="历史资源归档"
          title="旧资源处理记录"
          description="主管把重复命中的老客户转为新线索时，按处理策略保留的旧跟进快照。"
        >
          <div className="space-y-2">
            {data.historyArchives.map((archive) => (
              <HistoryArchiveCard key={archive.id} archive={archive} />
            ))}
          </div>
        </CustomerTabSection>
      ) : null}

      <CustomerTabSection
        eyebrow="删除审批"
        title="导入客户删除"
        description="保留删除申请、审批与直接删除的审计链。"
      >
        <ImportedCustomerDeletionPanel
          guard={data.importedCustomerDeletion}
          requestAction={requestImportedCustomerDeletionAction}
          reviewAction={reviewImportedCustomerDeletionAction}
          directDeleteAction={deleteImportedCustomerDirectAction}
        />
      </CustomerTabSection>
    </div>
  );
}
