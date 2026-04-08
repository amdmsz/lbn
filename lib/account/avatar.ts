import path from "path";

export function resolveAvatarSrc(avatarPath: string | null | undefined) {
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

  if (avatarPath.startsWith("/api/account/avatar/")) {
    return avatarPath;
  }

  if (avatarPath.startsWith("/uploads/avatars/")) {
    return `/api/account/avatar/${path.basename(avatarPath)}`;
  }

  return avatarPath;
}
