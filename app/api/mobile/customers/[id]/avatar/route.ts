import { randomUUID } from "crypto";
import { promises as fs } from "fs";
import path from "path";
import { OperationModule, OperationTargetType } from "@prisma/client";
import { NextResponse } from "next/server";
import { canAccessMobileApp, getCustomerScope } from "@/lib/auth/access";
import { auth } from "@/lib/auth/session";
import {
  CUSTOMER_AVATAR_UPLOAD_PREFIX,
  isManagedCustomerAvatarPath,
  resolveCustomerAvatarSrc,
} from "@/lib/customers/avatar";
import { prisma } from "@/lib/db/prisma";

const noStoreHeaders = { "Cache-Control": "no-store" };
const avatarDirectory = path.join(
  process.cwd(),
  "public",
  "uploads",
  "customer-avatars",
);
const maxAvatarSize = 2 * 1024 * 1024;
const allowedAvatarTypes = new Map<string, string>([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
]);

export const runtime = "nodejs";

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

async function deleteManagedAvatarFile(avatarPath: string | null | undefined) {
  if (!isManagedCustomerAvatarPath(avatarPath) || typeof avatarPath !== "string") {
    return;
  }

  try {
    await fs.unlink(path.join(avatarDirectory, path.basename(avatarPath)));
  } catch {
    // Ignore missing files. The DB update is the source of truth.
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await auth();

  if (!session?.user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  if (!canAccessMobileApp(session.user.role)) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const { id } = await context.params;
  const customerId = id?.trim();

  if (!customerId) {
    return NextResponse.json({ message: "Invalid customer id" }, { status: 400 });
  }

  const customerScope = getCustomerScope(
    session.user.role,
    session.user.id,
    session.user.teamId,
  );

  if (!customerScope) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  try {
    const customer = await prisma.customer.findFirst({
      where: {
        AND: [{ id: customerId }, customerScope],
      },
      select: {
        id: true,
        name: true,
        avatarPath: true,
      },
    });

    if (!customer) {
      return NextResponse.json(
        { message: "Customer not found" },
        { status: 404, headers: noStoreHeaders },
      );
    }

    const formData = await request.formData();
    const file = formData.get("avatar");

    if (!(file instanceof File) || file.size === 0) {
      return NextResponse.json(
        { message: "请选择客户照片。" },
        { status: 400, headers: noStoreHeaders },
      );
    }

    if (file.size > maxAvatarSize) {
      return NextResponse.json(
        { message: "客户照片需小于 2MB。" },
        { status: 400, headers: noStoreHeaders },
      );
    }

    const extension = getAvatarFileExtension(file);

    if (!extension) {
      return NextResponse.json(
        { message: "仅支持 JPG、PNG 或 WEBP 图片。" },
        { status: 400, headers: noStoreHeaders },
      );
    }

    await fs.mkdir(avatarDirectory, { recursive: true });

    const filename = `${customer.id}-${randomUUID()}.${extension}`;
    const avatarPath = `${CUSTOMER_AVATAR_UPLOAD_PREFIX}${filename}`;
    const buffer = Buffer.from(await file.arrayBuffer());

    await fs.writeFile(path.join(avatarDirectory, filename), buffer);

    await prisma.$transaction([
      prisma.customer.update({
        where: { id: customer.id },
        data: { avatarPath },
        select: { id: true },
      }),
      prisma.operationLog.create({
        data: {
          actorId: session.user.id,
          module: OperationModule.CUSTOMER,
          action: "UPDATE_CUSTOMER_AVATAR",
          targetType: OperationTargetType.CUSTOMER,
          targetId: customer.id,
          description: `移动端更新客户照片：${customer.name}`,
          beforeData: {
            avatarPath: customer.avatarPath,
          },
          afterData: {
            avatarPath,
          },
        },
      }),
    ]);

    await deleteManagedAvatarFile(customer.avatarPath);

    return NextResponse.json(
      {
        customer: {
          id: customer.id,
          avatarPath,
          avatarUrl: resolveCustomerAvatarSrc(avatarPath),
        },
      },
      { headers: noStoreHeaders },
    );
  } catch (error) {
    console.error("Failed to upload mobile customer avatar.", error);

    return NextResponse.json(
      { message: "客户照片上传失败。" },
      { status: 500, headers: noStoreHeaders },
    );
  }
}
