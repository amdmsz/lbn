import { promises as fs } from "fs";
import path from "path";
import { NextResponse } from "next/server";
import { canAccessMobileApp, getCustomerScope } from "@/lib/auth/access";
import { auth } from "@/lib/auth/session";
import { CUSTOMER_AVATAR_UPLOAD_PREFIX } from "@/lib/customers/avatar";
import { prisma } from "@/lib/db/prisma";

const avatarDirectory = path.join(
  process.cwd(),
  "public",
  "uploads",
  "customer-avatars",
);

const avatarContentTypes = new Map<string, string>([
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".png", "image/png"],
  [".webp", "image/webp"],
]);

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ filename: string }> },
) {
  const session = await auth();

  if (!session?.user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  if (!canAccessMobileApp(session.user.role)) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const customerScope = getCustomerScope(
    session.user.role,
    session.user.id,
    session.user.teamId,
  );

  if (!customerScope) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const { filename } = await context.params;
  const safeFilename = path.basename(filename);

  if (!safeFilename || safeFilename !== filename) {
    return NextResponse.json(
      { message: "Invalid customer avatar filename" },
      { status: 400 },
    );
  }

  const avatarPath = `${CUSTOMER_AVATAR_UPLOAD_PREFIX}${safeFilename}`;

  try {
    const customer = await prisma.customer.findFirst({
      where: {
        AND: [{ avatarPath }, customerScope],
      },
      select: {
        id: true,
      },
    });

    if (!customer) {
      return NextResponse.json({ message: "Avatar not found" }, { status: 404 });
    }

    const fileBuffer = await fs.readFile(path.join(avatarDirectory, safeFilename));
    const extension = path.extname(safeFilename).toLowerCase();
    const contentType = avatarContentTypes.get(extension) ?? "application/octet-stream";

    return new NextResponse(fileBuffer, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("Failed to read mobile customer avatar.", error);

    return NextResponse.json({ message: "Avatar not found" }, { status: 404 });
  }
}
