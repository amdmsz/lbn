import "server-only";

import { randomUUID } from "crypto";
import { promises as fs } from "fs";
import path from "path";
import { PRODUCT_IMAGE_UPLOAD_PREFIX, isManagedProductMainImagePath } from "@/lib/products/image";

const productImageDirectory = path.join(process.cwd(), "public", "uploads", "products");
const maxProductImageSize = 4 * 1024 * 1024;
const allowedProductImageTypes = new Map<string, string>([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
]);

export type ProductMainImagePlan = {
  previousMainImagePath: string | null;
  nextMainImagePath: string | null;
  uploadedMainImagePath: string | null;
};

function getProductImageFileExtension(file: File) {
  const fromMime = allowedProductImageTypes.get(file.type);

  if (fromMime) {
    return fromMime;
  }

  const filename = file.name.toLowerCase();

  if (filename.endsWith(".jpg") || filename.endsWith(".jpeg")) {
    return "jpg";
  }

  if (filename.endsWith(".png")) {
    return "png";
  }

  if (filename.endsWith(".webp")) {
    return "webp";
  }

  return null;
}

export async function saveUploadedProductMainImage(file: File) {
  if (!(file instanceof File) || file.size === 0) {
    return null;
  }

  if (file.size > maxProductImageSize) {
    throw new Error("主图文件需小于 4MB。");
  }

  const extension = getProductImageFileExtension(file);

  if (!extension) {
    throw new Error("主图仅支持 JPG、PNG 或 WEBP。");
  }

  await fs.mkdir(productImageDirectory, { recursive: true });

  const fileName = `${randomUUID()}.${extension}`;
  const relativePath = `${PRODUCT_IMAGE_UPLOAD_PREFIX}${fileName}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  await fs.writeFile(path.join(productImageDirectory, fileName), buffer);

  return relativePath;
}

export async function deleteManagedProductMainImage(
  mainImagePath: string | null | undefined,
) {
  if (!isManagedProductMainImagePath(mainImagePath) || typeof mainImagePath !== "string") {
    return;
  }

  const absolutePath = path.join(productImageDirectory, path.basename(mainImagePath));

  try {
    await fs.unlink(absolutePath);
  } catch {
    // Ignore already-removed files.
  }
}

export async function rollbackProductMainImagePlan(plan: ProductMainImagePlan) {
  if (!plan.uploadedMainImagePath) {
    return;
  }

  await deleteManagedProductMainImage(plan.uploadedMainImagePath);
}

export async function commitProductMainImagePlan(plan: ProductMainImagePlan) {
  if (
    !plan.previousMainImagePath ||
    plan.previousMainImagePath === plan.nextMainImagePath
  ) {
    return;
  }

  await deleteManagedProductMainImage(plan.previousMainImagePath);
}
