import { describe, expect, it, vi } from "vitest";
import emailForwarder, { forwardingDestinations } from "../../workers/email-forwarder";

describe("email forwarder", () => {
  it("forwards each incoming message to both configured destinations", async () => {
    const forward = vi.fn().mockResolvedValue(undefined);
    const setReject = vi.fn();

    await emailForwarder.email(
      { forward, setReject },
      { EMAIL_FORWARD_PRIMARY: "first@gmail.com", EMAIL_FORWARD_SECONDARY: "second@gmail.com" },
    );

    expect(forward).toHaveBeenCalledTimes(2);
    expect(forward).toHaveBeenNthCalledWith(1, "first@gmail.com");
    expect(forward).toHaveBeenNthCalledWith(2, "second@gmail.com");
    expect(setReject).not.toHaveBeenCalled();
  });

  it("rejects mail when two distinct destinations are not configured", async () => {
    const forward = vi.fn().mockResolvedValue(undefined);
    const setReject = vi.fn();

    await emailForwarder.email(
      { forward, setReject },
      { EMAIL_FORWARD_PRIMARY: "same@gmail.com", EMAIL_FORWARD_SECONDARY: "same@gmail.com" },
    );

    expect(forward).not.toHaveBeenCalled();
    expect(setReject).toHaveBeenCalledOnce();
  });

  it("normalizes and deduplicates configured destinations", () => {
    expect(forwardingDestinations({
      EMAIL_FORWARD_PRIMARY: " First@Gmail.com ",
      EMAIL_FORWARD_SECONDARY: "first@gmail.com",
    })).toEqual(["first@gmail.com"]);
  });
});
