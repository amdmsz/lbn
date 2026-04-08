"use server";

import { randomUUID } from "crypto";
import { promises as fs } from "fs";
import path from "path";
import { OperationModule, OperationTargetType } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";

const avatarDirectory = path.join(process.cwd(), "public", "uploads", "avatars");
const maxAvatarSize = 2 * 1024 * 1024;
const allowedAvatarTypes = new Map<string, string>([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
]);

export type SelfAvatarActionResult = {
  status: "success" | "error";
  message: string;
  avatarPath: string | null;
};

async function getAuthenticatedUser() {
  const session = await auth();

  if (!session?.user) {
    throw new Error("当前未登录。");
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      name: true,
      username: true,
      avatarPath: true,
    },
  });

  if (!user) {
    throw new Error("当前账号不存在或已失效。");
  }

  return user;
}

function isManagedAvatarPath(value: string | null | undefined) {
  return Boolean(value && value.startsWith("/uploads/avatars/"));
}

async function deleteManagedAvatarFile(avatarPath: string | null | undefined) {
  if (!isManagedAvatarPath(avatarPath)) {
    return;
  }

  if (typeof avatarPath !== "string") {
    return;
  }

  const managedAvatarPath = avatarPath;
  const absolutePath = path.join(
    avatarDirectory,
    path.basename(managedAvatarPath),
  );

  try {
    await fs.unlink(absolutePath);
  } catch {
    // Ignore missing or already-removed files.
  }
}

function getAvatarFileExtension(file: File) {
  const fromMime = allowedAvatarTypes.get(file.type);

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

function revalidateShellPaths() {
  revalidatePath("/", "layout");
  revalidatePath("/dashboard");
  revalidatePath("/customers");
  revalidatePath("/fulfillment");
  revalidatePath("/settings");
}

export async function updateOwnAvatarAction(
  formData: FormData,
): Promise<SelfAvatarActionResult> {
  try {
    const user = await getAuthenticatedUser();
    const file = formData.get("avatar");

    if (!(file instanceof File) || file.size === 0) {
      return {
        status: "error",
        message: "请选择头像图片。",
        avatarPath: user.avatarPath ?? null,
      };
    }

    if (file.size > maxAvatarSize) {
      return {
        status: "error",
        message: "头像图片需小于 2MB。",
        avatarPath: user.avatarPath ?? null,
      };
    }

    const extension = getAvatarFileExtension(file);

    if (!extension) {
      return {
        status: "error",
        message: "仅支持 JPG、PNG 或 WEBP 图片。",
        avatarPath: user.avatarPath ?? null,
      };
    }

    await fs.mkdir(avatarDirectory, { recursive: true });

    const fileName = `${user.id}-${randomUUID()}.${extension}`;
    const avatarPath = `/uploads/avatars/${fileName}`;
    const buffer = Buffer.from(await file.arrayBuffer());

    await fs.writeFile(path.join(avatarDirectory, fileName), buffer);

    await prisma.user.update({
      where: { id: user.id },
      data: { avatarPath },
    });

    await prisma.operationLog.create({
      data: {
        actorId: user.id,
        module: OperationModule.USER,
        action: "UPDATE_SELF_AVATAR",
        targetType: OperationTargetType.USER,
        targetId: user.id,
        description: `更新个人头像：${user.name} (@${user.username})`,
      },
    });

    await deleteManagedAvatarFile(user.avatarPath);
    revalidateShellPaths();

    return {
      status: "success",
      message: "头像已更新。",
      avatarPath,
    };
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : "头像更新失败，请稍后重试。",
      avatarPath: null,
    };
  }
}

export async function removeOwnAvatarAction(): Promise<SelfAvatarActionResult> {
  try {
    const user = await getAuthenticatedUser();

    await prisma.user.update({
      where: { id: user.id },
      data: { avatarPath: null },
    });

    await prisma.operationLog.create({
      data: {
        actorId: user.id,
        module: OperationModule.USER,
        action: "REMOVE_SELF_AVATAR",
        targetType: OperationTargetType.USER,
        targetId: user.id,
        description: `移除个人头像：${user.name} (@${user.username})`,
      },
    });

    await deleteManagedAvatarFile(user.avatarPath);
    revalidateShellPaths();

    return {
      status: "success",
      message: "头像已移除。",
      avatarPath: null,
    };
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : "头像移除失败，请稍后重试。",
      avatarPath: null,
    };
  }
}
