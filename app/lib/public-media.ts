const supabaseStorageOrigin = "https://fmkjnjmitsudzjjbrkoa.supabase.co";
const publicStoragePrefix = "/storage/v1/object/public/";

export const PUBLIC_MEDIA_CACHE_SECONDS = 31_536_000;
export const PUBLIC_MEDIA_MAX_UPLOAD_BYTES = 1_500_000;
export const PUBLIC_MEDIA_MAX_DIMENSION = 2_000;
export const PUBLIC_MEDIA_ROUTE_PREFIX = "/media/storage/";

export const publicMediaBuckets: ReadonlySet<string> = new Set(["product-media", "advice-media"]);

function safeStorageParts(value: string) {
  let decoded: string;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    return null;
  }
  const parts = decoded.split("/");
  if (
    parts.length < 2 ||
    !publicMediaBuckets.has(parts[0] ?? "") ||
    parts.some((part) => !part || part === "." || part === ".." || part.includes("\\") || part.includes("\0"))
  ) return null;
  return parts;
}

export function publicMediaDeliveryUrl(value: string | null | undefined) {
  if (!value) return value ?? "";
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return value;
  }
  if (url.origin !== supabaseStorageOrigin || !url.pathname.startsWith(publicStoragePrefix)) return value;
  const parts = safeStorageParts(url.pathname.slice(publicStoragePrefix.length));
  if (!parts) return value;
  const path = parts.map(encodeURIComponent).join("/");
  return `${PUBLIC_MEDIA_ROUTE_PREFIX}${path}`;
}

export function publicMediaOriginUrl(deliveryPath: string) {
  if (!deliveryPath.startsWith(PUBLIC_MEDIA_ROUTE_PREFIX)) return null;
  const parts = safeStorageParts(deliveryPath.slice(PUBLIC_MEDIA_ROUTE_PREFIX.length));
  if (!parts) return null;
  return `${supabaseStorageOrigin}${publicStoragePrefix}${parts.map(encodeURIComponent).join("/")}`;
}

export function mapPublicMediaUrls<T>(value: T): T {
  if (typeof value === "string") return publicMediaDeliveryUrl(value) as T;
  if (Array.isArray(value)) return value.map(mapPublicMediaUrls) as T;
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, mapPublicMediaUrls(item)]),
  ) as T;
}
