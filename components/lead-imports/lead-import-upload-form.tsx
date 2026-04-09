"use client";

import {
  useActionState,
  useEffect,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";
import { useRouter } from "next/navigation";
import { useFormStatus } from "react-dom";
import type { LeadSource } from "@prisma/client";
import {
  createLeadImportBatchAction,
  type CreateLeadImportBatchActionState,
} from "@/app/(dashboard)/lead-imports/actions";
import { LeadImportBatchProgressCard } from "@/components/lead-imports/lead-import-batch-progress-card";
import { ActionBanner } from "@/components/shared/action-banner";
import { StatusBadge } from "@/components/shared/status-badge";
import {
  buildCustomerContinuationTagLookupSet,
  getCustomerContinuationOutcomeBadges,
  hasMatchingImportedTag,
  isCustomerContinuationSignalOnlyTagValue,
  splitCustomerContinuationValues,
  type CustomerContinuationOutcomeBadge,
} from "@/lib/lead-imports/customer-continuation-signals";
import {
  parseLeadImportFile,
  type ParsedLeadImportFile,
} from "@/lib/lead-imports/file-parser";
import {
  DEFAULT_LEAD_IMPORT_SOURCE,
  LEAD_IMPORT_PREVIEW_ROW_COUNT,
  buildFixedCustomerContinuationImportMapping,
  buildFixedLeadImportMapping,
  normalizeImportedPhone,
  type LeadImportMode,
  type LeadImportMappingConfig,
} from "@/lib/lead-imports/metadata";

type SourceOption = {
  value: LeadSource;
  label: string;
};

type PreviewSummary = {
  totalRows: number;
  fileDuplicateRows: number;
  validPhoneRows: number;
  invalidPhoneRows: number;
};

type PreviewWarningItem = {
  value: string;
  count: number;
};

type PreviewWarnings = {
  unresolvedOwners: PreviewWarningItem[];
  unresolvedTags: PreviewWarningItem[];
};

type CustomerContinuationLookups = {
  ownerUsernames: string[];
  tagLookupValues: string[];
};

type CustomerContinuationLookupSets = {
  ownerLookup: Set<string>;
  tagLookup: ReadonlySet<string>;
};

type PreviewRow = {
  rowNumber: number;
  name: string;
  phone: string;
  normalizedPhone: string;
  ownerUsername: string;
  tags: string;
  expectedOutcomes: CustomerContinuationOutcomeBadge[];
  unresolvedOwner: boolean;
  unresolvedTags: string[];
  rawData: Record<string, string>;
};

function SubmitButton({ disabled }: Readonly<{ disabled: boolean }>) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      className="crm-button crm-button-primary"
      disabled={disabled || pending}
    >
      {pending ? "正在提交批次..." : "开始导入"}
    </button>
  );
}

function normalizeOwnerLookupValue(value: string) {
  return value.trim().toLowerCase();
}

