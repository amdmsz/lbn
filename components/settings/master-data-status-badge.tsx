import { StatusBadge } from "@/components/shared/status-badge";
import { getStatusBadgeConfig } from "@/lib/master-data/metadata";

export function MasterDataStatusBadge({
  isActive,
}: Readonly<{
  isActive: boolean;
}>) {
  const config = getStatusBadgeConfig(isActive);
  return <StatusBadge label={config.label} variant={config.variant} />;
}
