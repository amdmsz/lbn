import { EmptyState } from "@/components/shared/empty-state";
import { TagPill } from "@/components/shared/tag-pill";
import { assignLeadTagAction, removeLeadTagAction } from "@/lib/master-data/actions";

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

export function LeadTagsPanel({
  leadId,
  redirectTo,
  tags,
  availableTags,
  canManage,
}: Readonly<{
  leadId: string;
  redirectTo: string;
  tags: AssignedTag[];
  availableTags: AvailableTag[];
  canManage: boolean;
}>) {
  const assignedTagIds = new Set(tags.map((item) => item.tagId));
  const selectableTags = availableTags.filter((tag) => !assignedTagIds.has(tag.id));

  return (
    <section className="crm-card p-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-black/85">线索标签</h2>
          <p className="mt-2 text-sm leading-6 text-black/60">
            标签用于快速标记线索特征，可在列表中直接筛选高意向、风险或直播信号。
          </p>
        </div>

        {canManage ? (
          <form
            action={assignLeadTagAction}
            className="flex w-full max-w-xl flex-col gap-3 sm:flex-row"
          >
            <input type="hidden" name="leadId" value={leadId} />
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
              className="crm-button crm-button-primary"
              disabled={selectableTags.length === 0}
            >
              添加标签
            </button>
          </form>
        ) : null}
      </div>

      {tags.length > 0 ? (
        <div className="mt-5 flex flex-wrap gap-3">
          {tags.map((item) => (
            <div
              key={item.id}
              className="flex items-center gap-2 rounded-2xl border border-black/8 bg-white/70 px-3 py-2"
            >
              <TagPill label={item.tag.name} color={item.tag.color} />
              {canManage ? (
                <form action={removeLeadTagAction}>
                  <input type="hidden" name="leadId" value={leadId} />
                  <input type="hidden" name="tagId" value={item.tagId} />
                  <input type="hidden" name="redirectTo" value={redirectTo} />
                  <button
                    type="submit"
                    className="crm-button crm-button-ghost min-h-0 px-2 py-1 text-xs"
                  >
                    移除
                  </button>
                </form>
              ) : null}
            </div>
          ))}
        </div>
      ) : (
        <EmptyState
          className="mt-5"
          title="暂无线索标签"
          description="当前线索还没有业务标签，可由有权限的角色从现有标签池中添加。"
        />
      )}
    </section>
  );
}
