import { buildProductImageGlyph, resolveProductMainImageSrc } from "@/lib/products/image";

type ProductMainImageProps = {
  mainImagePath: string | null | undefined;
  name: string;
  brandName?: string | null;
  fallbackGlyph?: string | null;
  size?: "list" | "hero" | "form";
  className?: string;
};

const sizeClasses: Record<NonNullable<ProductMainImageProps["size"]>, string> = {
  list: "h-14 w-14 rounded-[1rem] text-sm",
  hero: "h-28 w-28 rounded-[1.15rem] text-xl",
  form: "h-20 w-20 rounded-[1rem] text-base",
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
  const glyph = fallbackGlyph || buildProductImageGlyph(brandName || name);

  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={name}
        className={`${sizeClasses[size]} ${className} border border-black/8 bg-[rgba(247,248,250,0.94)] object-cover shadow-[0_10px_20px_rgba(15,23,42,0.06)]`}
      />
    );
  }

  return (
    <div
      className={`${sizeClasses[size]} ${className} flex items-center justify-center border border-black/8 bg-[linear-gradient(180deg,rgba(247,248,250,0.94),rgba(255,255,255,0.98))] font-semibold tracking-[0.08em] text-black/58`}
    >
      {glyph}
    </div>
  );
}
