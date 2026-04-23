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
  list: "h-12 w-12 rounded-[0.9rem] text-sm",
  hero: "h-32 w-32 rounded-[1.25rem] text-[1.25rem]",
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
        className={`${sizeClasses[size]} ${className} border border-[var(--color-border-soft)] bg-[var(--color-shell-surface)] object-cover shadow-[var(--color-shell-shadow-xs)] transition-transform duration-500 ease-out`}
      />
    );
  }

  return (
    <div
      className={`${sizeClasses[size]} ${className} flex items-center justify-center border border-[var(--color-border-soft)] bg-[linear-gradient(180deg,rgba(255,255,255,0.99),rgba(244,247,250,0.96))] font-semibold tracking-[0.08em] text-[var(--color-sidebar-muted)] shadow-[var(--color-shell-shadow-xs)] transition-transform duration-500 ease-out`}
    >
      {glyph}
    </div>
  );
}
