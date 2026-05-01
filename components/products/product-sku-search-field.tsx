"use client";

import type { ReactNode } from "react";
import { useDeferredValue, useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  LoaderCircle,
  PackageSearch,
  Search,
  X,
} from "lucide-react";
import type { SerializedVisibleSkuOption } from "@/lib/sales-orders/queries";
import { cn } from "@/lib/utils";

type ProductSkuSearchFieldProps = {
  label: string;
  placeholder: string;
  value: string;
  selectedOption: SerializedVisibleSkuOption | null;
  onSelect: (option: SerializedVisibleSkuOption | null) => void;
  helper?: ReactNode;
  disabled?: boolean;
  noQueryHint?: string;
  emptyMessage?: string;
};

type SearchResponse = {
  items: SerializedVisibleSkuOption[];
};

function buildSelectedLabel(option: SerializedVisibleSkuOption) {
  return `${option.product.name} / ${option.skuName}`;
}

function formatPrice(value: string | number) {
  const amount = Number(value);

  if (!Number.isFinite(amount)) {
    return String(value);
  }

  return new Intl.NumberFormat("zh-CN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function ProductSkuSearchField({
  label,
  placeholder,
  value,
  selectedOption,
  onSelect,
  helper,
  disabled,
  noQueryHint = "输入商品名、商品编码、规格名或供应商后远程搜索。",
  emptyMessage = "没有匹配的 SKU。",
}: Readonly<ProductSkuSearchFieldProps>) {
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query.trim());
  const [results, setResults] = useState<SerializedVisibleSkuOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!deferredQuery || disabled) {
      setResults([]);
      setLoading(false);
      setError("");
      return;
    }

    let cancelled = false;

    async function run() {
      try {
        setLoading(true);
        setError("");
        const response = await fetch(
          `/api/order-options/sku-search?q=${encodeURIComponent(deferredQuery)}`,
          {
            method: "GET",
            credentials: "same-origin",
          },
        );

        if (!response.ok) {
          throw new Error("SKU 搜索失败，请稍后重试。");
        }

        const payload = (await response.json()) as SearchResponse;
        if (!cancelled) {
          setResults(payload.items);
        }
      } catch (requestError) {
        if (!cancelled) {
          setResults([]);
          setError(
            requestError instanceof Error
              ? requestError.message
              : "SKU 搜索失败，请稍后重试。",
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void run();

    return () => {
      cancelled = true;
    };
  }, [deferredQuery, disabled]);

  const groupedResults = useMemo(() => {
    const groups = new Map<
      string,
      {
        key: string;
        productName: string;
        supplierName: string;
        items: SerializedVisibleSkuOption[];
      }
    >();

    for (const item of results) {
      const key = item.product.id;
      const group = groups.get(key);
      if (group) {
        group.items.push(item);
        continue;
      }

      groups.set(key, {
        key,
        productName: item.product.name,
        supplierName: item.product.supplier.name,
        items: [item],
      });
    }

    return Array.from(groups.values());
  }, [results]);

  return (
    <div className="space-y-2">
      <label className="block">
        <span className="crm-label">{label}</span>
        <div
          className={cn(
            "group flex min-h-10 items-center gap-2 rounded-[0.92rem] border border-[var(--color-border-soft)] bg-[var(--crm-subtle-bg)] px-3 transition-[border-color,background-color,box-shadow]",
            "focus-within:border-primary/30 focus-within:bg-white/90 focus-within:shadow-[0_0_0_3px_rgba(37,99,235,0.08)]",
            disabled && "cursor-not-allowed opacity-65",
          )}
        >
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={selectedOption ? buildSelectedLabel(selectedOption) : placeholder}
            className="min-h-10 min-w-0 flex-1 border-0 bg-transparent text-[13px] text-foreground outline-none placeholder:text-muted-foreground/55 disabled:cursor-not-allowed"
            disabled={disabled}
          />
          {loading ? (
            <LoaderCircle
              className="h-4 w-4 shrink-0 animate-spin text-muted-foreground"
              aria-hidden="true"
            />
          ) : null}
        </div>
      </label>

      {selectedOption ? (
        <div className="rounded-2xl border border-primary/15 bg-primary/5 px-3 py-2.5 text-sm text-foreground">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                <div className="truncate font-semibold">
                  {selectedOption.product.name} / {selectedOption.skuName}
                </div>
              </div>
              <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[12px] text-muted-foreground">
                <span>{selectedOption.product.supplier.name}</span>
                <span>默认售价 ¥{formatPrice(selectedOption.defaultUnitPrice)}</span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                setQuery("");
                onSelect(null);
              }}
              className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-background hover:text-foreground"
              aria-label="清空已选 SKU"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      ) : null}

      {!selectedOption && !deferredQuery ? (
        <div className="flex items-center gap-2 text-[12px] leading-5 text-muted-foreground">
          <PackageSearch className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>{noQueryHint}</span>
        </div>
      ) : null}

      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-3 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      {!loading && !error && deferredQuery && groupedResults.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border/70 bg-muted/20 px-3 py-3 text-sm text-muted-foreground">
          {emptyMessage}
        </div>
      ) : null}

      {!error && deferredQuery && groupedResults.length > 0 ? (
        <div className="overflow-hidden rounded-2xl border border-border/60 bg-card shadow-sm">
          {groupedResults.map((group) => (
            <div key={group.key} className="border-b border-border/45 last:border-b-0">
              <div className="flex items-center justify-between gap-3 bg-muted/20 px-3 py-2">
                <div className="min-w-0">
                  <div className="truncate text-[12px] font-semibold text-foreground">
                    {group.productName}
                  </div>
                  <div className="mt-0.5 text-[11px] text-muted-foreground">
                    {group.supplierName}
                  </div>
                </div>
                <span className="shrink-0 rounded-full border border-border/60 bg-card px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                  {group.items.length} SKU
                </span>
              </div>
              <div className="divide-y divide-border/35">
                {group.items.map((item) => {
                  const active = value === item.id;

                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        setQuery("");
                        setResults([]);
                        onSelect(item);
                      }}
                      className={cn(
                        "flex w-full items-start justify-between gap-3 px-3 py-2.5 text-left transition hover:bg-muted/25",
                        active && "bg-primary/5",
                      )}
                    >
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-foreground">
                          {item.skuName}
                        </div>
                        <div className="mt-1 text-[12px] text-muted-foreground">
                          默认售价 ¥{formatPrice(item.defaultUnitPrice)}
                        </div>
                      </div>
                      {active ? (
                        <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-primary/15 bg-primary/8 px-2 py-0.5 text-[11px] font-medium text-primary">
                          <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                          已选
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {helper ? <div>{helper}</div> : null}
    </div>
  );
}
