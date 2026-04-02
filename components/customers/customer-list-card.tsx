"use client";

import type { KeyboardEvent as ReactKeyboardEvent, MouseEvent, ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { FilePlus2, FileText, MoreHorizontal, Phone } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { salesOrderPaymentSchemeOptions } from "@/lib/fulfillment/metadata";
import type { CustomerListItem } from "@/lib/customers/queries";
import { CustomerCallRecordForm } from "@/components/customers/customer-call-record-form";
import { CustomerCallRecordHistory } from "@/components/customers/customer-call-record-history";
import { SalesOrderForm } from "@/components/sales-orders/sales-order-form";
import { formatDateTime } from "@/lib/customers/metadata";
import { cn } from "@/lib/utils";

type CreateOrderConfig = {
  skuOptions: Array<{
    id: string;
    skuCode: string;
    skuName: string;
    specText: string;
    unit: string;
    defaultUnitPrice: string;
    codSupported: boolean;
    insuranceSupported: boolean;
    defaultInsuranceAmount: string;
    product: {
      id: string;
      name: string;
      supplier: {
        id: string;
        name: string;
      };
    };
  }>;
  paymentSchemeOptions: typeof salesOrderPaymentSchemeOptions;
  saveAction: (formData: FormData) => Promise<void>;
  redirectTo: string;
};

function normalizeDate(value: Date | string | null | undefined) {
  if (!value) {
    return null;
  }

  return value instanceof Date ? value : new Date(value);
}

function formatCompactDateTime(value: Date) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(value);
}

function getCardProduct(item: CustomerListItem) {
  const purchasedProduct = item.latestPurchasedProduct?.trim();

  if (purchasedProduct) {
    return purchasedProduct;
  }

  const importedProduct = item.latestInterestedProduct?.trim();

  if (importedProduct) {
    return importedProduct;
  }

  return "未记录已购产品";
}

function getCardAddress(item: CustomerListItem) {
  const region = [item.province, item.city, item.district].filter(Boolean).join(" ");
  const detail = item.address?.trim();
  const parts = [region, detail].filter(Boolean);

  return parts.length > 0 ? parts.join(" ") : "未填写地址";
}

function stopCardNavigation(event: MouseEvent<HTMLElement>) {
  event.stopPropagation();
}

function CustomerActionButton({
  icon: Icon,
  label,
  onClick,
  disabled = false,
  fullWidth = false,
}: Readonly<{
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  fullWidth?: boolean;
}>) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={(event) => {
        event.stopPropagation();

        if (disabled) {
          return;
        }

        onClick();
      }}
      className={cn(
        "inline-flex items-center justify-center gap-1.5 text-[13px] font-medium transition-[border-color,background-color,color,opacity,box-shadow,transform] ease-[cubic-bezier(0.22,1,0.36,1)]",
        fullWidth
          ? "h-9 w-full justify-start rounded-[12px] border px-3.5"
          : "h-8 rounded-full border border-transparent px-3",
        disabled
          ? "cursor-not-allowed border-[rgba(15,23,42,0.06)] bg-[rgba(15,23,42,0.04)] text-black/34"
          : fullWidth
            ? "border-[rgba(15,23,42,0.08)] bg-white/88 text-[#0F172A]/78 duration-[160ms] hover:border-[rgba(15,23,42,0.12)] hover:bg-white hover:text-[#0F172A]"
            : "bg-transparent text-[#0F172A]/78 duration-[160ms] hover:border-[rgba(15,23,42,0.06)] hover:bg-white/82 hover:text-[#0F172A]",
      )}
    >
      <Icon className="h-[14px] w-[14px] shrink-0" />
      <span>{label}</span>
    </button>
  );
}

function CustomerModal({
  open,
  title,
  description,
  onClose,
  panelClassName,
  children,
}: Readonly<{
  open: boolean;
  title: string;
  description: string;
  onClose: () => void;
  panelClassName?: string;
  children: ReactNode;
}>) {
  if (!open) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/28 px-4 py-8 lg:pl-[var(--dashboard-sidebar-width,0px)]"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          "crm-card flex max-h-[calc(100vh-4rem)] w-full max-w-2xl flex-col overflow-hidden",
          panelClassName,
        )}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="border-b border-black/6 px-5 py-4">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1.5">
              <h3 className="text-lg font-semibold text-black/84">{title}</h3>
              <p className="text-sm leading-6 text-black/58">{description}</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="crm-button crm-button-ghost min-h-0 px-3 py-2 text-sm"
            >
              关闭
            </button>
          </div>
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
      </div>
    </div>
  );
}

function CustomerIdentity({
  name,
  phone,
}: Readonly<{
  name: string;
  phone: string;
}>) {
  return (
    <div className="mb-4 rounded-[0.84rem] border border-black/7 bg-[rgba(255,255,255,0.78)] px-4 py-3 text-sm leading-6 text-black/62">
      <p className="font-medium text-black/78">{name}</p>
      <p>{phone}</p>
    </div>
  );
}

