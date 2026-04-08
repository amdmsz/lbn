"use client";

type ShippingSelectionToolbarProps = {
  formId: string;
  inputName: string;
  summary: string;
};

function setCheckedState(formId: string, inputName: string, checked: boolean) {
  const form = document.getElementById(formId);

  if (!(form instanceof HTMLFormElement)) {
    return;
  }

  const inputs = form.querySelectorAll<HTMLInputElement>(`input[name="${inputName}"]`);
  for (const input of inputs) {
    input.checked = checked;
  }
}

export function ShippingSelectionToolbar({
  formId,
  inputName,
  summary,
}: Readonly<ShippingSelectionToolbarProps>) {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-black/8 bg-white/76 px-4 py-3 text-sm text-black/62 sm:flex-row sm:items-center sm:justify-between">
      <span>{summary}</span>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          className="font-medium text-[var(--color-info)] hover:underline"
          onClick={() => setCheckedState(formId, inputName, true)}
        >
          全选当前页
        </button>
        <button
          type="button"
          className="font-medium text-black/55 hover:underline"
          onClick={() => setCheckedState(formId, inputName, false)}
        >
          清空当前页
        </button>
      </div>
    </div>
  );
}
