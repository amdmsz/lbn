const PRODUCT_IMAGE_UPLOAD_PREFIX = "/uploads/products/";

function getBasename(value: string) {
  const normalized = value.replace(/\\/g, "/");
  const segments = normalized.split("/");
  return segments[segments.length - 1] ?? "";
}

export function isManagedProductMainImagePath(value: string | null | undefined) {
  return Boolean(value && value.startsWith(PRODUCT_IMAGE_UPLOAD_PREFIX));
}

export function resolveProductMainImageSrc(mainImagePath: string | null | undefined) {
  if (!mainImagePath) {
    return null;
  }

  if (
    mainImagePath.startsWith("http://") ||
    mainImagePath.startsWith("https://") ||
    mainImagePath.startsWith("data:")
  ) {
    return mainImagePath;
  }

  if (mainImagePath.startsWith("/api/products/image/")) {
    return mainImagePath;
  }

  if (mainImagePath.startsWith(PRODUCT_IMAGE_UPLOAD_PREFIX)) {
    return `/api/products/image/${getBasename(mainImagePath)}`;
  }

  return mainImagePath;
}

export function buildProductImageGlyph(label: string | null | undefined) {
  const normalized = (label ?? "").replace(/\s+/g, "").trim();

  if (!normalized) {
    return "SP";
  }

  return normalized.slice(0, 2).toUpperCase();
}

export { PRODUCT_IMAGE_UPLOAD_PREFIX };
