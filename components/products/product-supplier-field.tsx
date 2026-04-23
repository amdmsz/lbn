"use client";

import { type FormEvent, useState, useTransition } from "react";
import { X } from "lucide-react";
import { ActionBanner } from "@/components/shared/action-banner";

export type SupplierOption = {
  id: string;
  name: string;
  code: string;
  enabled: boolean;
};

type InlineSupplierResult =
  | {
      success: true;
      supplier: {
        id: string;
        name: string;
        code: string;
      };
      message: string;
    }
  | {
      success: false;
      errorMessage: string;
    };

const fieldSectionClassName =
  "rounded-[0.95rem] border border-[var(--color-border-soft)] bg-[var(--color-shell-surface-soft)] p-3.5";

const dialogPanelClassName =
  "flex max-h-[calc(100vh-4rem)] w-full max-w-[40rem] flex-col overflow-hidden rounded-[1.1rem] border border-[var(--color-border-soft)] bg-[var(--color-panel)] shadow-[0_24px_70px_rgba(15,23,42,0.18)]";

const dialogSectionClassName =
  "rounded-[1rem] border border-[var(--color-border-soft)] bg-[var(--color-panel-soft)] p-4 shadow-[var(--color-shell-shadow-sm)]";

function matchesSupplier(option: SupplierOption, keyword: string) {
  const normalizedKeyword = keyword.trim().toLowerCase();

  if (!normalizedKeyword) {
    return true;
  }

  return (
    option.name.toLowerCase().includes(normalizedKeyword) ||
    option.code.toLowerCase().includes(normalizedKeyword)
  );
}

function sortSuppliers(options: SupplierOption[]) {
  return [...options].sort((left, right) => {
    if (left.enabled !== right.enabled) {
      return left.enabled ? -1 : 1;
    }

    return left.name.localeCompare(right.name);
  });
}

