"use client";

import { type FormEvent, useState, useTransition } from "react";

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
  createInlineSupplierAction: (formData: FormData) => Promise<InlineSupplierResult>;
}>) {
  const [supplierOptions, setSupplierOptions] = useState(() => sortSuppliers(suppliers));
  const [selectedSupplierId, setSelectedSupplierId] = useState(initialSelectedSupplierId);
  const [supplierSearch, setSupplierSearch] = useState(() => {
    const initialSupplier =
      suppliers.find((supplier) => supplier.id === initialSelectedSupplierId) ?? null;
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
    supplierOptions.find((supplier) => supplier.id === selectedSupplierId) ?? null;
  const visibleSuppliers =
    selectedSupplier && !filteredSuppliers.some((supplier) => supplier.id === selectedSupplier.id)
      ? [selectedSupplier, ...filteredSuppliers]
      : filteredSuppliers;

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

      const existing = supplierOptions.some((supplier) => supplier.id === createdSupplier.id);
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
        <div className="flex flex-wrap items-end gap-3">
          <label className="min-w-0 flex-1 space-y-2">
            <span className="crm-label">搜索供货商</span>
            <input
              value={supplierSearch}
              onChange={(event) => setSupplierSearch(event.target.value)}
              placeholder="按供货商名称或编码搜索"
              className="crm-input"
              disabled={disabled}
            />
          </label>

          {canQuickCreateSupplier && !disabled ? (
            <button
              type="button"
              className="crm-button crm-button-secondary"
              onClick={() => setDialogOpen(true)}
            >
              新增供货商
            </button>
          ) : null}
        </div>

        <label className="space-y-2">
          <span className="crm-label">供货商</span>
          <select
            name="supplierId"
            required
            className="crm-select"
            value={selectedSupplierId}
            onChange={(event) => {
              const nextSupplierId = event.target.value;
              const nextSupplier =
                supplierOptions.find((supplier) => supplier.id === nextSupplierId) ?? null;
              setSelectedSupplierId(nextSupplierId);
              setSupplierSearch(nextSupplier?.name ?? supplierSearch);
            }}
            disabled={disabled}
          >
            <option value="" disabled>
              请选择供货商
            </option>
            {visibleSuppliers.map((supplier) => (
              <option key={supplier.id} value={supplier.id}>
                {supplier.name} ({supplier.code}){supplier.enabled ? "" : " - 已停用"}
              </option>
            ))}
          </select>
        </label>

        {visibleSuppliers.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-black/10 bg-black/[0.02] px-4 py-3 text-sm text-black/55">
            当前关键词下没有匹配的供货商。可原地新增，并保留当前商品表单已填写内容。
          </div>
        ) : null}

        {inlineNotice ? (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50/80 px-4 py-3 text-sm text-emerald-700">
            {inlineNotice}
          </div>
        ) : null}
      </div>

      {dialogOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/28 px-4 py-8 lg:pl-[var(--dashboard-sidebar-width,0px)]"
          onClick={closeDialog}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="新增供货商"
            className="crm-card flex max-h-[calc(100vh-4rem)] w-full max-w-2xl flex-col overflow-hidden"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="border-b border-black/6 px-5 py-4">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1.5">
                  <h3 className="text-lg font-semibold text-black/84">新增供货商</h3>
                  <p className="text-sm leading-6 text-black/58">
                    无需离开商品表单即可新增供货商。创建成功后会自动回填并选中。
                  </p>
                </div>
                <button
                  type="button"
                  onClick={closeDialog}
                  className="crm-button crm-button-ghost min-h-0 px-3 py-2 text-sm"
                >
                  关闭
                </button>
              </div>
            </div>

            <div className="overflow-y-auto px-5 py-4">
              <form onSubmit={handleQuickCreateSubmit} className="space-y-4">
                <div className="grid gap-4 xl:grid-cols-2">
                  <label className="space-y-2">
                    <span className="crm-label">供货商编码</span>
                    <input
                      value={quickCode}
                      onChange={(event) => setQuickCode(event.target.value)}
                      required
                      className="crm-input"
                    />
                  </label>

                  <label className="space-y-2">
                    <span className="crm-label">供货商名称</span>
                    <input
                      value={quickName}
                      onChange={(event) => setQuickName(event.target.value)}
                      required
                      className="crm-input"
                    />
                  </label>

                  <label className="space-y-2">
                    <span className="crm-label">联系人</span>
                    <input
                      value={quickContactName}
                      onChange={(event) => setQuickContactName(event.target.value)}
                      className="crm-input"
                    />
                  </label>

                  <label className="space-y-2">
                    <span className="crm-label">联系电话</span>
                    <input
                      value={quickContactPhone}
                      onChange={(event) => setQuickContactPhone(event.target.value)}
                      className="crm-input"
                    />
                  </label>
                </div>

                <label className="block space-y-2">
                  <span className="crm-label">备注</span>
                  <textarea
                    value={quickRemark}
                    onChange={(event) => setQuickRemark(event.target.value)}
                    rows={3}
                    className="crm-textarea"
                  />
                </label>

                {dialogError ? (
                  <div className="rounded-2xl border border-rose-200 bg-rose-50/80 px-4 py-3 text-sm text-rose-700">
                    {dialogError}
                  </div>
                ) : null}

                <div className="flex justify-end gap-3">
                  <button
                    type="button"
                    className="crm-button crm-button-secondary"
                    onClick={() => {
                      resetQuickSupplierForm();
                      closeDialog();
                    }}
                  >
                    取消
                  </button>
                  <button type="submit" className="crm-button crm-button-primary" disabled={pending}>
                    {pending ? "保存中..." : "新增供货商"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
