"use client";

import {
  buildCustomerRecycleBlockedReasonGroups,
  type CustomerRecycleBlockedReasonSummary,
} from "@/lib/customers/recycle-blocker-explanation";

export function CustomerRecycleBlockedReasonSummary({
  items,
}: Readonly<{
  items: CustomerRecycleBlockedReasonSummary[];
}>) {
  if (items.length === 0) {
    return null;
  }

  const groups = buildCustomerRecycleBlockedReasonGroups(items);

  if (groups.length === 0) {
    return null;
  }

  return (
    <div className="rounded-[0.95rem] border border-[rgba(141,59,51,0.12)] bg-[rgba(255,247,246,0.78)] px-4 py-3.5">
      <div className="space-y-1">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[rgba(141,59,51,0.72)]">
          阻断解释
        </p>
        <p className="text-[13px] leading-5 text-[rgba(84,49,45,0.82)]">
          下面继续使用 customer-adapter 返回的 blocker 分组与建议动作，帮助主管判断这批客户该改走哪条治理链。
        </p>
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        {groups.map((group) => (
          <div
            key={group.key}
            className="rounded-[0.9rem] border border-[rgba(141,59,51,0.1)] bg-white/88 px-3.5 py-3"
          >
            <div className="space-y-1">
              <p className="text-sm font-semibold text-black/82">{group.title}</p>
              <p className="text-[12px] leading-5 text-black/54">{group.description}</p>
            </div>

            <div className="mt-3 space-y-2">
              {group.items.map((item) => (
                <div
                  key={`${group.key}-${item.name}`}
                  className="rounded-[0.8rem] border border-black/8 bg-[rgba(249,250,252,0.78)] px-3 py-2.5"
                >
                  <p className="text-[13px] font-medium text-black/82">
                    {item.name}
                    {typeof item.count === "number" ? ` ${item.count} 位` : ""}
                  </p>
                  <p className="mt-1 text-[12px] leading-5 text-black/58">{item.description}</p>
                  <p className="mt-1 text-[12px] leading-5 text-black/48">
                    建议动作：{item.suggestedAction}
                  </p>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
