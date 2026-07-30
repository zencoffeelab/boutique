import { useId } from "react";

export const PRODUCT_THUMBNAIL_BAG_URL = "/media/product-cards/zen-coffee-bag-resealable.png";

export function ProductPackArtwork({
  labelUrl,
  alt,
  packClassName,
  labelClassName,
  loading,
}: {
  labelUrl: string;
  alt: string;
  packClassName: string;
  labelClassName: string;
  loading?: "eager" | "lazy";
}) {
  return <>
    <img
      className={packClassName}
      src={PRODUCT_THUMBNAIL_BAG_URL}
      alt={alt}
      width={900}
      height={900}
      loading={loading}
    />
    <ProductThumbnailLabel
      className={labelClassName}
      src={labelUrl}
      alt=""
      loading={loading}
    />
  </>;
}

export function ProductThumbnailLabel({ src, alt, className, loading }: { src: string; alt: string; className: string; loading?: "eager" | "lazy" }) {
  const wrinkleFilterId = `product-label-wrinkle-${useId().replaceAll(":", "")}`;

  return <span className={`product-thumbnail-label ${className}`}>
    <svg className="product-thumbnail-label__filter" width="0" height="0" aria-hidden="true" focusable="false">
      <defs>
        <filter id={wrinkleFilterId} x="-8%" y="-12%" width="116%" height="124%" colorInterpolationFilters="sRGB">
          <feTurbulence type="fractalNoise" baseFrequency="0.012 0.045" numOctaves={2} seed={11} result="wrinkles" />
          <feGaussianBlur in="wrinkles" stdDeviation="0.35" result="softWrinkles" />
          <feDisplacementMap in="SourceGraphic" in2="softWrinkles" scale={2.2} xChannelSelector="R" yChannelSelector="G" />
        </filter>
      </defs>
    </svg>
    <img
      className="product-thumbnail-label__image"
      src={src}
      alt={alt}
      width={1240}
      height={697}
      loading={loading}
      style={{ filter: `url(#${wrinkleFilterId})` }}
    />
  </span>;
}
