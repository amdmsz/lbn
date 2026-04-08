import { access } from "node:fs/promises";
import path from "node:path";

export type ShippingExportFileState = "READY" | "MISSING" | "LEGACY" | "PENDING";

export type ShippingExportFileStatus = {
  state: ShippingExportFileState;
  fileExists: boolean;
  canDownload: boolean;
  canRegenerate: boolean;
};

function resolveShippingExportDiskPath(fileUrl: string | null) {
  if (!fileUrl?.trim()) {
    return null;
  }

  const normalizedUrl = fileUrl.trim();

  if (!normalizedUrl.startsWith("/exports/shipping/")) {
    return null;
  }

  return path.join(process.cwd(), "public", normalizedUrl.replace(/^\//, ""));
}

async function checkShippingExportFileExists(fileUrl: string | null) {
  const diskPath = resolveShippingExportDiskPath(fileUrl);

  if (!diskPath) {
    return false;
  }

  try {
    await access(diskPath);
    return true;
  } catch {
    return false;
  }
}

export async function resolveShippingExportFileStatus(input: {
  fileUrl: string | null;
  lineCount: number;
}): Promise<ShippingExportFileStatus> {
  if (input.lineCount <= 0) {
    return {
      state: "LEGACY",
      fileExists: false,
      canDownload: false,
      canRegenerate: false,
    };
  }

  if (!input.fileUrl) {
    return {
      state: "PENDING",
      fileExists: false,
      canDownload: false,
      canRegenerate: true,
    };
  }

  const fileExists = await checkShippingExportFileExists(input.fileUrl);

  if (fileExists) {
    return {
      state: "READY",
      fileExists: true,
      canDownload: true,
      canRegenerate: true,
    };
  }

  return {
    state: "MISSING",
    fileExists: false,
    canDownload: false,
    canRegenerate: true,
  };
}
