import { describe, expect, it } from "vitest";
import { optionalMfaSatisfied } from "~/lib/auth.server";

describe("optional two-factor authentication", () => {
  it("allows an administrator without an enrolled factor", () => {
    expect(optionalMfaSatisfied(0, "aal1")).toBe(true);
  });

  it("requires AAL2 only when a verified factor is enrolled", () => {
    expect(optionalMfaSatisfied(1, "aal1")).toBe(false);
    expect(optionalMfaSatisfied(1, "aal2")).toBe(true);
  });
});
