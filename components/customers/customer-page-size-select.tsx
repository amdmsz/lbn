"use client";

import { usePathname, useRouter } from "next/navigation";
import { useTransition } from "react";
import { buildCustomersHref } from "@/lib/customers/filter-url";
import type { CustomerPageSize } from "@/lib/customers/metadata";
import type { CustomerCenterData } from "@/lib/customers/queries";
import { cn } from "@/lib/utils";

type CustomerFilters = CustomerCenterData["filters"];

export function CustomerPageSizeSelect({
  filters,
}: Readonly<{
  filters: CustomerFilters;
}>) {
  const pathname = usePathname() || "/customers";
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <select
      aria-label="选择每页客户数量"
      defaultValue={String(filters.pageSize)}
      onChange={(event) => {
        const nextPageSize = Number(event.target.value) as CustomerPageSize;
        const href = buildCustomersHref(
          filters,
          {
            pageSize: nextPageSize,
            page: 1,
          },
          pathname,
        );

        startTransition(() => {
          router.replace(href, { scroll: false });
        });
      }}
      className={cn(
        "min-h-0 h-9 w-[96px] rounded-[12px] border border-[rgba(15,23,42,0.08)] bg-white/96 px-3 text-[13px] text-black/76 outline-none transition focus:border-[rgba(15,23,42,0.14)] focus:ring-2 focus:ring-black/5",
        pending && "opacity-70",
      )}
    >
      <option value="10">10</option>
      <option value="20">20</option>
      <option value="30">30</option>
      <option value="50">50</option>
      <option value="100">100</option>
    </select>
  );
}
