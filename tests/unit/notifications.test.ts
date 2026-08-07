import { describe, expect, it } from "vitest";
import { notificationBatchLimit, notificationBatchSize } from "~/services/notifications.server";

describe("notificationBatchLimit", () => {
  it("keeps notification processing within one Worker invocation budget", () => {
    expect(notificationBatchSize).toBe(5);
    expect(notificationBatchLimit()).toBe(5);
    expect(notificationBatchLimit(25)).toBe(5);
  });

  it("accepts smaller whole-number batches without allowing an empty batch", () => {
    expect(notificationBatchLimit(3.8)).toBe(3);
    expect(notificationBatchLimit(0)).toBe(1);
  });
});
