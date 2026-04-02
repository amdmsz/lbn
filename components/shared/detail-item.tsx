export function DetailItem({
  label,
  value,
}: Readonly<{
  label: string;
  value: string;
}>) {
  return (
    <div className="crm-detail-item space-y-1.5">
      <p className="crm-detail-label">{label}</p>
      <p className="crm-detail-value">{value}</p>
    </div>
  );
}
