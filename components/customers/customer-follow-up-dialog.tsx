"use client";

import { useState } from "react";
import Link from "next/link";
import { createPortal } from "react-dom";
import { ChevronDown, ChevronRight, ChevronUp, PhoneOutgoing, X } from "lucide-react";
import { CustomerCallProgress } from "@/components/customers/customer-call-progress";
import { CustomerMobileDialButton } from "@/components/customers/mobile-call-followup-sheet";
import { CustomerOutboundCallButton } from "@/components/customers/customer-outbound-call-button";
import { StatusBadge } from "@/components/shared/status-badge";
import type { MobileCallTriggerSource } from "@/lib/calls/mobile-call-followup";
import {
  getCustomerExecutionDisplayLongLabel,
  getCustomerExecutionDisplayVariant,
  formatDateTime,
} from "@/lib/customers/metadata";
import type {
  CustomerCallRecordHistoryEntry,
  CustomerListItem,
} from "@/lib/customers/queries";
import { CustomerCallRecordForm } from "@/components/customers/customer-call-record-form";
import { loadCustomerCallRecordsAction } from "@/app/(dashboard)/customers/actions";
import type { CallResultOption } from "@/lib/calls/metadata";
import { cn } from "@/lib/utils";

const dialogSurfaceClassName = "rounded-md border border-border bg-card";

// 右上次要入口: 克制小胶囊, 不抢主操作 (打电话 + 点结果) 的视线.
const quietActionLinkClassName =
  "inline-flex h-8 items-center gap-1 rounded-md border border-border bg-card px-2.5 text-[12px] font-medium text-muted-foreground transition-colors duration-150 hover:border-primary/30 hover:bg-muted hover:text-foreground";

function buildCustomerTradeOrderHref(customerId: string) {
  return `/customers/${customerId}?tab=orders&createTradeOrder=1`;
}

function QuietActionLink({
  href,
  label,
}: Readonly<{ href: string; label: string }>) {
  return (
    <Link href={href} prefetch={false} className={quietActionLinkClassName}>
      <span>{label}</span>
      <ChevronRight className="h-3.5 w-3.5" />
    </Link>
  );
}

export function CustomerFollowUpDialog({
  open,
  item,
  resultOptions,
  canCreateCallRecord,
  canCreateSalesOrder = false,
  outboundCallEnabled = false,
  initialResult = "",
  remarkAutoFocus = false,
  triggerSource = "table",
  onClose,
}: Readonly<{
  open: boolean;
  item: CustomerListItem | null;
  resultOptions: CallResultOption[];
  canCreateCallRecord: boolean;
  canCreateSalesOrder?: boolean;
  outboundCallEnabled?: boolean;
  initialResult?: string;
  remarkAutoFocus?: boolean;
  triggerSource?: MobileCallTriggerSource;
  onClose: () => void;
}>) {
  if (!open || !item) {
    return null;
  }

  const dialog = (
    <CustomerFollowUpDialogBody
      key={`${item.id}:${initialResult}`}
      item={item}
      resultOptions={resultOptions}
      canCreateCallRecord={canCreateCallRecord}
      canCreateSalesOrder={canCreateSalesOrder}
      outboundCallEnabled={outboundCallEnabled}
      initialResult={initialResult}
      remarkAutoFocus={remarkAutoFocus}
      triggerSource={triggerSource}
      onClose={onClose}
    />
  );

  if (typeof document === "undefined") {
    return null;
  }

  return createPortal(dialog, document.body);
}

