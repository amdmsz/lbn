import { EmptyState } from "@/components/shared/empty-state";
import { TagPill } from "@/components/shared/tag-pill";
import {
  assignCustomerTagAction,
  removeCustomerTagAction,
} from "@/lib/master-data/actions";
import { cn } from "@/lib/utils";

type AssignedTag = {
  id: string;
  tagId: string;
  tag: {
    id: string;
    name: string;
    color: string | null;
    code: string;
  };
};

type AvailableTag = {
  id: string;
  name: string;
  code: string;
  color: string | null;
  label: string;
};

export function CustomerTagsPanel({
  customerId,
  redirectTo,
  tags,
  availableTags,
  canManage,
  variant = "default",
  className,
}: Readonly<{
  customerId: string;
  redirectTo: string;
  tags: AssignedTag[];
  availableTags: AvailableTag[];
  canManage: boolean;
  variant?: "default" | "embedded" | "compact";
  className?: string;
}>) {
  const assignedTagIds = new Set(tags.map((item) => item.tagId));
  const selectableTags = availableTags.filter((tag) => !assignedTagIds.has(tag.id));
  const isEmbedded = variant === "embedded";
  const isCompact = variant === "compact";

  return (
    <section
      className={cn(
        isCompact
          ? "rounded-[1rem] border border-black/6 bg-[rgba(248,249,250,0.78)] px-4 py-4"
          : isEmbedded
            ? "rounded-[1.1rem] border border-black/7 bg-[rgba(255,255,255,0.82)] px-4 py-4 shadow-[0_10px_24px_rgba(18,24,31,0.04)]"
            : "crm-card p-6",
        className,
      )}
    >
      <div
        className={cn(
          "flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between",
          isCompact ? "lg:gap-4" : null,
        )}
      >
        <div className="space-y-1.5">
          <p className="crm-detail-label text-black/38">客户标签</p>
          <h2
            className={cn(
              "font-semibold text-black/85",
              isCompact ? "text-[0.95rem]" : isEmbedded ? "text-base" : "text-lg",
            )}
          >
            标签与画像补充
          </h2>
          <p className="text-[13px] leading-6 text-black/56">
            {isCompact
              ? "把标签收成轻量辅助块，保留筛选和画像补充能力。"
              : "标签继续承接客户画像补充与筛选能力，但在详情页里收成更轻的经营侧块。"}
          </p>
        </div>

        {canManage ? (
          <form
            action={assignCustomerTagAction}
            className={cn(
              "flex w-full flex-col gap-2.5",
              isCompact
                ? "max-w-none xl:max-w-[24rem]"
                : isEmbedded
                  ? "max-w-none"
                  : "max-w-xl sm:flex-row",
            )}
          >
            <input type="hidden" name="customerId" value={customerId} />
            <input type="hidden" name="redirectTo" value={redirectTo} />
            <select
              name="tagId"
              className="crm-select"
              defaultValue=""
              required
              disabled={selectableTags.length === 0}
            >
              <option value="" disabled>
                {selectableTags.length === 0 ? "暂无可添加标签" : "选择现有标签"}
              </option>
              {selectableTags.map((tag) => (
                <option key={tag.id} value={tag.id}>
                  {tag.label}
                </option>
              ))}
            </select>
            <button
              type="submit"
              className={cn(
                "crm-button",
                isCompact || isEmbedded ? "crm-button-secondary" : "crm-button-primary",
              )}
              disabled={selectableTags.length === 0}
            >
              添加标签
            </button>
          </form>
        ) : null}
      </div>

      {tags.length > 0 ? (
        <div
          className={cn(
            "mt-4 flex flex-wrap gap-2.5",
            isCompact ? "gap-2" : isEmbedded ? "" : "mt-5 gap-3",
          )}
        >
          {tags.map((item) => (
            <div
              key={item.id}
              className={cn(
                "flex items-center gap-2 border border-black/7 bg-white/74",
                isCompact
                  ? "rounded-full px-2.5 py-1"
                  : isEmbedded
                    ? "rounded-full px-2.5 py-1.5 pr-2"
                    : "rounded-2xl px-3 py-2",
              )}
            >
              <TagPill label={item.tag.name} color={item.tag.color} className="shadow-none" />
              {canManage ? (
                <form action={removeCustomerTagAction}>
                  <input type="hidden" name="customerId" value={customerId} />
                  <input type="hidden" name="tagId" value={item.tagId} />
                  <input type="hidden" name="redirectTo" value={redirectTo} />
                  <button
                    type="submit"
                    className="text-[11px] font-medium text-black/46 transition hover:text-black/72"
                  >
                    移除
                  </button>
                </form>
              ) : null}
            </div>
          ))}
        </div>
      ) : isCompact || isEmbedded ? (
        <div className="mt-4 rounded-[0.95rem] border border-dashed border-black/7 bg-[rgba(247,248,250,0.66)] px-4 py-4 text-sm leading-6 text-black/52">
          当前客户还没有业务标签，可由有权限的角色从现有标签池中补充。
        </div>
      ) : (
        <EmptyState
          className="mt-5"
          title="暂无客户标签"
          description="当前客户还没有业务标签，可由有权限的角色从现有标签池中添加。"
        />
      )}
    </section>
  );
}
