import type { LeadStatus } from "@prisma/client";
import { StatusBadge } from "@/components/shared/status-badge";
import {
  getLeadStatusLabel,
  getLeadStatusVariant,
} from "@/lib/leads/metadata";

export function LeadStatusBadge({
  status,
}: Readonly<{
  status: LeadStatus;
}>) {
  return (
    <StatusBadge
      label={getLeadStatusLabel(status)}
      variant={getLeadStatusVariant(status)}
    />
  );
}
