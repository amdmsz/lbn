"use client";

import type { ReactNode } from "react";
import { useDeferredValue, useEffect, useMemo, useState } from "react";
import type { SerializedVisibleSkuOption } from "@/lib/sales-orders/queries";

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
      <label className="space-y-2">
        <span className="crm-label">{label}</span>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={selectedOption ? buildSelectedLabel(selectedOption) : placeholder}
          className="crm-input"
          disabled={disabled}
        />
      </label>

      {selectedOption ? (
        <div className="rounded-2xl border border-black/8 bg-white/78 px-3 py-2.5 text-sm text-black/70">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="truncate font-medium text-black/84">
                {selectedOption.product.name} / {selectedOption.skuName}
              </div>
              <div className="mt-1 text-xs text-black/50">
                {selectedOption.product.supplier.name} / 默认售价 {selectedOption.defaultUnitPrice}
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                setQuery("");
                onSelect(null);
              }}
              className="shrink-0 text-xs font-medium text-black/52 transition hover:text-black/72"
            >
              清空
            </button>
          </div>
        </div>
      ) : null}

      {!selectedOption && !deferredQuery ? (
        <div className="text-xs leading-6 text-black/50">{noQueryHint}</div>
      ) : null}

      {loading ? (
        <div className="rounded-2xl border border-dashed border-black/10 bg-white/55 px-3 py-3 text-sm text-black/55">
          正在搜索 SKU...
        </div>
      ) : null}

      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-3 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      {!loading && !error && deferredQuery && groupedResults.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-black/10 bg-white/55 px-3 py-3 text-sm text-black/55">
          {emptyMessage}
        </div>
      ) : null}

      {!loading && !error && deferredQuery && groupedResults.length > 0 ? (
        <div className="space-y-2">
          {groupedResults.map((group) => (
            <div
              key={group.key}
              className="rounded-2xl border border-black/8 bg-white/80 px-3 py-3"
            >
              <div className="text-xs font-medium text-black/54">
                {group.supplierName} / {group.productName}
              </div>
              <div className="mt-2 space-y-1.5">
                {group.items.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setQuery("");
                      setResults([]);
                      onSelect(item);
                    }}
                    className="flex w-full items-start justify-between gap-3 rounded-xl border border-black/8 bg-[rgba(247,248,250,0.8)] px-3 py-2 text-left transition hover:border-black/14 hover:bg-white"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-black/84">
                        {item.skuName}
                      </div>
                      <div className="mt-1 text-xs text-black/50">
                        默认售价 {item.defaultUnitPrice}
                      </div>
                    </div>
                    {value === item.id ? (
                      <span className="shrink-0 text-xs font-medium text-[var(--color-accent)]">
                        已选
                      </span>
                    ) : null}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {helper ? <div>{helper}</div> : null}
    </div>
  );
}
