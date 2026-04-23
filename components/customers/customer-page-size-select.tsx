"use client";

import { usePathname, useRouter } from "next/navigation";
import { useTransition } from "react";
import { buildCustomersHref } from "@/lib/customers/filter-url";
import {
  customerPageSizeOptions,
  type CustomerPageSize,
} from "@/lib/customers/metadata";
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
        "crm-select min-h-0 h-9 w-[88px] rounded-[12px] px-3 text-[13px] md:w-[92px]",
        pending && "opacity-70",
      )}
    >
      {customerPageSizeOptions.map((option) => (
        <option key={option} value={String(option)}>
          {option}
        </option>
      ))}
    </select>
  );
}