export function CustomerListCard({
  item,
  canCreateCallRecord,
  canCreateSalesOrder = false,
  createOrderConfig = null,
}: Readonly<{
  item: CustomerListItem;
  canCreateCallRecord: boolean;
  canCreateSalesOrder?: boolean;
  createOrderConfig?: CreateOrderConfig | null;
}>) {
  const router = useRouter();
  const mobileMenuRef = useRef<HTMLDivElement>(null);
  const [callDialogOpen, setCallDialogOpen] = useState(false);
  const [callHistoryDialogOpen, setCallHistoryDialogOpen] = useState(false);
  const [createOrderDialogOpen, setCreateOrderDialogOpen] = useState(false);
  const [mobileActionsOpen, setMobileActionsOpen] = useState(false);

  const detailHref = `/customers/${item.id}`;
  const importedAt = normalizeDate(item.latestImportAt) ?? item.createdAt;
  const address = getCardAddress(item);
  const product = getCardProduct(item);

  useEffect(() => {
    if (!mobileActionsOpen) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      if (!mobileMenuRef.current?.contains(event.target as Node)) {
        setMobileActionsOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setMobileActionsOpen(false);
      }
    }

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [mobileActionsOpen]);

  function navigateTo(href: string) {
    setMobileActionsOpen(false);
    router.push(href);
  }

  function openCallDialog() {
    if (!canCreateCallRecord) {
      return;
    }

    setMobileActionsOpen(false);
    setCallDialogOpen(true);
  }

  function openCallHistoryDialog() {
    setMobileActionsOpen(false);
    setCallHistoryDialogOpen(true);
  }

  function openCreateOrderDialog() {
    if (!canCreateSalesOrder || !createOrderConfig) {
      return;
    }

    setMobileActionsOpen(false);
    setCreateOrderDialogOpen(true);
  }

  function handleCardKeyDown(event: ReactKeyboardEvent<HTMLElement>) {
    if (event.target !== event.currentTarget) {
      return;
    }

    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      navigateTo(detailHref);
    }
  }

  return (
    <>
      <article
        role="link"
        tabIndex={0}
        aria-label={"\u8fdb\u5165 " + item.name + " \u8be6\u60c5\u9875"}
        onClick={() => navigateTo(detailHref)}
        onKeyDown={handleCardKeyDown}
        className={cn(
          "group relative flex h-[140px] cursor-pointer flex-col overflow-hidden rounded-[16px] border border-[rgba(15,23,42,0.08)] bg-[rgba(255,255,255,0.88)] px-[14px] pb-[12px] pt-[14px] shadow-[0_1px_2px_rgba(15,23,42,0.04)] outline-none transition-[transform,border-color,background-color,box-shadow] duration-[180ms] ease-[cubic-bezier(0.22,1,0.36,1)]",
          "focus-visible:ring-2 focus-visible:ring-[rgba(15,23,42,0.10)] focus-visible:ring-offset-0 md:h-[156px] md:rounded-[18px] md:px-[16px] md:pb-[14px] md:pt-[16px] min-[1200px]:h-[160px] min-[1200px]:rounded-[20px] min-[1200px]:px-[18px] min-[1200px]:pb-[16px] min-[1200px]:pt-[18px]",
          "min-[960px]:hover:-translate-y-px min-[960px]:hover:border-[rgba(15,23,42,0.12)] min-[960px]:hover:bg-[rgba(255,255,255,0.96)] min-[960px]:hover:shadow-[0_8px_24px_rgba(15,23,42,0.08)]",
        )}
      >
        <div className="mb-[10px] flex items-start justify-between gap-3">
          <h3 className="min-w-0 truncate text-[20px] font-semibold leading-7 tracking-[-0.01em] text-[#0F172A]">
            {item.name}
          </h3>

          <div ref={mobileMenuRef} className="relative z-20 flex shrink-0 items-start gap-1.5 pl-2">
            <time
              dateTime={importedAt.toISOString()}
              title={formatDateTime(importedAt)}
              className="pt-1 text-[12px] font-medium leading-[18px] tabular-nums text-[#94A3B8]"
            >
              {formatCompactDateTime(importedAt)}
            </time>

            <button
              type="button"
              aria-label="更多操作"
              aria-expanded={mobileActionsOpen}
              onClick={(event) => {
                event.stopPropagation();
                setMobileActionsOpen((current) => !current);
              }}
              className="inline-flex h-7 w-7 items-center justify-center rounded-[10px] border border-[rgba(15,23,42,0.08)] bg-white/94 text-[#64748B] transition hover:border-[rgba(15,23,42,0.12)] hover:text-[#334155] min-[960px]:hidden"
            >
              <MoreHorizontal className="h-3.5 w-3.5" />
            </button>

            {mobileActionsOpen ? (
              <div
                className="absolute right-0 top-9 z-30 w-[11rem] rounded-[14px] border border-[rgba(15,23,42,0.08)] bg-[rgba(255,255,255,0.96)] p-1.5 shadow-[0_8px_24px_rgba(15,23,42,0.08)] min-[960px]:hidden"
                onClick={stopCardNavigation}
              >
                <div className="space-y-1">
                  <CustomerActionButton
                    icon={Phone}
                    label="通话"
                    onClick={openCallDialog}
                    disabled={!canCreateCallRecord}
                    fullWidth
                  />
                  <CustomerActionButton
                    icon={FileText}
                    label="通话记录"
                    onClick={openCallHistoryDialog}
                    fullWidth
                  />
                  <CustomerActionButton
                    icon={FilePlus2}
                    label="创建订单"
                    onClick={openCreateOrderDialog}
                    disabled={!canCreateSalesOrder || !createOrderConfig}
                    fullWidth
                  />
                </div>
              </div>
            ) : null}
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col">
          <p className="mb-2 truncate text-[16px] font-medium leading-6 text-[#1E293B]">{item.phone}</p>
          <p
            title={address}
            className="mb-[6px] overflow-hidden text-[14px] font-normal leading-[22px] text-[#64748B] line-clamp-2"
          >
            {address}
          </p>
          <p
            title={product}
            className="mt-auto truncate text-[14px] font-medium leading-[22px] text-[#475569]"
          >
            {product}
          </p>
        </div>

        <div className="pointer-events-none absolute inset-0 hidden min-[960px]:block">
          <div className="absolute inset-0 rounded-[inherit] bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.32)_62%,rgba(255,255,255,0.52))] opacity-0 transition-opacity duration-[180ms] ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:opacity-100 group-focus-within:opacity-100" />

          <div className="absolute inset-x-0 bottom-3 flex translate-y-[6px] justify-center opacity-0 transition-[opacity,transform] duration-[160ms] ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:translate-y-0 group-focus-within:opacity-100">
            <div className="pointer-events-auto flex h-10 items-center gap-[6px] rounded-full border border-[rgba(15,23,42,0.06)] bg-[rgba(255,255,255,0.82)] p-1 shadow-[0_6px_18px_rgba(15,23,42,0.08)] backdrop-blur-[10px]">
              <CustomerActionButton
                icon={Phone}
                label="通话"
                onClick={openCallDialog}
                disabled={!canCreateCallRecord}
              />
              <CustomerActionButton
                icon={FileText}
                label="通话记录"
                onClick={openCallHistoryDialog}
              />
              <CustomerActionButton
                icon={FilePlus2}
                label="创建订单"
                onClick={openCreateOrderDialog}
                disabled={!canCreateSalesOrder || !createOrderConfig}
              />
            </div>
          </div>
        </div>
      </article>

      <CustomerModal
        open={callDialogOpen}
        title="\u8bb0\u5f55\u901a\u8bdd"
        description={
          "\u4e3a " +
          item.name +
          " \u8bb0\u5f55\u672c\u6b21\u901a\u8bdd\u7ed3\u679c\u3001\u65f6\u957f\u3001\u5907\u6ce8\u548c\u4e0b\u6b21\u8ddf\u8fdb\u65f6\u95f4\u3002"
        }
        onClose={() => setCallDialogOpen(false)}
      >
        <CustomerIdentity name={item.name} phone={item.phone} />
        <CustomerCallRecordForm customerId={item.id} onSuccess={() => setCallDialogOpen(false)} />
      </CustomerModal>

      <CustomerModal
        open={callHistoryDialogOpen}
        title="通话记录"
        description={`查看 ${item.name} 最近的通话结果与跟进节奏。`}
        onClose={() => setCallHistoryDialogOpen(false)}
      >
        <CustomerIdentity name={item.name} phone={item.phone} />
        <CustomerCallRecordHistory records={item.callRecords} />
      </CustomerModal>

      <CustomerModal
        open={createOrderDialogOpen}
        title="创建订单"
        description={`直接在客户工作台为 ${item.name} 发起销售订单。`}
        onClose={() => setCreateOrderDialogOpen(false)}
        panelClassName="max-w-5xl"
      >
        {createOrderConfig ? (
          <SalesOrderForm
            saveAction={createOrderConfig.saveAction}
            skuOptions={createOrderConfig.skuOptions}
            paymentSchemeOptions={createOrderConfig.paymentSchemeOptions}
            fixedCustomer={{
              id: item.id,
              name: item.name,
              phone: item.phone,
              address: address === "未填写地址" ? null : address,
              owner: item.owner,
            }}
            submitLabel="创建销售订单"
            helperText="当前客户已固定，直接填写成交信息、收件信息和支付方案。"
            redirectTo={createOrderConfig.redirectTo}
          />
        ) : null}
      </CustomerModal>
    </>
  );
}
