import { promises as fs } from "fs";
import path from "path";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/session";

const productImageDirectory = path.join(process.cwd(), "public", "uploads", "products");

const productImageContentTypes = new Map<string, string>([
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

  const { filename } = await context.params;
  const safeFilename = path.basename(filename);

  if (!safeFilename) {
    return NextResponse.json({ message: "Invalid product image filename" }, { status: 400 });
  }

  const absolutePath = path.join(productImageDirectory, safeFilename);

  try {
    const fileBuffer = await fs.readFile(absolutePath);
    const extension = path.extname(safeFilename).toLowerCase();
    const contentType =
      productImageContentTypes.get(extension) ?? "application/octet-stream";

    return new NextResponse(fileBuffer, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return NextResponse.json({ message: "Product image not found" }, { status: 404 });
  }
}
