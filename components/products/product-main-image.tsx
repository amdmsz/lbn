import { Package } from "lucide-react";
import {
  buildProductImageGlyph,
  resolveProductMainImageSrc,
} from "@/lib/products/image";

type ProductMainImageProps = {
  mainImagePath: string | null | undefined;
  name: string;
  brandName?: string | null;
  fallbackGlyph?: string | null;
  size?: "list" | "hero" | "form";
  className?: string;
};

const sizeClasses: Record<
  NonNullable<ProductMainImageProps["size"]>,
  string
> = {
  list: "h-12 w-12 rounded-md",
  hero: "h-32 w-32 rounded-xl",
  form: "h-20 w-20 rounded-lg",
};

const fallbackIconSizeClasses: Record<
  NonNullable<ProductMainImageProps["size"]>,
  string
> = {
  list: "h-5 w-5",
  hero: "h-10 w-10",
  form: "h-7 w-7",
};

export function ProductMainImage({
  mainImagePath,
  name,
  brandName,
  fallbackGlyph,
  size = "list",
  className = "",
}: Readonly<ProductMainImageProps>) {
  const src = resolveProductMainImageSrc(mainImagePath);
  // 仅当 hero 尺寸且没有图片时显示文字 glyph 作为视觉锚点;
  // list 尺寸 (商品组列表行) 用中性 Package 图标, 避免商品组名前 2 字
  // 看起来像"标签"/"chip" (用户截图反馈 "后端" 文字 chip 突兀).
  const shouldShowGlyph = size === "hero";
  const glyph = fallbackGlyph || buildProductImageGlyph(brandName || name);

  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={name}
        className={`${sizeClasses[size]} ${className} border border-[var(--color-border-soft)] bg-[var(--color-shell-surface)] object-cover`}
      />
    );
  }

  return (
    <div
      className={`${sizeClasses[size]} ${className} flex items-center justify-center border border-[var(--color-border-soft)] bg-[var(--color-shell-surface-soft)] text-[var(--color-sidebar-muted)]`}
      aria-label={`${name} 暂无图片`}
    >
      {shouldShowGlyph ? (
        <span className="font-semibold tracking-[0.08em] text-base">
          {glyph}
        </span>
      ) : (
        <Package className={fallbackIconSizeClasses[size]} aria-hidden="true" />
      )}
    </div>
  );
}
