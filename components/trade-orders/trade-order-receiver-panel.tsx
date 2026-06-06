"use client";

import * as React from "react";
import { ShieldCheck, Truck } from "lucide-react";

import { cn } from "@/lib/utils";

type CustomerContext = {
  id: string;
  name: string;
  phone: string;
  address: string | null;
  owner: { id: string; name: string; username: string } | null;
};

export type ReceiverPanelProps = Readonly<{
  customer: CustomerContext;
  receiverName: string;
  receiverPhone: string;
  receiverAddress: string;
  onReceiverNameChange: (value: string) => void;
  onReceiverPhoneChange: (value: string) => void;
  onReceiverAddressChange: (value: string) => void;
  insuranceRequired: boolean;
  insuranceAmount: string;
  onInsuranceRequiredChange: (checked: boolean) => void;
  onInsuranceAmountChange: (value: string) => void;
}>;

export default function TradeOrderReceiverPanel({
  customer,
  receiverName,
  receiverPhone,
  receiverAddress,
  onReceiverNameChange,
  onReceiverPhoneChange,
  onReceiverAddressChange,
  insuranceRequired,
  insuranceAmount,
  onInsuranceRequiredChange,
  onInsuranceAmountChange,
}: ReceiverPanelProps) {
  function handleResetReceiver() {
    onReceiverNameChange(customer.name);
    onReceiverPhoneChange(customer.phone);
    onReceiverAddressChange(customer.address ?? "");
  }

  const effectiveInsuranceAmount = insuranceRequired ? insuranceAmount : "0";

  return (
    <section
      className={cn(
        "overflow-hidden rounded-xl border border-border/60 bg-card shadow-sm",
      )}
    >
      <div className="flex flex-col gap-2 border-b border-border/50 bg-card px-4 py-2.5 md:flex-row md:items-center md:justify-between">
        <div className="flex min-w-0 items-center gap-2.5">
          <Truck
            className="h-4 w-4 shrink-0 text-muted-foreground"
            aria-hidden="true"
          />
          <div className="min-w-0">
            <h2 className="text-[0.95rem] font-semibold leading-5 text-foreground">
              收件与履约信息
            </h2>
          </div>
        </div>
        <div className="crm-toolbar-cluster md:justify-end">
          <button
            type="button"
            className="crm-button crm-button-secondary h-9 px-3 text-[12px]"
            onClick={handleResetReceiver}
          >
            同步客户资料
          </button>
        </div>
      </div>
      <div className="p-3.5 md:p-4">
        <div className="grid gap-3 md:grid-cols-2">
          <label className="block">
            <span className="crm-label">收件人</span>
            <input
              name="receiverName"
              value={receiverName}
              onChange={(event) => onReceiverNameChange(event.target.value)}
              className="crm-input"
            />
          </label>
          <label className="block">
            <span className="crm-label">联系电话</span>
            <input
              name="receiverPhone"
              value={receiverPhone}
              onChange={(event) => onReceiverPhoneChange(event.target.value)}
              className="crm-input"
            />
          </label>
          <label className="block md:col-span-2">
            <span className="crm-label">收件地址</span>
            <textarea
              name="receiverAddress"
              rows={3}
              value={receiverAddress}
              onChange={(event) => onReceiverAddressChange(event.target.value)}
              className="crm-textarea min-h-[5.2rem]"
            />
          </label>

          <label className="flex min-h-12 items-center justify-between gap-3 rounded-xl border border-border/55 bg-muted/20 px-4 py-3">
            <span className="flex min-w-0 items-center gap-2.5">
              <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-primary/15 bg-primary/8 text-primary">
                <ShieldCheck className="h-4 w-4" aria-hidden="true" />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-foreground">
                  订单保价
                </span>
                <span className="block text-[12px] leading-4 text-muted-foreground">
                  开启后进入履约快照
                </span>
              </span>
            </span>
            <input
              type="checkbox"
              name="insuranceRequired"
              checked={insuranceRequired}
              onChange={(event) =>
                onInsuranceRequiredChange(event.target.checked)
              }
              className="h-4 w-4 rounded border-border text-primary"
            />
          </label>

          <label className="block">
            <span className="crm-label">保价金额</span>
            <input
              name="insuranceAmount"
              type="number"
              min="0"
              step="0.01"
              value={effectiveInsuranceAmount}
              onChange={(event) => onInsuranceAmountChange(event.target.value)}
              disabled={!insuranceRequired}
              className="crm-input disabled:cursor-not-allowed disabled:bg-foreground/5"
              placeholder="0.00"
            />
          </label>
        </div>
      </div>
    </section>
  );
}
