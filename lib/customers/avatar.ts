const customerAvatarUploadPrefix = "/uploads/customer-avatars/";
const customerAvatarApiPrefix = "/api/mobile/customers/avatar/";

function getPathBasename(value: string) {
  const normalized = value.split("?")[0]?.split("#")[0]?.replace(/\\/g, "/") ?? "";
  return normalized.split("/").filter(Boolean).pop() ?? "";
}

export function isManagedCustomerAvatarPath(value: string | null | undefined) {
  return Boolean(value && value.startsWith(customerAvatarUploadPrefix));
}

export function getCustomerAvatarFilename(value: string | null | undefined) {
  if (!value) {
    return "";
  }

  return getPathBasename(value);
}

export function resolveCustomerAvatarSrc(avatarPath: string | null | undefined) {
  if (!avatarPath) {
    return null;
  }

  if (
    avatarPath.startsWith("http://") ||
    avatarPath.startsWith("https://") ||
    avatarPath.startsWith("data:")
  ) {
    return avatarPath;
  }

  if (avatarPath.startsWith(customerAvatarApiPrefix)) {
    return avatarPath;
  }

  if (isManagedCustomerAvatarPath(avatarPath)) {
    const filename = getCustomerAvatarFilename(avatarPath);
    return filename ? `${customerAvatarApiPrefix}${filename}` : null;
  }

  return avatarPath;
}

export const CUSTOMER_AVATAR_UPLOAD_PREFIX = customerAvatarUploadPrefix;