function CustomerFollowUpDialogBody({
  item,
  resultOptions,
  canCreateCallRecord,
  canCreateSalesOrder,
  outboundCallEnabled,
  initialResult,
  remarkAutoFocus,
  triggerSource,
  onClose,
}: Readonly<{
  item: CustomerListItem;
  resultOptions: CallResultOption[];
  canCreateCallRecord: boolean;
  canCreateSalesOrder: boolean;
  outboundCallEnabled: boolean;
  initialResult: string;
  remarkAutoFocus: boolean;
  triggerSource: MobileCallTriggerSource;
  onClose: () => void;
}>) {
  const hasPhone =
    Boolean(item.phone?.trim()) && item.phone.trim() !== "暂无电话";
  const phoneText = hasPhone ? item.phone.trim() : "暂无电话";

  // 列表查询已加载最多 8 条; 直接全展示填满右栏, "查看全部"只在总数更多时出现.
  const recentRecords = item.callRecords;

  const detailHref = `/customers/${item.id}`;
  const liveHref = `${detailHref}?tab=live`;
  const orderHref = buildCustomerTradeOrderHref(item.id);

  const executionDisplayInput = {
    executionClass: item.executionClass,
    newImported: item.newImported,
    pendingFirstCall: item.pendingFirstCall,
  };
  const executionClassVariant = getCustomerExecutionDisplayVariant(
    executionDisplayInput,
  );
  const executionClassLabel = getCustomerExecutionDisplayLongLabel(
    executionDisplayInput,
  );

  // 外呼按钮平时是次要小按钮; 没启动坐席时仍渲染 (disabled-feel) 给 title 提示.
  const canUseOutbound = outboundCallEnabled && canCreateCallRecord && hasPhone;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`跟进 ${item.name}`}
        className="fixed left-[50%] top-[50%] z-50 flex max-h-[88vh] w-full max-w-[860px] translate-x-[-50%] translate-y-[-50%] flex-col overflow-hidden rounded-lg border border-border bg-background text-foreground shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        {/* 顶部: 姓名 + 状态徽章 + 已拨 X/5 + 右上次要入口 */}
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-border bg-card px-4 py-3 md:px-5">
          <div className="flex min-w-0 flex-wrap items-center gap-2.5">
            <h3 className="text-[1.3rem] font-semibold tracking-tight text-foreground">
              {item.name}
            </h3>
            <StatusBadge label={executionClassLabel} variant={executionClassVariant} />
            <CustomerCallProgress
              callCount={item.callCount}
              isWechatAdded={item.isWechatAdded}
            />
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            <QuietActionLink href={liveHref} label="直播邀约" />
            {canCreateSalesOrder ? (
              <QuietActionLink href={orderHref} label="订单" />
            ) : null}
            <QuietActionLink href={detailHref} label="客户详情" />
            <button
              type="button"
              onClick={onClose}
              aria-label="关闭"
              className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border bg-card text-muted-foreground transition-colors duration-150 hover:border-primary/30 hover:bg-muted hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto px-4 py-4 md:px-5 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,0.7fr)] lg:overflow-hidden">
          {/* 左列: 电话 + 本次结果 + 备注 + 保存 */}
          <div className="min-w-0 space-y-4 lg:overflow-y-auto lg:pr-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <div className={cn(dialogSurfaceClassName, "px-4 py-3.5")}>
              <div className="flex items-center justify-between gap-3">
                <p
                  title={hasPhone ? phoneText : undefined}
                  className="min-w-0 truncate font-mono text-[1.6rem] font-semibold leading-none tracking-tight tabular-nums text-foreground"
                >
                  {phoneText}
                </p>
                {hasPhone ? (
                  <OutboundCallSlot
                    customerId={item.id}
                    customerName={item.name}
                    phone={phoneText}
                    triggerSource={triggerSource}
                    enabled={canUseOutbound}
                  />
                ) : null}
              </div>
              <p className="mt-2 text-[12px] leading-5 text-muted-foreground">
                用手机拨打后，在下面点一下结果即可。
              </p>
            </div>

            {canCreateCallRecord ? (
              <CustomerCallRecordForm
                customerId={item.id}
                resultOptions={resultOptions}
                variant="follow-up"
                defaultResult={initialResult}
                remarkAutoFocus={remarkAutoFocus}
                submitLabel="保存"
                pendingLabel="保存中..."
                className={cn(
                  "space-y-3.5",
                  "[&_.crm-label]:text-[11px] [&_.crm-label]:font-semibold [&_.crm-label]:text-muted-foreground",
                  "[&_.crm-textarea]:min-h-[5.5rem] [&_.crm-textarea]:rounded-md [&_.crm-textarea]:border [&_.crm-textarea]:border-border/70 [&_.crm-textarea]:bg-background",
                  "[&_.crm-textarea:focus]:border-primary [&_.crm-textarea:focus]:ring-1 [&_.crm-textarea:focus]:ring-primary",
                  "[&_.crm-banner]:rounded-md [&_.crm-banner]:border-border/70 [&_.crm-banner]:bg-background [&_.crm-banner]:shadow-none",
                )}
                submitButtonClassName="inline-flex w-full items-center justify-center rounded-md bg-primary py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition-colors duration-150 hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
                onSuccess={onClose}
              />
            ) : (
              <div
                className={cn(
                  dialogSurfaceClassName,
                  "px-4 py-3.5 text-[13px] leading-6 text-muted-foreground",
                )}
              >
                当前角色仅查看最近记录。补记请进入客户详情。
              </div>
            )}
          </div>

          {/* 右列: 通话记录 (预览 + "查看全部 N 条" 懒加载分页) */}
          <FollowUpCallHistoryPanel
            customerId={item.id}
            totalCount={item._count.callRecords}
            previewRecords={recentRecords}
          />
        </div>
      </div>
    </div>
  );
}

