import { describe, expect, it } from "vitest";
import { getProducts } from "~/lib/catalog.server";
import { action as shippingQuoteAction } from "~/routes/api.shipping-quote";

describe("commerce boundaries", () => {
  it("never serializes costs or professional offers in the public catalogue", async () => {
    const products = await getProducts({ status: "published" });
    expect(products.length).toBe(7);
    for (const variant of products.flatMap((product) => product.variants)) {
      expect(variant.internalCostCents).toBe(0);
      expect(variant.offers.every((offer) => offer.audience === "retail")).toBe(true);
    }
  });
  it("returns a 403 when a visitor submits professional prices", async () => {
    const product = (await getProducts({ status: "published", audience: "professional" }))[0]; const variant = product.variants[0];
    const request = new Request("http://localhost/api/shipping/quote", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ cartId: crypto.randomUUID(), locale: "fr-FR", lines: [{ productId: product.id, variantId: variant.id, audience: "professional", quantity: 5 }], address: { firstName: "Ada", lastName: "Lovelace", company: "Lab", email: "ada@example.com", phone: "0600000000", line1: "1 rue du Café", postalCode: "37000", city: "Tours", countryCode: "FR" } }) });
    const response = await shippingQuoteAction({ request, params: {}, context: {} } as never); expect(response.status).toBe(403);
  });
  it("quotes real parcel weight in mock mode without exposing Shippo identifiers", async () => {
    const product = (await getProducts({ status: "published" }))[0]; const variant = product.variants[0];
    const request = new Request("http://localhost/api/shipping/quote", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ cartId: crypto.randomUUID(), locale: "fr-FR", lines: [{ productId: product.id, variantId: variant.id, audience: "retail", quantity: 2 }], address: { firstName: "Ada", lastName: "Lovelace", company: "", email: "ada@example.com", phone: "0600000000", line1: "1 rue du Café", line2: "", postalCode: "37000", city: "Tours", countryCode: "FR" } }) });
    const response = await shippingQuoteAction({ request, params: {}, context: {} } as never); const data = await response.json();
    expect(response.status).toBe(200); expect(data.parcels[0].shippingWeightGrams).toBe(580); expect(data.rates[0]).not.toHaveProperty("shippoRateIds");
  });
  it("binds a validated pickup point to a pickup-only quote", async () => {
    const product = (await getProducts({ status: "published" }))[0]; const variant = product.variants[0];
    const request = new Request("http://localhost/api/shipping/quote", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ cartId: crypto.randomUUID(), locale: "fr-FR", lines: [{ productId: product.id, variantId: variant.id, audience: "retail", quantity: 1 }], pickupPointId: "370000", address: { firstName: "Ada", lastName: "Lovelace", company: "", email: "ada@example.com", phone: "0600000000", line1: "1 rue du Café", line2: "", postalCode: "37000", city: "Tours", countryCode: "FR" } }) });
    const response = await shippingQuoteAction({ request, params: {}, context: {} } as never); const data = await response.json();
    expect(response.status).toBe(200); expect(data.rates).toHaveLength(1); expect(data.rates[0]).toMatchObject({ deliveryMethod: "pickup", service: "Point Retrait", pickupPoint: { id: "370000" } });
    expect(data.rates[0]).not.toHaveProperty("shippoRateIds"); expect(data.rates[0]).not.toHaveProperty("serviceToken");
  });
});
