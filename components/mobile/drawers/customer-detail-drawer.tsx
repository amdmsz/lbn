"use client";

/**
 * Mobile customer detail drawer.
 *
 * 从 mobile-app-shell.tsx 抽出 (Phase 2 plan).
 * 自包含: 自身管理 detailState / 照片上传 / 备注编辑 / callHistoryExpanded 等 9 个本地 state.
 * 父组件只负责传入 customer / 回调 / call 元数据.
 *
 * 关键 props 契约:
 * - customer: 列表选中的客户, null 时整个 drawer 不渲染
 * - callMode + canCreateCallRecord: 控制通话按钮可用性, 由父决定
 * - callResultOptions: 通话结果文案映射, 用于通话记录展示
 * - onStartCall / onOpenOrder: 跨 drawer 操作回调
 * - onAvatarUpdated / onRemarkUpdated: 让父更新列表缓存
 * - onClose: 父收起 drawer
 */

import { useEffect, useRef, useState } from "react";
import { ChevronRight, ClipboardList, FileText } from "lucide-react";
import { IoCall, IoChatbubble, IoChevronBack } from "react-icons/io5";
import type { CallResultOption } from "@/lib/calls/metadata";
import type { MobileCallTriggerSource } from "@/lib/calls/mobile-call-followup";
import type { CustomerListItem } from "@/lib/customers/queries";
import {
  fetchMobileCustomerDetail,
  uploadMobileCustomerAvatar,
  updateMobileCustomerRemark,
  type MobileCustomerDetail,
} from "@/lib/mobile/client-api";
import type { MobileCallMode } from "@/lib/mobile/dialpad-call-routing";
import { cn } from "@/lib/utils";
import {
  formatCallDuration,
  formatNullableRelativeDate,
  isMaskedPhone,
} from "@/components/mobile/lib/format";
import {
  readImageFileAsDataUrl,
  readStoredCustomerPhoto,
} from "@/components/mobile/lib/photo-storage";
import {
  getCustomerAssignmentLabel,
  getCustomerDetailAddressLabel,
  getCustomerDialProductSignal,
} from "@/components/mobile/lib/customer-modeling";
import {
  getCallModeLabel,
  getPhoneResultLabel,
} from "@/components/mobile/lib/phone-history";
import { PhoneAvatar } from "@/components/mobile/lib/phone-avatar";

