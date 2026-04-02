import type { CustomerStatus } from "@prisma/client";
import { StatusBadge } from "@/components/shared/status-badge";
import {
  getCustomerStatusLabel,
  getCustomerStatusVariant,
} from "@/lib/customers/metadata";

export function CustomerStatusBadge({
  status,
}: Readonly<{
  status: CustomerStatus;
}>) {
  return (
    <StatusBadge
      label={getCustomerStatusLabel(status)}
      variant={getCustomerStatusVariant(status)}
    />
  );
}