function OutboundCallSlot({
  customerId,
  customerName,
  phone,
  triggerSource,
  enabled,
}: Readonly<{
  customerId: string;
  customerName: string;
  phone: string;
  triggerSource: MobileCallTriggerSource;
  enabled: boolean;
}>) {
  return (
    <div className="flex shrink-0 items-center gap-2">
      {/* 移动端: 保留原生/tel: 拨号 + 录音待补记流程 (md 以下显示). */}
      <CustomerMobileDialButton
        customerId={customerId}
        customerName={customerName}
        phone={phone}
        triggerSource={triggerSource}
        label="拨打"
        className="inline-flex h-8 shrink-0 items-center justify-center rounded-full border border-primary/20 bg-primary px-3 text-[12px] font-medium text-primary-foreground transition-colors duration-150 hover:border-primary/30 hover:bg-primary/90 md:hidden"
      />

      {/* 桌面端: 次要小"外呼"按钮 (启动坐席后网页拨号; 未启动给 title 提示). */}
      {enabled ? (
        <CustomerOutboundCallButton
          customerId={customerId}
          customerName={customerName}
          label="外呼"
          className="hidden h-8 shrink-0 border-primary/20 bg-primary/10 px-3 text-[12px] text-primary hover:border-primary/30 hover:bg-primary/15 md:inline-flex"
        />
      ) : (
        <button
          type="button"
          disabled
          title="启动坐席后可用"
          className="hidden h-8 shrink-0 cursor-not-allowed items-center gap-1.5 rounded-full border border-border bg-card px-3 text-[12px] font-medium text-muted-foreground opacity-70 md:inline-flex"
        >
          <PhoneOutgoing className="h-3.5 w-3.5" aria-hidden="true" />
          外呼
        </button>
      )}
    </div>
  );
}

