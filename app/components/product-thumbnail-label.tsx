export function ProductThumbnailLabel({ src, alt, className, loading }: { src: string; alt: string; className: string; loading?: "eager" | "lazy" }) {
  return <span className={`product-thumbnail-label ${className}`}>
    <img className="product-thumbnail-label__image" src={src} alt={alt} width={1240} height={697} loading={loading} />
  </span>;
}
