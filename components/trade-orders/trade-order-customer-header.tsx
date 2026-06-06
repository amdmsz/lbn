import { MapPin, Phone, UserCheck } from "lucide-react";

type CustomerContext = {
  id: string;
  name: string;
  phone: string;
  address: string | null;
  owner: { id: string; name: string; username: string } | null;
};

export type CustomerHeaderProps = Readonly<{
  customer: CustomerContext;
}>;

function getOwnerLabel(customer: CustomerContext) {
  return customer.owner?.name || customer.owner?.username || "未分配";
}

export default function TradeOrderCustomerHeader({
  customer,
}: CustomerHeaderProps) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-border/55 bg-card px-3.5 py-2.5 text-[13px]">
      <span className="text-sm font-semibold text-foreground">
        {customer.name}
      </span>
      <span className="inline-flex items-center gap-1 tabular-nums text-muted-foreground">
        <Phone className="h-3.5 w-3.5" aria-hidden="true" />
        {customer.phone}
      </span>
      <span className="inline-flex items-center gap-1 text-muted-foreground">
        <UserCheck className="h-3.5 w-3.5" aria-hidden="true" />
        归属 {getOwnerLabel(customer)}
      </span>
      <span className="inline-flex items-center gap-1 text-muted-foreground/80">
        <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
        {customer.address || "客户档案暂未填写地址"}
      </span>
    </div>
  );
}
