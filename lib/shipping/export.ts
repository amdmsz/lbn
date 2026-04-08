import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/lib/db/prisma";

type ShippingExportRow = {
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
  const prefixPattern = new RegExp(`^${exportNo}-`, "i");
  const fileNameWithoutExportPrefix = fileName.trim().replace(prefixPattern, "");
  const baseName = fileNameWithoutExportPrefix
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-");
  const normalizedBaseName = baseName || `shipping-export-${exportNo}.csv`;
  const withExtension = normalizedBaseName.toLowerCase().endsWith(".csv")
    ? normalizedBaseName
    : `${normalizedBaseName}.csv`;
  return `${exportNo.toLowerCase()}-${withExtension}`;
}

async function writeShippingExportCsvFile(input: {
  exportNo: string;
  fileName: string;
  rows: ShippingExportRow[];
}) {
  const safeFileName = normalizeFileName(input.fileName, input.exportNo);
  const outputDirectory = path.join(process.cwd(), "public", "exports", "shipping");
  const outputPath = path.join(outputDirectory, safeFileName);
  const headers = [
    "姓名",
    "号码",
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

export async function generateShippingExportCsvForBatch(exportBatchId: string) {
  const batch = await prisma.shippingExportBatch.findUnique({
    where: { id: exportBatchId },
    select: {
      id: true,
      exportNo: true,
      fileName: true,
      lines: {
        orderBy: { rowNo: "asc" },
        select: {
          receiverNameSnapshot: true,
          receiverPhoneSnapshot: true,
          receiverAddressSnapshot: true,
          productSummarySnapshot: true,
          pieceCountSnapshot: true,
          codAmountSnapshot: true,
          insuranceRequiredSnapshot: true,
          insuranceAmountSnapshot: true,
        },
      },
    },
  });

  if (!batch) {
    throw new Error("报单批次不存在。");
  }

  if (batch.lines.length === 0) {
    throw new Error("当前历史批次尚未回填冻结快照，暂不支持重生成文件。");
  }

  const exportedFile = await writeShippingExportCsvFile({
    exportNo: batch.exportNo,
    fileName: batch.fileName,
    rows: batch.lines.map((line) => ({
      receiverName: line.receiverNameSnapshot,
      receiverPhone: line.receiverPhoneSnapshot,
      receiverAddress: line.receiverAddressSnapshot,
      productName: line.productSummarySnapshot,
      qty: line.pieceCountSnapshot,
      codAmount: line.codAmountSnapshot.toString(),
      insuranceRequired: line.insuranceRequiredSnapshot,
      insuranceAmount: line.insuranceAmountSnapshot.toString(),
    })),
  });

  return {
    exportBatchId: batch.id,
    exportNo: batch.exportNo,
    fileName: exportedFile.fileName,
    fileUrl: exportedFile.fileUrl,
    lineCount: batch.lines.length,
  };
}
