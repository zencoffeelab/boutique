import { describe, expect, it } from "vitest";
import { constructStripeEvent, createStripe } from "~/lib/stripe.server";

describe("Stripe webhook verification", () => {
  it("accepts a valid signature with the Web Crypto provider", async () => {
    const stripe = createStripe("sk_test_zencoffeelab");
    const payload = JSON.stringify({ id: "evt_zencoffeelab", object: "event", type: "checkout.session.completed" });
    const secret = "whsec_zencoffeelab";
    const signature = stripe.webhooks.generateTestHeaderString({ payload, secret });

    const event = await constructStripeEvent(stripe, payload, signature, secret);

    expect(event.id).toBe("evt_zencoffeelab");
  });

  it("rejects an invalid signature", async () => {
    const stripe = createStripe("sk_test_zencoffeelab");

    await expect(constructStripeEvent(stripe, "{}", "t=1,v1=invalid", "whsec_zencoffeelab")).rejects.toThrow();
  });
});
