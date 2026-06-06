import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const leadImportRuntimeRoot = path.join(process.cwd(), "runtime", "imports", "lead-imports");

function sanitizeFileName(fileName: string) {
  const trimmed = fileName.trim();
  const normalized = trimmed || "import-file";
  return normalized.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_");
}

export function getLeadImportRuntimeRoot() {
  return leadImportRuntimeRoot;
}

export async function ensureLeadImportRuntimeRoot() {
  await mkdir(leadImportRuntimeRoot, { recursive: true });
  return leadImportRuntimeRoot;
}

export async function saveLeadImportSourceFile(input: {
  batchId: string;
  file: File;
}) {
  const batchDir = path.join(await ensureLeadImportRuntimeRoot(), input.batchId);
  await mkdir(batchDir, { recursive: true });

  const filePath = path.join(batchDir, sanitizeFileName(input.file.name));
  const bytes = new Uint8Array(await input.file.arrayBuffer());
  await writeFile(filePath, bytes);

  return filePath;
}

export async function readLeadImportSourceFile(filePath: string) {
  return readFile(filePath);
}

/**
 * F07 修复: 用于 batch 创建失败后清理"孤儿源文件".
 * 当 batchId 已写文件但 db 那边 batch 没建成时, 调用此函数清掉本 batch 的整个
 * 目录 (含 metadata/extracted file). 容错: 文件不存在不抛错, 任何 OS 错误吞掉
 * 让上游 throw 原始 error.
 */
export async function deleteLeadImportSourceFile(input: { batchId: string }) {
  const batchDir = path.join(leadImportRuntimeRoot, input.batchId);
  try {
    await rm(batchDir, { recursive: true, force: true });
  } catch {
    // 文件清理失败不应阻断主流程
  }
}