function sortPreviewWarnings(items: Map<string, number>) {
  return [...items.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((left, right) => right.count - left.count || left.value.localeCompare(right.value));
}

function buildCustomerContinuationLookupSets(
  lookups: CustomerContinuationLookups | null | undefined,
) {
  if (!lookups) {
    return null;
  }

  return {
    ownerLookup: new Set(
      lookups.ownerUsernames.map((value) => normalizeOwnerLookupValue(value)).filter(Boolean),
    ),
    tagLookup: buildCustomerContinuationTagLookupSet(lookups.tagLookupValues),
  } satisfies CustomerContinuationLookupSets;
}

function buildCustomerContinuationPreviewMeta(
  rawData: Record<string, string>,
  mapping: Record<string, string | undefined>,
  lookupSets: CustomerContinuationLookupSets | null,
) {
  const ownerUsername = mapping.ownerUsername ? rawData[mapping.ownerUsername] ?? "" : "";
  const tags = mapping.tags ? rawData[mapping.tags] ?? "" : "";
  const tagValues = splitCustomerContinuationValues(tags);
  const expectedOutcomes = getCustomerContinuationOutcomeBadges({
    tags: tagValues,
    summary: {
      latestFollowUpResult: mapping.latestFollowUpResult
        ? rawData[mapping.latestFollowUpResult] ?? ""
        : "",
      latestIntent: mapping.latestIntent ? rawData[mapping.latestIntent] ?? "" : "",
      note: mapping.note ? rawData[mapping.note] ?? "" : "",
    },
  });

  if (!lookupSets) {
    return {
      ownerUsername,
      tags,
      expectedOutcomes,
      unresolvedOwner: false,
      unresolvedTags: [] as string[],
    };
  }

  const unresolvedOwner =
    Boolean(ownerUsername.trim()) &&
    !lookupSets.ownerLookup.has(normalizeOwnerLookupValue(ownerUsername));
  const unresolvedTags = tagValues.filter(
    (value) =>
      !isCustomerContinuationSignalOnlyTagValue(value) &&
      !hasMatchingImportedTag(value, lookupSets.tagLookup),
  );

  return {
    ownerUsername,
    tags,
    expectedOutcomes,
    unresolvedOwner,
    unresolvedTags,
  };
}

function buildPreviewWarnings(
  rows: ParsedLeadImportFile["rows"],
  mapping: LeadImportMappingConfig,
  mode: LeadImportMode,
  lookups: CustomerContinuationLookups | null | undefined,
) {
  if (mode !== "customer_continuation" || !lookups) {
    return null;
  }

  const runtimeMapping = mapping as Record<string, string | undefined>;
  const lookupSets = buildCustomerContinuationLookupSets(lookups);
  const unresolvedOwnerMap = new Map<string, number>();
  const unresolvedTagMap = new Map<string, number>();

  for (const row of rows) {
    const previewMeta = buildCustomerContinuationPreviewMeta(
      row.rawData,
      runtimeMapping,
      lookupSets,
    );

    if (previewMeta.unresolvedOwner) {
      unresolvedOwnerMap.set(
        previewMeta.ownerUsername,
        (unresolvedOwnerMap.get(previewMeta.ownerUsername) ?? 0) + 1,
      );
    }

    for (const unresolvedTag of previewMeta.unresolvedTags) {
      unresolvedTagMap.set(
        unresolvedTag,
        (unresolvedTagMap.get(unresolvedTag) ?? 0) + 1,
      );
    }
  }

  return {
    unresolvedOwners: sortPreviewWarnings(unresolvedOwnerMap),
    unresolvedTags: sortPreviewWarnings(unresolvedTagMap),
  } satisfies PreviewWarnings;
}

function buildPreviewRows(
  rows: ParsedLeadImportFile["rows"],
  mapping: LeadImportMappingConfig,
  mode: LeadImportMode,
  lookups: CustomerContinuationLookups | null | undefined,
) {
  const runtimeMapping = mapping as Record<string, string | undefined>;
  const lookupSets = buildCustomerContinuationLookupSets(lookups);

  return rows.slice(0, LEAD_IMPORT_PREVIEW_ROW_COUNT).map((row) => {
    const continuationPreview =
      mode === "customer_continuation"
        ? buildCustomerContinuationPreviewMeta(row.rawData, runtimeMapping, lookupSets)
        : null;

    return {
      rowNumber: row.rowNumber,
      name: mapping.name ? row.rawData[mapping.name] ?? "" : "",
      phone: mapping.phone ? row.rawData[mapping.phone] ?? "" : "",
      normalizedPhone:
        mapping.phone && row.rawData[mapping.phone]
          ? normalizeImportedPhone(row.rawData[mapping.phone] ?? "")
          : "",
      ownerUsername: continuationPreview?.ownerUsername ?? "",
      tags: continuationPreview?.tags ?? "",
      expectedOutcomes: continuationPreview?.expectedOutcomes ?? [],
      unresolvedOwner: continuationPreview?.unresolvedOwner ?? false,
      unresolvedTags: continuationPreview?.unresolvedTags ?? [],
      rawData: row.rawData,
    };
  });
}

export function LeadImportUploadForm({
  sourceOptions,
  mode,
  customerContinuationLookups,
}: Readonly<{
  sourceOptions: readonly SourceOption[];
  mode: LeadImportMode;
  customerContinuationLookups?: CustomerContinuationLookups | null;
}>) {
  const router = useRouter();
  const initialActionState: CreateLeadImportBatchActionState = {
    status: "idle",
    message: "",
    batch: null,
  };
  const [actionState, formAction] = useActionState(
    createLeadImportBatchAction,
    initialActionState,
  );
  const [defaultLeadSource, setDefaultLeadSource] = useState<LeadSource>(
    sourceOptions[0]?.value ?? DEFAULT_LEAD_IMPORT_SOURCE,
  );
  const [mapping, setMapping] = useState<LeadImportMappingConfig>({});
  const [parsedFile, setParsedFile] = useState<ParsedLeadImportFile | null>(null);
  const [previewSummary, setPreviewSummary] = useState<PreviewSummary | null>(null);
  const [previewRows, setPreviewRows] = useState<PreviewRow[]>([]);
  const [previewWarnings, setPreviewWarnings] = useState<PreviewWarnings | null>(null);
  const [parseError, setParseError] = useState("");
  const [formError, setFormError] = useState("");
  const [isParsing, setIsParsing] = useState(false);
  const [missingHeaders, setMissingHeaders] = useState<string[]>([]);
  const [queuedBatch, setQueuedBatch] = useState(actionState.batch);

  useEffect(() => {
    if (actionState.status === "success" && actionState.batch) {
      setQueuedBatch(actionState.batch);
      router.refresh();
    }
  }, [actionState, router]);

  function resetParsedState() {
    setParsedFile(null);
    setMapping({});
    setPreviewRows([]);
    setPreviewSummary(null);
    setPreviewWarnings(null);
    setMissingHeaders([]);
  }

  function updatePreview(
    nextParsedFile: ParsedLeadImportFile,
    nextMapping: LeadImportMappingConfig,
  ) {
    const nextPreviewRows = buildPreviewRows(
      nextParsedFile.rows,
      nextMapping,
      mode,
      customerContinuationLookups,
    );
    const nextPreviewWarnings = buildPreviewWarnings(
      nextParsedFile.rows,
      nextMapping,
      mode,
      customerContinuationLookups,
    );
    const seenPhones = new Set<string>();
    let validPhoneRows = 0;
    let invalidPhoneRows = 0;
    let fileDuplicateRows = 0;

    for (const row of nextParsedFile.rows) {
      const mappedPhone = nextMapping.phone ? row.rawData[nextMapping.phone] ?? "" : "";
      const normalizedPhone = mappedPhone.trim() ? normalizeImportedPhone(mappedPhone) : "";

      if (!mappedPhone.trim() || !normalizedPhone) {
        invalidPhoneRows += 1;
        continue;
      }

      validPhoneRows += 1;

      if (seenPhones.has(normalizedPhone)) {
        fileDuplicateRows += 1;
        continue;
      }

      seenPhones.add(normalizedPhone);
    }

    setPreviewRows(nextPreviewRows);
    setPreviewWarnings(nextPreviewWarnings);
    setPreviewSummary({
      totalRows: nextParsedFile.rows.length,
      fileDuplicateRows,
      validPhoneRows,
      invalidPhoneRows,
    });
  }

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    setParseError("");
    setFormError("");

    if (!file) {
      resetParsedState();
      return;
    }

    setIsParsing(true);

    try {
      const nextParsedFile = await parseLeadImportFile(file);
      const nextMappingResult =
        mode === "customer_continuation"
          ? buildFixedCustomerContinuationImportMapping(nextParsedFile.headers)
          : buildFixedLeadImportMapping(nextParsedFile.headers);

      if (nextMappingResult.missingHeaders.length > 0) {
        resetParsedState();
        setMissingHeaders(nextMappingResult.missingHeaders);
        setParseError(
          `缺少固定模板列：${nextMappingResult.missingHeaders.join(" / ")}。请先补齐模板列。`,
        );
        return;
      }

      setParsedFile(nextParsedFile);
      setMapping(nextMappingResult.mapping as LeadImportMappingConfig);
      setMissingHeaders([]);
      updatePreview(nextParsedFile, nextMappingResult.mapping as LeadImportMappingConfig);
    } catch (error) {
      resetParsedState();
      setParseError(error instanceof Error ? error.message : "文件解析失败，请重新上传。");
    } finally {
      setIsParsing(false);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    if (!parsedFile) {
      event.preventDefault();
      setFormError("请先上传并解析文件。");
      return;
    }

    if (missingHeaders.length > 0) {
      event.preventDefault();
      setFormError(`缺少固定模板列：${missingHeaders.join(" / ")}`);
      return;
    }

    const hasRequiredMapping =
      mode === "customer_continuation"
        ? Boolean(mapping.phone)
        : Boolean(mapping.phone && mapping.name && mapping.address);

    if (!hasRequiredMapping) {
      event.preventDefault();
      setFormError(
        mode === "customer_continuation"
          ? "客户续接模板至少需要映射手机号列。"
          : "固定模板必须包含手机号、姓名、地址三列。",
      );
      return;
    }

    setFormError("");
  }

  const canSubmit =
    Boolean(parsedFile) &&
    Boolean(mapping.phone) &&
    (mode === "customer_continuation" || Boolean(mapping.name && mapping.address)) &&
    !isParsing;

  return (
    <div className="space-y-4">
      {actionState.status === "success" && actionState.message ? (
        <ActionBanner tone="success">{actionState.message}</ActionBanner>
      ) : null}
      {actionState.status === "error" && actionState.message ? (
        <ActionBanner tone="danger">{actionState.message}</ActionBanner>
      ) : null}

      {queuedBatch ? (
        <LeadImportBatchProgressCard
          batchId={queuedBatch.batchId}
          mode={queuedBatch.mode}
          detailHref={queuedBatch.detailHref}
          initialProgress={queuedBatch.progress}
          title="批次进度"
          description="文件已经进入后台队列，页面会自动刷新处理进度。你可以继续留在导入中心观察，也可以进入详情页查看行结果。"
        />
      ) : null}

      <form action={formAction} onSubmit={handleSubmit} className="space-y-4">
        <input type="hidden" name="importMode" value={mode} />
        <input
          type="hidden"
          name="defaultLeadSource"
          value={mode === "customer_continuation" ? DEFAULT_LEAD_IMPORT_SOURCE : defaultLeadSource}
        />
        <input type="hidden" name="mappingConfig" value={JSON.stringify(mapping)} />

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_220px]">
          <label className="space-y-1.5">
            <span className="crm-label">导入文件</span>
            <input
              type="file"
              name="file"
              accept=".csv,.xls,.xlsx"
              className="crm-input pt-3"
              onChange={handleFileChange}
              required
            />
            <p className="text-sm text-black/55">
              {mode === "customer_continuation"
                ? "固定模板至少需要手机号列；标签列可直接填写 A/B/C/D、跟进客户（未接通/拒接）、拒绝添加、无效客户（空号/停机）。"
                : "固定模板必填列为手机号、姓名、地址，其余列可以留空。"}
            </p>
          </label>

          {mode === "customer_continuation" ? (
            <div className="space-y-1.5 rounded-[1rem] border border-black/8 bg-[rgba(248,250,252,0.78)] px-4 py-3">
              <span className="crm-label">续接导入规则</span>
              <p className="text-sm leading-6 text-black/60">
                命中已有客户时默认只补齐空字段并保留原负责人；A/B/C/D 会承接为已加微信，跟进客户会承接为挂断待回访，拒绝添加和无效客户会写入对应通话结果。
              </p>
            </div>
          ) : (
            <label className="space-y-1.5">
              <span className="crm-label">导入来源</span>
              <select
                value={defaultLeadSource}
                onChange={(event) => setDefaultLeadSource(event.target.value as LeadSource)}
                className="crm-select"
              >
                {sourceOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <p className="text-sm text-black/55">
                导入中心当前统一收口到固定来源，后续承接和审计会沿用这一来源信息。
              </p>
            </label>
          )}
        </div>

        {parseError ? <ActionBanner tone="danger">{parseError}</ActionBanner> : null}
        {formError ? <ActionBanner tone="danger">{formError}</ActionBanner> : null}

        {isParsing ? (
          <div className="crm-card-muted p-4">
            <div className="crm-loading-block h-6 w-40" />
            <div className="mt-3 crm-loading-block h-20 w-full" />
          </div>
        ) : null}

        {parsedFile && previewSummary ? (
          <>
            <div className="grid gap-3.5 md:grid-cols-4">
              <div className="crm-section-card">
                <p className="text-xs uppercase tracking-[0.18em] text-black/45">总行数</p>
                <p className="mt-2.5 text-[1.8rem] font-semibold text-black/85">
                  {previewSummary.totalRows}
                </p>
              </div>
              <div className="crm-section-card">
                <p className="text-xs uppercase tracking-[0.18em] text-black/45">有效手机号</p>
                <p className="mt-2.5 text-[1.8rem] font-semibold text-[var(--color-success)]">
                  {previewSummary.validPhoneRows}
                </p>
              </div>
              <div className="crm-section-card">
                <p className="text-xs uppercase tracking-[0.18em] text-black/45">手机号异常</p>
                <p className="mt-2.5 text-[1.8rem] font-semibold text-[var(--color-danger)]">
                  {previewSummary.invalidPhoneRows}
                </p>
              </div>
              <div className="crm-section-card">
                <p className="text-xs uppercase tracking-[0.18em] text-black/45">文件内重复</p>
                <p className="mt-2.5 text-[1.8rem] font-semibold text-[var(--color-warning)]">
                  {previewSummary.fileDuplicateRows}
                </p>
              </div>
            </div>

            {mode === "customer_continuation" &&
            previewWarnings &&
            (previewWarnings.unresolvedOwners.length > 0 ||
              previewWarnings.unresolvedTags.length > 0) ? (
              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-[1rem] border border-[rgba(155,106,29,0.24)] bg-[rgba(155,106,29,0.08)] px-4 py-3.5">
                  <p className="text-sm font-semibold text-[var(--color-warning)]">
                    负责人预警
                  </p>
                  <p className="mt-1 text-sm leading-6 text-black/62">
                    这些账号不会阻塞导入，但不会自动命中负责人。
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {previewWarnings.unresolvedOwners.length > 0 ? (
                      previewWarnings.unresolvedOwners.slice(0, 6).map((item) => (
                        <span
                          key={`owner-${item.value}`}
                          className="rounded-full border border-[rgba(155,106,29,0.18)] bg-white/75 px-3 py-1 text-xs text-[var(--color-warning)]"
                        >
                          {item.value} x {item.count}
                        </span>
                      ))
                    ) : (
                      <span className="text-sm text-black/55">未发现未识别负责人。</span>
                    )}
                  </div>
                </div>

                <div className="rounded-[1rem] border border-[rgba(155,106,29,0.24)] bg-[rgba(155,106,29,0.08)] px-4 py-3.5">
                  <p className="text-sm font-semibold text-[var(--color-warning)]">标签预警</p>
                  <p className="mt-1 text-sm leading-6 text-black/62">
                    未识别业务标签会进入 warning；跟进客户、拒绝添加、无效客户这类信号词不会误报。
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {previewWarnings.unresolvedTags.length > 0 ? (
                      previewWarnings.unresolvedTags.slice(0, 6).map((item) => (
                        <span
                          key={`tag-${item.value}`}
                          className="rounded-full border border-[rgba(155,106,29,0.18)] bg-white/75 px-3 py-1 text-xs text-[var(--color-warning)]"
                        >
                          {item.value} x {item.count}
                        </span>
                      ))
                    ) : (
                      <span className="text-sm text-black/55">未发现未识别标签。</span>
                    )}
                  </div>
                </div>
              </div>
            ) : null}

            <div className="crm-table-shell">
              <table className="crm-table">
                <thead>
                  <tr>
                    <th>行号</th>
                    <th>姓名</th>
                    <th>原始手机号</th>
                    <th>标准化手机号</th>
                    {mode === "customer_continuation" ? <th>负责人 / 标签</th> : null}
                    {mode === "customer_continuation" ? <th>预计承接结果</th> : null}
                    <th>预览</th>
                  </tr>
                </thead>
                <tbody>
                  {previewRows.map((row) => (
                    <tr key={row.rowNumber}>
                      <td>{row.rowNumber}</td>
                      <td>{row.name || "-"}</td>
                      <td>{row.phone || "-"}</td>
                      <td>
                        <span
                          className={
                            row.normalizedPhone
                              ? "text-[var(--color-success)]"
                              : "text-[var(--color-danger)]"
                          }
                        >
                          {row.normalizedPhone || "无效手机号"}
                        </span>
                      </td>
                      {mode === "customer_continuation" ? (
                        <td>
                          <div className="space-y-1 text-sm text-black/60">
                            <p
                              className={
                                row.unresolvedOwner
                                  ? "font-medium text-[var(--color-warning)]"
                                  : undefined
                              }
                            >
                              {row.ownerUsername || "未填写负责人"}
                            </p>
                            <p
                              className={
                                row.unresolvedTags.length > 0
                                  ? "font-medium text-[var(--color-warning)]"
                                  : undefined
                              }
                            >
                              {row.tags || "未填写标签"}
                            </p>
                          </div>
                        </td>
                      ) : null}
                      {mode === "customer_continuation" ? (
                        <td>
                          <div className="flex max-w-[16rem] flex-wrap gap-2">
                            {row.expectedOutcomes.length > 0 ? (
                              row.expectedOutcomes.map((item) => (
                                <StatusBadge
                                  key={`${row.rowNumber}-${item.key}`}
                                  label={item.label}
                                  variant={item.variant}
                                />
                              ))
                            ) : (
                              <span className="text-sm text-black/45">未命中自动承接规则</span>
                            )}
                          </div>
                        </td>
                      ) : null}
                      <td className="max-w-xl">
                        <div className="flex flex-wrap gap-2">
                          {Object.entries(row.rawData)
                            .slice(0, mode === "customer_continuation" ? 5 : 4)
                            .map(([key, value]) => (
                              <span
                                key={`${row.rowNumber}-${key}`}
                                className="rounded-full border border-black/8 bg-black/4 px-3 py-1 text-xs text-black/60"
                              >
                                {key}: {value || "-"}
                              </span>
                            ))}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-black/8 pt-2">
          <p className="text-sm text-black/58">
            {mode === "customer_continuation"
              ? "重复手机号会在批次内直接剔除；未识别负责人和标签会进入 warning，不阻塞客户导入。提交后文件会进入队列并由后台 Worker 分批处理。"
              : "重复手机号会直接剔除，但仍会保留批次行结果和去重日志。提交后文件会进入队列并由后台 Worker 分批处理。"}
          </p>
          <SubmitButton disabled={!canSubmit} />
        </div>
      </form>
    </div>
  );
}
