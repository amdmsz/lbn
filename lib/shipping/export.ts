import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/lib/db/prisma";
import {
  buildShippingExportCsvContent,
  type ShippingExportCsvRow,
} from "@/lib/shipping/export-csv";

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
  rows: ShippingExportCsvRow[];
}) {
  const safeFileName = normalizeFileName(input.fileName, input.exportNo);
  const outputDirectory = path.join(process.cwd(), "public", "exports", "shipping");
  const outputPath = path.join(outputDirectory, safeFileName);
  await mkdir(outputDirectory, { recursive: true });
  await writeFile(outputPath, buildShippingExportCsvContent(input.rows), "utf8");

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
          remarkSnapshot: true,
        },
      },
    },
  });

  if (!batch) {
    throw new Error("报单批次不存在。");
  }

  if (batch.lines.length === 0) {
    throw new Error("当前历史批次尚未回填冻结快照，暂不支持重新生成文件。");
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
      remark: line.remarkSnapshot ?? "",
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
