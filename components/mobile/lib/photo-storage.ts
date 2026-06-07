/**
 * 移动端客户头像本地存储 + 文件读取.
 * 从 mobile-app-shell.tsx 抽出 (Phase 1 plan 第 4 个 helper 模块).
 */

const CUSTOMER_PHOTO_STORAGE_PREFIX = "lbncrm.mobile.customer-photo.";

export function getCustomerPhotoStorageKey(customerId: string): string {
  return `${CUSTOMER_PHOTO_STORAGE_PREFIX}${customerId}`;
}

export function readStoredCustomerPhoto(customerId: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(getCustomerPhotoStorageKey(customerId));
  } catch {
    return null;
  }
}

export function writeStoredCustomerPhoto(
  customerId: string,
  dataUrl: string,
): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(getCustomerPhotoStorageKey(customerId), dataUrl);
  } catch {
    // localStorage 满 / 隐私模式不抛
  }
}

export function clearStoredCustomerPhoto(customerId: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(getCustomerPhotoStorageKey(customerId));
  } catch {
    // ignore
  }
}

export function readImageFileAsDataUrl(file: File): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
        return;
      }
      reject(new Error("照片读取失败。"));
    };
    reader.onerror = () => reject(new Error("照片读取失败。"));
    reader.readAsDataURL(file);
  });
}
