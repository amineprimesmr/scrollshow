type BrandMarkProps = {
  size?: number;
  className?: string;
  alt?: string;
};

export function BrandMark({ size = 36, className, alt = "ScrollShow" }: BrandMarkProps) {
  return (
    <img
      src="/logo.png"
      alt={alt}
      width={size}
      height={size}
      className={className}
      decoding="async"
      style={{ borderRadius: Math.max(6, Math.round(size * 0.22)), objectFit: "cover" }}
    />
  );
}
