import { mkdir, readFile, writeFile } from "node:fs/promises";
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
