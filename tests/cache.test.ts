import { describe, expect, it } from "vitest";
import { htmlCacheControl } from "../app/entry.server";

describe("SSR CDN policy", () => {
  it("caches anonymous editorial and catalog pages at the CDN", () => {
    expect(htmlCacheControl(new Request("https://www.zencoffeelab.com/boutique/ethiopie-aricha-station"))).toContain("s-maxage=300");
  });

  it("never caches sessions, checkout or professional pricing", () => {
    expect(htmlCacheControl(new Request("https://www.zencoffeelab.com/en/professional"))).toBe("private, no-store");
    expect(htmlCacheControl(new Request("https://www.zencoffeelab.com/boutique", { headers: { cookie: "sb-token=secret" } }))).toBe("private, no-store");
  });
});