export function ProductSupplierField({
  suppliers,
  initialSelectedSupplierId,
  disabled,
  canQuickCreateSupplier,
  createInlineSupplierAction,
}: Readonly<{
  suppliers: SupplierOption[];
  initialSelectedSupplierId: string;
  disabled?: boolean;
  canQuickCreateSupplier: boolean;
  createInlineSupplierAction: (
    formData: FormData,
  ) => Promise<InlineSupplierResult>;
}>) {
  const [supplierOptions, setSupplierOptions] = useState(() =>
    sortSuppliers(suppliers),
  );
  const [selectedSupplierId, setSelectedSupplierId] = useState(
    initialSelectedSupplierId,
  );
  const [supplierSearch, setSupplierSearch] = useState(() => {
    const initialSupplier =
      suppliers.find((supplier) => supplier.id === initialSelectedSupplierId) ??
      null;
    return initialSupplier?.name ?? "";
  });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [inlineNotice, setInlineNotice] = useState<string | null>(null);
  const [quickCode, setQuickCode] = useState("");
  const [quickName, setQuickName] = useState("");
  const [quickContactName, setQuickContactName] = useState("");
  const [quickContactPhone, setQuickContactPhone] = useState("");
  const [quickRemark, setQuickRemark] = useState("");
  const [pending, startTransition] = useTransition();

  const filteredSuppliers = supplierOptions.filter(
    (supplier) =>
      (supplier.enabled || supplier.id === selectedSupplierId) &&
      matchesSupplier(supplier, supplierSearch),
  );
  const selectedSupplier =
    supplierOptions.find((supplier) => supplier.id === selectedSupplierId) ??
    null;
  const visibleSuppliers =
    selectedSupplier &&
    !filteredSuppliers.some((supplier) => supplier.id === selectedSupplier.id)
      ? [selectedSupplier, ...filteredSuppliers]
      : filteredSuppliers;

  const dialogFooterHint = pending
    ? "正在创建供应商。"
    : "创建后会自动回填到当前商品。";

  function resetQuickSupplierForm() {
    setQuickCode("");
    setQuickName("");
    setQuickContactName("");
    setQuickContactPhone("");
    setQuickRemark("");
    setDialogError(null);
  }

  function closeDialog() {
    setDialogOpen(false);
    setDialogError(null);
  }

  function handleQuickCreateSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setDialogError(null);
    setInlineNotice(null);

    const formData = new FormData();
    formData.set("code", quickCode);
    formData.set("name", quickName);
    formData.set("contactName", quickContactName);
    formData.set("contactPhone", quickContactPhone);
    formData.set("remark", quickRemark);

    startTransition(async () => {
      const result = await createInlineSupplierAction(formData);

      if (!result.success) {
        setDialogError(result.errorMessage);
        return;
      }

      const createdSupplier: SupplierOption = {
        ...result.supplier,
        enabled: true,
      };

      const existing = supplierOptions.some(
        (supplier) => supplier.id === createdSupplier.id,
      );
      const nextSupplierOptions = existing
        ? supplierOptions.map((supplier) =>
            supplier.id === createdSupplier.id ? createdSupplier : supplier,
          )
        : [...supplierOptions, createdSupplier];

      setSupplierOptions(sortSuppliers(nextSupplierOptions));
      setSelectedSupplierId(createdSupplier.id);
      setSupplierSearch(createdSupplier.name);
      setInlineNotice(result.message);
      resetQuickSupplierForm();
      setDialogOpen(false);
    });
  }

  return (
    <>
      <div className="space-y-3 xl:col-span-2">
        <div className={fieldSectionClassName}>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <label className="min-w-0 flex-1 space-y-2">
              <span className="crm-label">搜索供应商</span>
              <input
                value={supplierSearch}
                onChange={(event) => setSupplierSearch(event.target.value)}
                placeholder="按名称或编码搜索"
                className="crm-input"
                disabled={disabled}
              />
            </label>

            {canQuickCreateSupplier && !disabled ? (
              <button
                type="button"
                className="crm-button crm-button-secondary w-full shrink-0 sm:w-auto"
                onClick={() => setDialogOpen(true)}
              >
                新增供应商
              </button>
            ) : null}
          </div>

          <label className="mt-3 block space-y-2">
            <span className="crm-label">供应商</span>
            <select
              name="supplierId"
              required
              className="crm-select"
              value={selectedSupplierId}
              onChange={(event) => {
                const nextSupplierId = event.target.value;
                const nextSupplier =
                  supplierOptions.find(
                    (supplier) => supplier.id === nextSupplierId,
                  ) ?? null;
                setSelectedSupplierId(nextSupplierId);
                setSupplierSearch(nextSupplier?.name ?? supplierSearch);
              }}
              disabled={disabled}
            >
              <option value="" disabled>
                请选择供应商
              </option>
              {visibleSuppliers.map((supplier) => (
                <option key={supplier.id} value={supplier.id}>
                  {supplier.name} ({supplier.code})
                  {supplier.enabled ? "" : " - 已停用"}
                </option>
              ))}
            </select>
          </label>

          {visibleSuppliers.length === 0 ? (
            <div className="mt-3 rounded-[0.9rem] border border-dashed border-[var(--color-border-soft)] bg-[var(--color-shell-surface)] px-3.5 py-3 text-[13px] leading-5 text-[var(--color-sidebar-muted)]">
              当前没有匹配结果，可直接新建。
            </div>
          ) : null}

          {inlineNotice ? (
            <ActionBanner tone="success" density="compact" className="mt-3">
              {inlineNotice}
            </ActionBanner>
          ) : null}
        </div>
      </div>

      {dialogOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(15,23,42,0.16)] backdrop-blur-[3px] px-4 py-8 lg:pl-[var(--dashboard-sidebar-width,0px)]"
          onClick={closeDialog}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="内联新增供应商"
            className={dialogPanelClassName}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 border-b border-[var(--color-border-soft)] bg-[var(--color-shell-surface-soft)] px-5 py-4 sm:px-6">
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-[var(--color-sidebar-muted)]">
                    Supplier
                  </p>
                  <span className="rounded-full border border-[var(--color-border-soft)] bg-[var(--color-shell-surface)] px-2.5 py-1 text-[11px] font-medium text-[var(--color-sidebar-muted)]">
                    创建
                  </span>
                </div>
                <h3 className="text-[1.02rem] font-semibold text-[var(--foreground)]">
                  新建供应商
                </h3>
                <p className="text-[12.5px] leading-5 text-[var(--color-sidebar-muted)]">
                  创建后会自动回填到当前商品。
                </p>
              </div>

              <button
                type="button"
                onClick={closeDialog}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[var(--color-border-soft)] bg-[var(--color-panel)] text-[var(--color-sidebar-muted)] transition-colors hover:bg-[var(--color-shell-hover)] hover:text-[var(--foreground)]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form
              onSubmit={handleQuickCreateSubmit}
              aria-busy={pending}
              className="flex min-h-0 flex-1 flex-col"
            >
              <div className="flex-1 overflow-y-auto px-5 py-4 sm:px-6">
                <fieldset
                  disabled={pending}
                  className={`space-y-4 ${pending ? "opacity-80" : ""}`}
                >
                  <section className={dialogSectionClassName}>
                    <div className="space-y-1">
                      <p className="crm-detail-label text-[11px]">主体信息</p>
                      <h4 className="text-[0.98rem] font-semibold text-[var(--foreground)]">
                        编码与名称
                      </h4>
                    </div>

                    <div className="mt-4 grid gap-4 md:grid-cols-2">
                      <label className="space-y-2">
                        <span className="crm-label">供应商编码</span>
                        <input
                          value={quickCode}
                          onChange={(event) => setQuickCode(event.target.value)}
                          required
                          className="crm-input"
                        />
                      </label>

                      <label className="space-y-2">
                        <span className="crm-label">供应商名称</span>
                        <input
                          value={quickName}
                          onChange={(event) => setQuickName(event.target.value)}
                          required
                          className="crm-input"
                        />
                      </label>
                    </div>
                  </section>

                  <section className={dialogSectionClassName}>
                    <div className="space-y-1">
                      <p className="crm-detail-label text-[11px]">联系补充</p>
                      <h4 className="text-[0.98rem] font-semibold text-[var(--foreground)]">
                        联系人、电话与备注
                      </h4>
                    </div>

                    <div className="mt-4 grid gap-4 md:grid-cols-2">
                      <label className="space-y-2">
                        <span className="crm-label">联系人</span>
                        <input
                          value={quickContactName}
                          onChange={(event) =>
                            setQuickContactName(event.target.value)
                          }
                          className="crm-input"
                        />
                      </label>

                      <label className="space-y-2">
                        <span className="crm-label">联系电话</span>
                        <input
                          value={quickContactPhone}
                          onChange={(event) =>
                            setQuickContactPhone(event.target.value)
                          }
                          className="crm-input"
                        />
                      </label>
                    </div>

                    <label className="mt-4 block space-y-2">
                      <span className="crm-label">备注</span>
                      <textarea
                        value={quickRemark}
                        onChange={(event) => setQuickRemark(event.target.value)}
                        rows={3}
                        className="crm-textarea min-h-[6.5rem]"
                      />
                    </label>
                  </section>
                </fieldset>
              </div>

              <div className="flex flex-col gap-3 border-t border-[var(--color-border-soft)] bg-[var(--color-shell-surface-soft)] px-5 py-4 sm:px-6 md:flex-row md:items-center md:justify-between">
                <div className="min-w-0 flex-1">
                  {dialogError ? (
                    <ActionBanner
                      tone="danger"
                      density="compact"
                      className="max-w-[28rem]"
                    >
                      {dialogError}
                    </ActionBanner>
                  ) : (
                    <p className="text-[13px] leading-5 text-[var(--color-sidebar-muted)]">
                      {dialogFooterHint}
                    </p>
                  )}
                </div>

                <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:justify-end">
                  <button
                    type="button"
                    className="crm-button crm-button-secondary w-full sm:w-auto"
                    onClick={() => {
                      resetQuickSupplierForm();
                      closeDialog();
                    }}
                  >
                    取消
                  </button>
                  <button
                    type="submit"
                    className="crm-button crm-button-primary w-full sm:w-auto"
                    disabled={pending}
                  >
                    {pending ? "保存中..." : "创建供应商"}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
