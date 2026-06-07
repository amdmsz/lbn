import type { ReactNode } from "react";

export function DetailItem({
  label,
  value,
}: Readonly<{
  label: string;
  value: ReactNode;
}>) {
  return (
    <div className="crm-detail-item space-y-1.5">
      <p className="crm-detail-label">{label}</p>
      <div className="crm-detail-value">{value}</div>
    </div>
  );
}