export function CustomerDetailDrawer({
  customer,
  callMode,
  callResultOptions,
  canCreateCallRecord,
  onStartCall,
  onOpenOrder,
  onAvatarUpdated,
  onRemarkUpdated,
  onClose,
}: Readonly<{
  customer: CustomerListItem | null;
  callMode: MobileCallMode;
  callResultOptions: readonly CallResultOption[];
  canCreateCallRecord: boolean;
  onStartCall: (
    customer: CustomerListItem,
    triggerSource: MobileCallTriggerSource,
    mode: MobileCallMode,
  ) => void;
  onOpenOrder: (customer: CustomerListItem) => void;
  onAvatarUpdated: (customerId: string, avatarUrl: string | null) => void;
  onRemarkUpdated: (customerId: string, remark: string | null) => void;
  onClose: () => void;
}>) {
  const [detailState, setDetailState] = useState<{
    customerId: string;
    detail: MobileCustomerDetail | null;
    error: string | null;
  } | null>(null);
  const [callHistoryExpanded, setCallHistoryExpanded] = useState(false);
  const [customerPhotoUrl, setCustomerPhotoUrl] = useState<string | null>(null);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [remarkEditing, setRemarkEditing] = useState(false);
  const [remarkDraft, setRemarkDraft] = useState("");
  const [remarkSaving, setRemarkSaving] = useState(false);
  const [remarkError, setRemarkError] = useState<string | null>(null);
  const detailSectionRef = useRef<HTMLDivElement>(null);
  const customerId = customer?.id ?? null;

  useEffect(() => {
    if (!customerId) {
      return;
    }

    let canceled = false;

    void fetchMobileCustomerDetail(customerId)
      .then((payload) => {
        if (canceled) {
          return;
        }

        setDetailState({
          customerId,
          detail: payload.customer,
          error: null,
        });
        setCustomerPhotoUrl(
          payload.customer.avatarUrl ?? customer?.avatarUrl ?? readStoredCustomerPhoto(customerId),
        );
      })
      .catch((error) => {
        if (canceled) {
          return;
        }

        setDetailState({
          customerId,
          detail: null,
          error: error instanceof Error ? error.message : "客户详情加载失败。",
        });
      });

    return () => {
      canceled = true;
    };
  }, [customer?.avatarUrl, customerId]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (!customerId) {
        setCustomerPhotoUrl(null);
        setRemarkDraft("");
        setRemarkEditing(false);
        setRemarkError(null);
        setRemarkSaving(false);
        return;
      }

      setCustomerPhotoUrl(customer?.avatarUrl ?? readStoredCustomerPhoto(customerId));
      setPhotoError(null);
      setPhotoUploading(false);
      setCallHistoryExpanded(false);
      setRemarkError(null);
      setRemarkSaving(false);
    }, 0);

    return () => window.clearTimeout(timer);
  }, [customer?.avatarUrl, customerId]);

  const detailRemarkForSync =
    detailState?.customerId === customerId ? detailState.detail?.profile.remark : undefined;

  useEffect(() => {
    if (!customerId || remarkEditing) {
      return;
    }

    const syncedRemark =
      detailRemarkForSync !== undefined ? detailRemarkForSync ?? "" : customer?.remark ?? "";

    setRemarkDraft(syncedRemark);
  }, [customer?.remark, customerId, detailRemarkForSync, remarkEditing]);

  if (!customer) {
    return null;
  }

  const activeDetailState =
    detailState?.customerId === customer.id ? detailState : null;
  const detail = activeDetailState?.detail ?? null;
  const detailError = activeDetailState?.error ?? null;
  const detailLoading = !activeDetailState;
  const addressLabel = getCustomerDetailAddressLabel(customer, detail);
  const displayPhone = detail?.phone ?? customer.phone;
  const displayRemark = detail ? detail.profile.remark : customer.remark;
  const assignmentLabel = getCustomerAssignmentLabel(customer, detail);
  const productSignal = getCustomerDialProductSignal(customer);
  const callResultLabelMap = new Map(
    callResultOptions.map((option) => [option.value, option.label]),
  );
  const detailCallRecords = detail
    ? detail.timeline.callRecords.map((record) => {
        const resolvedCode = record.resultCode?.trim() || record.result || null;

        return {
          ...record,
          resultLabel: resolvedCode
            ? callResultLabelMap.get(resolvedCode) ?? resolvedCode
            : "未填写",
        };
      })
    : customer.callRecords;
  const latestCall = detailCallRecords[0] ?? null;
  const visibleCallRecords = callHistoryExpanded
    ? detailCallRecords
    : detailCallRecords.slice(0, 1);
  const callSummary = latestCall
    ? `${getCallModeLabel(latestCall.callSource)} ${getPhoneResultLabel(latestCall)} · ${formatNullableRelativeDate(latestCall.callTime)}`
    : "暂无记录";

  function startCall(mode: MobileCallMode) {
    if (!canCreateCallRecord || !customer) {
      return;
    }

    onStartCall(customer, "detail", mode);
  }

  function startPreferredCall() {
    startCall(callMode);
  }

  function sendSms() {
    const phone = displayPhone.trim().replace(/\s+/g, "");

    if (!phone || isMaskedPhone(phone)) {
      return;
    }

    window.location.assign(`sms:${phone}`);
  }

  function openOrder() {
    if (!customer) {
      return;
    }

    onOpenOrder(customer);
    onClose();
  }

  function scrollToDetails() {
    detailSectionRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }

  async function handleCustomerPhotoChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0] ?? null;
    event.currentTarget.value = "";
    const activeCustomerId = customer?.id ?? null;

    if (!file || !activeCustomerId) {
      return;
    }

    if (!file.type.startsWith("image/")) {
      setPhotoError("请选择图片文件。");
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      setPhotoError("照片不能超过 2MB。");
      return;
    }

    const previousPhotoUrl = customerPhotoUrl;
    setPhotoUploading(true);

    try {
      const dataUrl = await readImageFileAsDataUrl(file);
      setCustomerPhotoUrl(dataUrl);
      const payload = await uploadMobileCustomerAvatar(activeCustomerId, file);
      setCustomerPhotoUrl(payload.customer.avatarUrl);
      onAvatarUpdated(activeCustomerId, payload.customer.avatarUrl);
      setDetailState((current) => {
        if (current?.customerId !== activeCustomerId || !current.detail) {
          return current;
        }

        return {
          ...current,
          detail: {
            ...current.detail,
            avatarUrl: payload.customer.avatarUrl,
          },
        };
      });
      setPhotoError(null);
    } catch (error) {
      setCustomerPhotoUrl(previousPhotoUrl);
      setPhotoError(error instanceof Error ? error.message : "照片上传失败。");
    } finally {
      setPhotoUploading(false);
    }
  }

  function startRemarkEditing() {
    setRemarkDraft(displayRemark ?? "");
    setRemarkError(null);
    setRemarkEditing(true);
  }

  async function saveRemark() {
    const activeCustomerId = customer?.id;

    if (!activeCustomerId) {
      return;
    }

    const nextRemark = remarkDraft.trim();

    setRemarkSaving(true);
    setRemarkError(null);

    try {
      const payload = await updateMobileCustomerRemark(activeCustomerId, nextRemark);
      const savedRemark = payload.customer.remark;

      setDetailState((current) => {
        if (current?.customerId !== activeCustomerId || !current.detail) {
          return current;
        }

        return {
          ...current,
          detail: {
            ...current.detail,
            profile: {
              ...current.detail.profile,
              remark: savedRemark,
            },
          },
        };
      });
      onRemarkUpdated(activeCustomerId, savedRemark);
      setRemarkDraft(savedRemark ?? "");
      setRemarkEditing(false);
    } catch (error) {
      setRemarkError(error instanceof Error ? error.message : "备注保存失败。");
    } finally {
      setRemarkSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[62] bg-[#d8e2ef]">
      <section className="lbn-phone-contact-detail">
        <header className="flex shrink-0 items-center justify-between px-5 pb-4 pt-[max(18px,env(safe-area-inset-top))]">
          <button
            type="button"
            onClick={onClose}
            className="lbn-phone-detail-control lbn-phone-press inline-flex h-12 w-12 items-center justify-center rounded-full text-white"
            aria-label="返回通讯录"
          >
            <IoChevronBack className="h-8 w-8" aria-hidden />
          </button>
          <span
            className={cn("lbn-phone-cti-dot", canCreateCallRecord && "is-ready")}
            role="status"
            aria-label={canCreateCallRecord ? "通话可用" : "通话不可用"}
            title={canCreateCallRecord ? "通话可用" : "通话不可用"}
          />
        </header>

        <div className="lbn-mobile-scrollbar-none min-h-0 flex-1 overflow-y-auto px-5 pb-[calc(112px+env(safe-area-inset-bottom))]">
          <div className="flex flex-col items-center pt-12 text-center text-white">
            <PhoneAvatar name={customer.name} size="lg" photoUrl={customerPhotoUrl} />
            <div className="relative mt-8">
              <div className="lbn-phone-detail-line-switch is-static">
                <span>本机拨号</span>
                <strong>录音上传</strong>
              </div>
            </div>
            <h2 className="mt-2 max-w-full truncate text-[42px] font-semibold leading-tight">
              {customer.name}
            </h2>
            <div className="mt-8 grid w-full grid-cols-4 gap-4">
              <button
                type="button"
                disabled={!displayPhone || isMaskedPhone(displayPhone)}
                onClick={sendSms}
                className="lbn-phone-press flex min-w-0 flex-col items-center gap-2 text-white disabled:opacity-45"
              >
                <span className="lbn-phone-detail-action inline-flex h-16 w-16 items-center justify-center rounded-full">
                  <IoChatbubble className="h-7 w-7" aria-hidden />
                </span>
                <span className="truncate text-[12px]">信息</span>
              </button>
              <button
                type="button"
                disabled={!canCreateCallRecord}
                onClick={startPreferredCall}
                className="lbn-phone-press flex min-w-0 flex-col items-center gap-2 text-white disabled:opacity-45"
              >
                <span className="lbn-phone-detail-action inline-flex h-16 w-16 items-center justify-center rounded-full">
                  <IoCall className="h-7 w-7" aria-hidden />
                </span>
                <span className="truncate text-[12px]">通话</span>
              </button>
              <button
                type="button"
                onClick={openOrder}
                className="lbn-phone-press flex min-w-0 flex-col items-center gap-2 text-white"
              >
                <span className="lbn-phone-detail-action inline-flex h-16 w-16 items-center justify-center rounded-full">
                  <ClipboardList className="h-7 w-7" aria-hidden />
                </span>
                <span className="truncate text-[12px]">下单</span>
              </button>
              <button
                type="button"
                onClick={scrollToDetails}
                className="lbn-phone-press flex min-w-0 flex-col items-center gap-2 text-white"
              >
                <span className="lbn-phone-detail-action inline-flex h-16 w-16 items-center justify-center rounded-full">
                  <FileText className="h-7 w-7" aria-hidden />
                </span>
                <span className="truncate text-[12px]">详情</span>
              </button>
            </div>
          </div>

          <label className="lbn-phone-glass-card lbn-phone-press mt-6 block cursor-pointer overflow-hidden rounded-[28px] text-white">
            <input
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={handleCustomerPhotoChange}
            />
            <span className="flex items-center gap-3 px-5 py-5">
              <PhoneAvatar name={customer.name} size="sm" photoUrl={customerPhotoUrl} />
              <span className="min-w-0 flex-1 truncate text-[22px]">联系人照片与海报</span>
              <span className="text-[15px] text-white/72">
                {photoUploading ? "上传中" : customerPhotoUrl ? "更换" : "上传"}
              </span>
              <ChevronRight className="h-7 w-7" aria-hidden />
            </span>
            {photoError ? (
              <span className="block border-t border-white/14 px-5 py-3 text-left text-[13px] text-white/74">
                {photoError}
              </span>
            ) : null}
          </label>

          <div className="lbn-phone-glass-card mt-4 rounded-[28px] px-5 py-5 text-white">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="text-[18px] text-white/86">电话</div>
                <div className="mt-1 text-[24px] font-light">{displayPhone}</div>
                <div className="mt-3 max-w-[13rem] break-words text-left text-[18px] leading-6 text-white/78">
                  {addressLabel}
                </div>
              </div>
              <div className="shrink-0 text-right">
                <div className="text-[15px] text-white/58">分配时间</div>
                <div className="mt-1 max-w-[9.5rem] truncate text-[16px] text-white/88">
                  {assignmentLabel}
                </div>
              </div>
            </div>
            <div className="my-5 h-px bg-white/18" />
            <div className="flex items-center justify-between gap-3">
              <div className="text-[20px] text-white/90">备注</div>
              {!remarkEditing ? (
                <button
                  type="button"
                  onClick={startRemarkEditing}
                  className="lbn-phone-press rounded-full px-3 py-1 text-[15px] text-white/74 active:bg-white/12"
                >
                  编辑
                </button>
              ) : null}
            </div>
            {remarkEditing ? (
              <div className="mt-3">
                <textarea
                  value={remarkDraft}
                  onChange={(event) => setRemarkDraft(event.target.value)}
                  maxLength={1000}
                  rows={4}
                  autoFocus
                  placeholder="输入客户备注"
                  className="min-h-28 w-full resize-none rounded-[22px] border border-white/18 bg-white/14 px-4 py-3 text-[16px] leading-6 text-white outline-none backdrop-blur-xl placeholder:text-white/48 focus:border-white/30"
                />
                <div className="mt-3 flex items-center justify-between gap-3">
                  <span className="text-[13px] text-white/54">
                    {remarkDraft.trim().length}/1000
                  </span>
                  <span className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setRemarkDraft(displayRemark ?? "");
                        setRemarkError(null);
                        setRemarkEditing(false);
                      }}
                      disabled={remarkSaving}
                      className="lbn-phone-press h-10 rounded-full px-4 text-[15px] text-white/72 disabled:opacity-45"
                    >
                      取消
                    </button>
                    <button
                      type="button"
                      onClick={() => void saveRemark()}
                      disabled={remarkSaving}
                      className="lbn-phone-press h-10 rounded-full bg-white px-5 text-[15px] font-medium text-[#0a84ff] disabled:opacity-45"
                    >
                      {remarkSaving ? "保存中" : "保存"}
                    </button>
                  </span>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={startRemarkEditing}
                className="lbn-phone-press mt-2 block min-h-12 w-full rounded-[18px] px-0 py-1 text-left text-[16px] leading-6 text-white/72"
              >
                {displayRemark || (detailLoading ? "正在同步客户资料..." : "暂无备注")}
              </button>
            )}
            {remarkError ? <p className="mt-3 text-[13px] text-white/72">{remarkError}</p> : null}
            {detailError ? (
              <p className="mt-3 text-[13px] text-white/72">{detailError}</p>
            ) : null}
          </div>

          <div className="lbn-phone-glass-card mt-4 overflow-hidden rounded-[28px] text-white">
            <button
              type="button"
              onClick={() => setCallHistoryExpanded((value) => !value)}
              className="lbn-phone-press block w-full px-5 py-4 text-left"
            >
              <span className="block text-[20px]">通话记录：{callSummary}</span>
              <span className="mt-1 block text-[15px] text-white/70">
                {callHistoryExpanded ? "收起通话记录" : "展开通话记录"}
              </span>
            </button>
            {callHistoryExpanded ? (
              <div className="border-t border-white/16 px-5 py-2">
                {visibleCallRecords.length > 0 ? (
                  visibleCallRecords.map((record) => (
                    <div
                      key={record.id}
                      className="flex min-w-0 items-center justify-between gap-3 border-b border-white/10 py-3 last:border-b-0"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-[16px] text-white">
                          {getCallModeLabel(record.callSource)} {getPhoneResultLabel(record)}
                        </span>
                        <span className="mt-0.5 block text-[13px] text-white/60">
                          {formatNullableRelativeDate(record.callTime)}
                        </span>
                      </span>
                      <span className="shrink-0 text-[13px] text-white/60">
                        {record.durationSeconds > 0
                          ? formatCallDuration(record.durationSeconds)
                          : "未计时"}
                      </span>
                    </div>
                  ))
                ) : (
                  <div className="py-4 text-[15px] text-white/66">暂无通话记录</div>
                )}
              </div>
            ) : null}
          </div>

          <div
            ref={detailSectionRef}
            className="lbn-phone-glass-card mt-4 rounded-[28px] px-5 py-5 text-white"
          >
            <div className="text-[20px] text-white/90">客户详情</div>
            <div className="mt-4 grid gap-3 text-left">
              {[
                ["姓名", customer.name],
                ["电话", displayPhone],
                ["地址", addressLabel],
                ["微信", detail?.wechatId || "未填写"],
                ["承接人", customer.owner?.name || "未分配"],
                ["分配时间", assignmentLabel],
                ["客户等级", customer.executionClass],
                ["商品", productSignal ? `${productSignal.label}：${productSignal.value}` : "暂无"],
                ["成交单数", `${customer.approvedTradeOrderCount} 单`],
                ["最近跟进", formatNullableRelativeDate(customer.latestFollowUpAt)],
              ].map(([label, value]) => (
                <div key={label} className="flex min-w-0 items-start gap-4">
                  <span className="w-20 shrink-0 text-[15px] text-white/58">{label}</span>
                  <span className="min-w-0 flex-1 break-words text-[16px] text-white/88">
                    {value}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
