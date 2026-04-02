"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { LeadSource } from "@prisma/client";
import { createLeadImportBatchAction } from "@/app/(dashboard)/lead-imports/actions";
import {
  buildLeadImportPreviewRows,
  parseLeadImportFile,
  type ParsedLeadImportFile,
} from "@/lib/lead-imports/file-parser";
import {
  buildFixedLeadImportMapping,
  normalizeImportedPhone,
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

function SubmitButton({ disabled }: Readonly<{ disabled: boolean }>) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      className="crm-button crm-button-primary"
      disabled={disabled || pending}
    >
      {pending ? "正在导入..." : "开始导入"}
    </button>
  );
}

export function LeadImportUploadForm({
  sourceOptions,
}: Readonly<{
  sourceOptions: readonly SourceOption[];
}>) {
  const [defaultLeadSource, setDefaultLeadSource] = useState<LeadSource>(
    sourceOptions[0]?.value ?? LeadSource.INFO_FLOW,
  );
  const [mapping, setMapping] = useState<LeadImportMappingConfig>({});
  const [parsedFile, setParsedFile] = useState<ParsedLeadImportFile | null>(null);
  const [previewSummary, setPreviewSummary] = useState<PreviewSummary | null>(null);
  const [previewRows, setPreviewRows] = useState<
    Array<{
      rowNumber: number;
      name: string;
      phone: string;
      normalizedPhone: string;
      rawData: Record<string, string>;
    }>
  >([]);
  const [parseError, setParseError] = useState("");
  const [formError, setFormError] = useState("");
  const [isParsing, setIsParsing] = useState(false);
  const [missingHeaders, setMissingHeaders] = useState<string[]>([]);

  function resetParsedState() {
    setParsedFile(null);
    setMapping({});
    setPreviewRows([]);
    setPreviewSummary(null);
    setMissingHeaders([]);
  }

  function updatePreview(
    nextParsedFile: ParsedLeadImportFile,
    nextMapping: LeadImportMappingConfig,
  ) {
    const nextPreviewRows = buildLeadImportPreviewRows(nextParsedFile.rows, nextMapping);
    const seenPhones = new Set<string>();
    let validPhoneRows = 0;
    let invalidPhoneRows = 0;
    let fileDuplicateRows = 0;

    for (const row of nextParsedFile.rows) {
      const mappedPhone = nextMapping.phone ? row.rawData[nextMapping.phone] ?? "" : "";
      const normalizedPhone = mappedPhone.trim()
        ? normalizeImportedPhone(mappedPhone)
        : "";

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
    setPreviewSummary({
      totalRows: nextParsedFile.rows.length,
      fileDuplicateRows,
      validPhoneRows,
      invalidPhoneRows,
    });
  }

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
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
      const nextMappingResult = buildFixedLeadImportMapping(nextParsedFile.headers);

      if (nextMappingResult.missingHeaders.length > 0) {
        resetParsedState();
        setMissingHeaders(nextMappingResult.missingHeaders);
        setParseError(
          `缺少必填列：${nextMappingResult.missingHeaders.join(" / ")}。其他列可以留空，但这三列必须存在。`,
        );
        return;
      }

      setParsedFile(nextParsedFile);
      setMapping(nextMappingResult.mapping);
      setMissingHeaders([]);
      updatePreview(nextParsedFile, nextMappingResult.mapping);
    } catch (error) {
      resetParsedState();
      setParseError(error instanceof Error ? error.message : "文件解析失败，请重新上传。");
    } finally {
      setIsParsing(false);
    }
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    if (!parsedFile) {
      event.preventDefault();
      setFormError("请先上传并解析文件。");
      return;
    }

    if (missingHeaders.length > 0) {
      event.preventDefault();
      setFormError(`缺少必填列：${missingHeaders.join(" / ")}`);
      return;
    }

    if (!mapping.phone || !mapping.name || !mapping.address) {
      event.preventDefault();
      setFormError("固定模板必须包含手机号、姓名、地址三列。");
      return;
    }

    setFormError("");
  }

  return (
    <form action={createLeadImportBatchAction} onSubmit={handleSubmit} className="space-y-4">
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
            固定模板必填列只有：手机号、姓名、地址。其余列可以省略或留空。
          </p>
        </label>

        <label className="space-y-1.5">
          <span className="crm-label">导入来源</span>
          <select
            name="defaultLeadSource"
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
          <p className="text-sm text-black/55">导入中心来源已统一收口为“信息流”。</p>
        </label>
      </div>

      <input type="hidden" name="mappingConfig" value={JSON.stringify(mapping)} />

      {parseError ? <div className="crm-banner crm-banner-danger">{parseError}</div> : null}
      {formError ? <div className="crm-banner crm-banner-danger">{formError}</div> : null}

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

          <div className="crm-table-shell">
            <table className="crm-table">
              <thead>
                <tr>
                  <th>行号</th>
                  <th>姓名</th>
                  <th>原始手机号</th>
                  <th>标准化手机号</th>
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
                    <td className="max-w-xl">
                      <div className="flex flex-wrap gap-2">
                        {Object.entries(row.rawData)
                          .slice(0, 4)
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
          重复手机号会直接剔除，但仍保留批次行结果和去重日志。
        </p>
        <SubmitButton
          disabled={
            !parsedFile || !mapping.phone || !mapping.name || !mapping.address || isParsing
          }
        />
      </div>
    </form>
  );
}