function FollowUpCallHistoryPanel({
  customerId,
  totalCount,
  previewRecords,
}: Readonly<{
  customerId: string;
  totalCount: number;
  previewRecords: CustomerListItem["callRecords"];
}>) {
  const [expanded, setExpanded] = useState(false);
  const [records, setRecords] = useState<CustomerCallRecordHistoryEntry[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // totalCount 是真实总数 (item._count.callRecords); 预览只画前若干条,
  // 所以总数比预览多时才给"查看全部"入口.
  const hasMoreThanPreview = totalCount > previewRecords.length;

  async function loadPage(nextCursor: string | null, append: boolean) {
    setLoading(true);
    setError(null);

    const result = await loadCustomerCallRecordsAction(customerId, nextCursor);

    setLoading(false);

    if (result.status === "error") {
      setError(result.message);
      return;
    }

    setRecords((prev) => (append ? [...prev, ...result.records] : result.records));
    setCursor(result.nextCursor);
  }

  function handleExpand() {
    setExpanded(true);
    void loadPage(null, false);
  }

  function handleCollapse() {
    setExpanded(false);
    setRecords([]);
    setCursor(null);
    setError(null);
  }

  const showInitialLoading = expanded && loading && records.length === 0;

  return (
    <div
      className={cn(
        dialogSurfaceClassName,
        "flex min-h-[14rem] min-w-0 flex-col px-4 py-3.5 lg:h-full lg:min-h-0",
      )}
    >
      <div className="mb-2.5 flex items-center justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          {expanded ? "全部记录" : "最近记录"}
        </p>
        <div className="flex items-center gap-2.5">
          <span className="text-[12px] tabular-nums text-muted-foreground">
            {totalCount} 条
          </span>
          {expanded ? (
            <button
              type="button"
              onClick={handleCollapse}
              className="inline-flex items-center gap-0.5 text-[12px] font-medium text-muted-foreground transition-colors duration-150 hover:text-foreground"
            >
              <ChevronUp className="h-3.5 w-3.5" />
              收起
            </button>
          ) : null}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {showInitialLoading ? (
          <div className="flex h-full min-h-[10rem] items-center justify-center text-[13px] text-muted-foreground">
            加载中...
          </div>
        ) : expanded ? (
          <>
            {records.length > 0 ? (
              <ul className="space-y-0">
                {records.map((record) => (
                  <FollowUpRecentRecordRow
                    key={record.id}
                    resultLabel={record.resultLabel}
                    remark={record.remark}
                    callTime={record.callTime}
                  />
                ))}
              </ul>
            ) : null}

            {error ? (
              <div className="mt-3 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-center text-[12px] leading-5 text-destructive">
                <p>{error}</p>
                <button
                  type="button"
                  onClick={() => void loadPage(cursor, records.length > 0)}
                  className="mt-1 font-medium underline underline-offset-2 hover:opacity-80"
                >
                  重试
                </button>
              </div>
            ) : null}

            {!error && records.length === 0 && !loading ? (
              <div className="flex h-full min-h-[10rem] items-center justify-center rounded-md border border-dashed border-border/60 px-4 text-center text-[13px] text-muted-foreground">
                当前客户还没有通话记录
              </div>
            ) : null}

            {cursor && !error ? (
              <button
                type="button"
                disabled={loading}
                onClick={() => void loadPage(cursor, true)}
                className="mt-3 inline-flex w-full items-center justify-center rounded-md border border-border/70 bg-card py-2 text-[12px] font-medium text-muted-foreground transition-colors duration-150 hover:border-primary/30 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? "加载中..." : "加载更多"}
              </button>
            ) : null}

            {!cursor && !error && records.length > 0 ? (
              <p className="mt-3 text-center text-[11px] leading-4 text-muted-foreground/50">
                没有更多了
              </p>
            ) : null}
          </>
        ) : previewRecords.length > 0 ? (
          <>
            <ul className="space-y-0">
              {previewRecords.map((record) => (
                <FollowUpRecentRecordRow
                  key={record.id}
                  resultLabel={record.resultLabel}
                  remark={record.remark}
                  callTime={record.callTime}
                />
              ))}
            </ul>
            {hasMoreThanPreview ? (
              <button
                type="button"
                onClick={handleExpand}
                className="mt-3 inline-flex w-full items-center justify-center gap-1 rounded-md border border-border/70 bg-card py-2 text-[12px] font-medium text-primary transition-colors duration-150 hover:border-primary/40 hover:bg-primary/5"
              >
                查看全部 {totalCount} 条
                <ChevronDown className="h-3.5 w-3.5" />
              </button>
            ) : null}
          </>
        ) : (
          <div className="flex h-full min-h-[10rem] items-center justify-center rounded-md border border-dashed border-border/60 px-4 text-center text-[13px] text-muted-foreground">
            当前客户还没有通话记录
          </div>
        )}
      </div>
    </div>
  );
}

function FollowUpRecentRecordRow({
  resultLabel,
  remark,
  callTime,
}: Readonly<{
  resultLabel: string;
  remark: string | null;
  callTime: Date | string;
}>) {
  const normalizedTime = callTime instanceof Date ? callTime : new Date(callTime);
  const trimmedRemark = remark?.trim();

  return (
    <li className="border-b border-border/40 py-2.5 first:pt-0 last:border-b-0 last:pb-0">
      <div className="flex items-start justify-between gap-3">
        <p className="min-w-0 break-words text-[13px] font-semibold leading-5 text-foreground [word-break:normal]">
          {resultLabel}
        </p>
        <time className="shrink-0 pt-0.5 text-right text-[11px] font-medium leading-4 tabular-nums text-muted-foreground">
          {formatDateTime(normalizedTime)}
        </time>
      </div>
      {trimmedRemark ? (
        <p className="mt-0.5 min-w-0 break-words text-[12px] leading-5 text-muted-foreground [word-break:normal]">
          {trimmedRemark}
        </p>
      ) : null}
    </li>
  );
}
