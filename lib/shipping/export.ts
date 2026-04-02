import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

type ShippingExportRow = {
  orderNo: string;
  receiverName: string;
  receiverPhone: string;
  receiverAddress: string;
  productName: string;
  qty: number;
  codAmount: string;
  insuranceRequired: boolean;
  insuranceAmount: string;
};

function escapeCsvCell(value: string | number | boolean) {
  const stringValue = String(value ?? "");
  if (/[",\r\n]/.test(stringValue)) {
    return `"${stringValue.replace(/"/g, "\"\"")}"`;
  }

  return stringValue;
}

function normalizeFileName(fileName: string, exportNo: string) {
  const baseName = fileName.trim().replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/-+/g, "-");
  const normalizedBaseName = baseName || `shipping-export-${exportNo}.csv`;
  const withExtension = normalizedBaseName.toLowerCase().endsWith(".csv")
    ? normalizedBaseName
    : `${normalizedBaseName}.csv`;
  return `${exportNo.toLowerCase()}-${withExtension}`;
}

export async function writeShippingExportCsv(input: {
  exportNo: string;
  fileName: string;
  rows: ShippingExportRow[];
}) {
  const safeFileName = normalizeFileName(input.fileName, input.exportNo);
  const outputDirectory = path.join(process.cwd(), "public", "exports", "shipping");
  const outputPath = path.join(outputDirectory, safeFileName);
  const headers = [
    "订单编号",
    "姓名",
    "电话",
    "地址",
    "品名",
    "件数",
    "代收金额",
    "是否保价",
    "保价金额",
  ];

  const lines = [
    headers.map((header) => escapeCsvCell(header)).join(","),
    ...input.rows.map((row) =>
      [
        row.orderNo,
        row.receiverName,
        row.receiverPhone,
        row.receiverAddress,
        row.productName,
        row.qty,
        row.codAmount,
        row.insuranceRequired ? "是" : "否",
        row.insuranceAmount,
      ]
        .map((value) => escapeCsvCell(value))
        .join(","),
    ),
  ];

  await mkdir(outputDirectory, { recursive: true });
  await writeFile(outputPath, `\uFEFF${lines.join("\n")}`, "utf8");

  return {
    fileName: safeFileName,
    fileUrl: `/exports/shipping/${safeFileName}`,
  };
}
