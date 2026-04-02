import * as XLSX from "xlsx";
import {
  LEAD_IMPORT_PREVIEW_ROW_COUNT,
  type LeadImportMappingConfig,
  normalizeImportedPhone,
} from "@/lib/lead-imports/metadata";

export type ParsedLeadImportRow = {
  rowNumber: number;
  rawData: Record<string, string>;
};

export type ParsedLeadImportFile = {
  fileType: "CSV" | "XLS" | "XLSX";
  headers: string[];
  rows: ParsedLeadImportRow[];
};

function detectFileType(fileName: string) {
  const extension = fileName.split(".").pop()?.toLowerCase();

  if (extension === "csv") {
    return "CSV";
  }

  if (extension === "xls") {
    return "XLS";
  }

  if (extension === "xlsx") {
    return "XLSX";
  }

  throw new Error("仅支持上传 CSV、XLS 或 XLSX 文件。");
}

export function parseLeadImportBuffer(
  buffer: ArrayBuffer,
  fileName: string,
): ParsedLeadImportFile {
  const fileType = detectFileType(fileName);
  const workbook = XLSX.read(buffer, { type: "array" });
  const worksheetName = workbook.SheetNames[0];

  if (!worksheetName) {
    throw new Error("上传文件中没有可读取的工作表。");
  }

  const worksheet = workbook.Sheets[worksheetName];
  const matrix = XLSX.utils.sheet_to_json<(string | number | boolean | null)[]>(worksheet, {
    header: 1,
    defval: "",
    blankrows: false,
  });

  const [headerRow, ...dataRows] = matrix;
  const headers = (headerRow ?? [])
    .map((value) => String(value ?? "").trim())
    .filter(Boolean);

  if (headers.length === 0) {
    throw new Error("未读取到表头，请确认第一行是字段名称。");
  }

  const rows: ParsedLeadImportRow[] = dataRows
    .map((row, index) => {
      const rawData = headers.reduce<Record<string, string>>((accumulator, header, cellIndex) => {
        accumulator[header] = String(row[cellIndex] ?? "").trim();
        return accumulator;
      }, {});

      return {
        rowNumber: index + 2,
        rawData,
      };
    })
    .filter((row) =>
      Object.values(row.rawData).some((value) => value.trim().length > 0),
    );

  if (rows.length === 0) {
    throw new Error("文件中没有可导入的数据行。");
  }

  return {
    fileType,
    headers,
    rows,
  };
}

export async function parseLeadImportFile(file: File) {
  const buffer = await file.arrayBuffer();
  return parseLeadImportBuffer(buffer, file.name);
}

export function buildLeadImportPreviewRows(
  rows: ParsedLeadImportRow[],
  mapping: LeadImportMappingConfig,
) {
  return rows.slice(0, LEAD_IMPORT_PREVIEW_ROW_COUNT).map((row) => ({
    rowNumber: row.rowNumber,
    name: mapping.name ? row.rawData[mapping.name] ?? "" : "",
    phone: mapping.phone ? row.rawData[mapping.phone] ?? "" : "",
    normalizedPhone:
      mapping.phone && row.rawData[mapping.phone]
        ? normalizeImportedPhone(row.rawData[mapping.phone] ?? "")
        : "",
    rawData: row.rawData,
  }));
}
