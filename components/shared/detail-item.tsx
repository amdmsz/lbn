import type { ReactNode } from "react";

// DetailItem 是 dossier / 详情侧栏的字段单元.
// label/value 走 .crm-detail-label / .crm-detail-value (在 globals.css 内已收敛:
// 12px 普通灰字, 不再 uppercase / tracking-wide caption), 保留类名向后兼容.
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
