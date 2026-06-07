import Link from "next/link";
import { StatusBadge, type StatusBadgeVariant } from "@/components/shared/status-badge";
import { formatDateTime, getCustomerStatusLabel } from "@/lib/customers/metadata";
import { cn } from "@/lib/utils";

const READ_ONLY_TITLE = "此字段由系统维护，无法在档案页直接编辑";
const READ_ONLY_CLASS =
  "crm-input flex items-center cursor-not-allowed border-[var(--color-border-soft)] bg-[var(--color-shell-surface-soft)] text-sm text-[var(--color-sidebar-muted)]";
const FIELD_LABEL_CLASS =
  "text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground";

const STATUS_OPTIONS = [
  { value: "ACTIVE", label: getCustomerStatusLabel("ACTIVE") },
  { value: "DORMANT", label: getCustomerStatusLabel("DORMANT") },
  { value: "LOST", label: getCustomerStatusLabel("LOST") },
  { value: "BLACKLISTED", label: getCustomerStatusLabel("BLACKLISTED") },
] as const;

export type CustomerProfileEditShell = Readonly<{
  id: string;
  name: string;
  phone: string;
  wechatId: string | null;
  status: "ACTIVE" | "DORMANT" | "LOST" | "BLACKLISTED";
  province: string | null;
  city: string | null;
  district: string | null;
  address: string | null;
  remark: string | null;
  updatedAt: Date;
}>;

export function CustomerProfileEditForm({
  shell,
  archiveHref,
  executionClassLabel,
  executionClassDescription,
  executionClassVariant,
  action,
}: Readonly<{
  shell: CustomerProfileEditShell;
  archiveHref: string;
  executionClassLabel: string;
  executionClassDescription: string;
  executionClassVariant: StatusBadgeVariant;
  action: (formData: FormData) => Promise<void>;
}>) {
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="customerId" value={shell.id} />
      <input type="hidden" name="redirectTo" value={archiveHref} />

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <label className="space-y-1.5">
          <span className={FIELD_LABEL_CLASS}>姓名</span>
          <input
            name="name"
            required
            maxLength={100}
            defaultValue={shell.name}
            className="crm-input"
          />
        </label>

        <div className="space-y-1.5">
          <span className={FIELD_LABEL_CLASS}>手机号</span>
          <div title={READ_ONLY_TITLE} aria-disabled="true" className={READ_ONLY_CLASS}>
            {shell.phone}
          </div>
        </div>

        <label className="space-y-1.5">
          <span className={FIELD_LABEL_CLASS}>微信号</span>
          <input
            name="wechatId"
            maxLength={100}
            defaultValue={shell.wechatId ?? ""}
            className="crm-input"
          />
        </label>

        <label className="space-y-1.5">
          <span className={FIELD_LABEL_CLASS}>客户状态</span>
          <select name="status" defaultValue={shell.status} className="crm-select">
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <div className="space-y-1.5">
          <span className={FIELD_LABEL_CLASS}>正式分类</span>
          <div
            title="正式分类由通话 / 加微 / 邀约 / 成交信号自动映射，不可手动编辑"
            aria-disabled="true"
            className={cn(READ_ONLY_CLASS, "justify-between gap-3")}
          >
            <StatusBadge label={executionClassLabel} variant={executionClassVariant} />
            <span className="text-right text-[11px] leading-4 text-muted-foreground">
              {executionClassDescription}
            </span>
          </div>
        </div>

        <label className="space-y-1.5">
          <span className={FIELD_LABEL_CLASS}>省份</span>
          <input
            name="province"
            maxLength={50}
            defaultValue={shell.province ?? ""}
            className="crm-input"
          />
        </label>

        <label className="space-y-1.5">
          <span className={FIELD_LABEL_CLASS}>城市</span>
          <input
            name="city"
            maxLength={50}
            defaultValue={shell.city ?? ""}
            className="crm-input"
          />
        </label>

        <label className="space-y-1.5">
          <span className={FIELD_LABEL_CLASS}>区县</span>
          <input
            name="district"
            maxLength={50}
            defaultValue={shell.district ?? ""}
            className="crm-input"
          />
        </label>

        <div className="space-y-1.5">
          <span className={FIELD_LABEL_CLASS}>最近更新</span>
          <div title={READ_ONLY_TITLE} aria-disabled="true" className={READ_ONLY_CLASS}>
            {formatDateTime(shell.updatedAt)}
          </div>
        </div>

        <label className="space-y-1.5 md:col-span-2 xl:col-span-3">
          <span className={FIELD_LABEL_CLASS}>地址</span>
          <input
            name="address"
            maxLength={500}
            defaultValue={shell.address ?? ""}
            className="crm-input"
          />
        </label>

        <label className="space-y-1.5 md:col-span-2 xl:col-span-3">
          <span className={FIELD_LABEL_CLASS}>备注</span>
          <textarea
            name="remark"
            rows={4}
            maxLength={1000}
            defaultValue={shell.remark ?? ""}
            className="crm-textarea min-h-[7rem]"
          />
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-2 pt-1">
        <button
          type="submit"
          className="crm-button crm-button-primary min-h-0 px-3.5 py-2 text-sm"
        >
          保存资料
        </button>
        <Link
          href={archiveHref}
          scroll={false}
          className="crm-button crm-button-secondary min-h-0 px-3.5 py-2 text-sm"
        >
          取消
        </Link>
      </div>
    </form>
  );
}
