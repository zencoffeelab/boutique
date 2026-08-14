import { describe, expect, it } from "vitest";
import {
  mapPublicMediaUrls,
  publicMediaDeliveryUrl,
  publicMediaOriginUrl,
} from "~/lib/public-media";

const storageUrl = "https://fmkjnjmitsudzjjbrkoa.supabase.co/storage/v1/object/public/product-media/hover-images/product/image.webp";
const deliveryUrl = "/media/storage/product-media/hover-images/product/image.webp";

describe("public media delivery", () => {
  it("routes public Supabase media through the site domain", () => {
    expect(publicMediaDeliveryUrl(storageUrl)).toBe(deliveryUrl);
  });

  it("keeps unrelated and private URLs unchanged", () => {
    expect(publicMediaDeliveryUrl("https://cdn.example.com/image.webp")).toBe("https://cdn.example.com/image.webp");
    expect(publicMediaDeliveryUrl("https://fmkjnjmitsudzjjbrkoa.supabase.co/storage/v1/object/sign/invoices/file.pdf")).toContain("/sign/invoices/");
  });

  it("maps media URLs nested in editorial layouts", () => {
    expect(mapPublicMediaUrls({ images: [{ src: storageUrl }] })).toEqual({ images: [{ src: deliveryUrl }] });
  });

  it("only resolves allowed, traversal-free delivery paths", () => {
    expect(publicMediaOriginUrl("/media/storage/product-media/folder/image.webp")).toBe("https://fmkjnjmitsudzjjbrkoa.supabase.co/storage/v1/object/public/product-media/folder/image.webp");
    expect(publicMediaOriginUrl("/media/storage/private-bucket/file.pdf")).toBeNull();
    expect(publicMediaOriginUrl("/media/storage/product-media/%2E%2E/secret")).toBeNull();
  });
});
