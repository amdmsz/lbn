import { Prisma } from "@prisma/client";

const USER_PERMISSION_GRANTS_TABLE = "user_permission_grants";

export function isMissingUserPermissionGrantTableError(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2021" &&
    error.message.includes(USER_PERMISSION_GRANTS_TABLE)
  );
}

export function getUserPermissionGrantMigrationMessage() {
  return "当前数据库尚未创建额外权限表，请先执行 Prisma migration 后再使用账号额外授权。";
}
