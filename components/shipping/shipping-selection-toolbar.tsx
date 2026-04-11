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
    <div className="flex flex-col gap-3 rounded-[0.95rem] border border-black/7 bg-[rgba(247,248,250,0.78)] px-4 py-3 text-sm text-black/62 md:flex-row md:items-center md:justify-between">
      <div className="space-y-1">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-black/40">
          Bulk Selection
        </p>
        <p>{summary}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="inline-flex min-h-0 items-center rounded-full border border-[rgba(20,118,92,0.16)] bg-[rgba(240,251,247,0.92)] px-3 py-1.5 text-sm font-medium text-[var(--color-success)] transition hover:border-[rgba(20,118,92,0.26)] hover:bg-white"
          onClick={() => setCheckedState(formId, inputName, true)}
        >
          全选当前页
        </button>
        <button
          type="button"
          className="inline-flex min-h-0 items-center rounded-full border border-black/8 bg-white/88 px-3 py-1.5 text-sm font-medium text-black/58 transition hover:border-black/14 hover:text-black/72"
          onClick={() => setCheckedState(formId, inputName, false)}
        >
          清空当前页
        </button>
      </div>
    </div>
  );
}
