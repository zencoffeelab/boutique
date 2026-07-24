import { describe, expect, it } from "vitest";
import { safeInternalPath } from "~/lib/redirects";

describe("safe internal redirects", () => {
  it("keeps local professional paths and query strings", () => {
    expect(safeInternalPath("/mon-compte?next=%2Fprofessionnel", "/")).toBe("/mon-compte?next=%2Fprofessionnel");
  });

  it("rejects protocol-relative and backslash redirects", () => {
    expect(safeInternalPath("//evil.example", "/mon-compte")).toBe("/mon-compte");
    expect(safeInternalPath("/\\evil.example", "/mon-compte")).toBe("/mon-compte");
    expect(safeInternalPath("https://evil.example", "/mon-compte")).toBe("/mon-compte");
  });
});
