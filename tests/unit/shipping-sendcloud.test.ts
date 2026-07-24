import { afterEach, describe, expect, it, vi } from "vitest";

const address = {
  firstName: "Ada", lastName: "Lovelace", company: "", email: "ada@example.com", phone: "+33600000000",
  line1: "1 rue du Café", line2: "", postalCode: "37000", city: "Tours", countryCode: "FR",
};

function option(input: { code: string; carrierCode: string; carrier: string; name: string; lastMile: string; amount: string }) {
  return {
    code: input.code, name: input.name, carrier: { code: input.carrierCode, name: input.carrier },
    functionalities: { last_mile: input.lastMile, tracked: true, form_factor: "parcel" },
    quotes: [{ price: { total: { value: input.amount, currency: "EUR" } }, lead_time: 48 }],
  };
}

async function cartLine() {
  const { getProducts } = await import("~/lib/catalog.server");
  const product = (await getProducts({ status: "published" }))[0];
  return { productId: product.id, variantId: product.variants[0].id, audience: "retail" as const, quantity: 1 };
}

function useRealShippingEnvironment() {
  vi.stubEnv("SHIPPING_MOCK", "false");
  vi.stubEnv("SENDCLOUD_PUBLIC_KEY", "public-key");
  vi.stubEnv("SENDCLOUD_SECRET_KEY", "private-key");
  vi.stubEnv("VITE_SUPABASE_URL", "");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
}

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.resetModules(); });

describe("Sendcloud shipping quotes", () => {
  it("returns enabled home carriers without exposing pickup or letter options", async () => {
    useRealShippingEnvironment();
    vi.stubGlobal("fetch", vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      expect(body).not.toHaveProperty("carrier_code");
      expect(body.functionalities).toEqual({ last_mile: "home_delivery" });
      return new Response(JSON.stringify({ data: [
        option({ code: "fedex:domestic", carrierCode: "fedex", carrier: "FedEx", name: "FedEx Priority", lastMile: "home_delivery", amount: "9.33" }),
        option({ code: "mondial_relay:home", carrierCode: "mondial_relay", carrier: "Mondial Relay", name: "Mondial Relay Home", lastMile: "home_delivery", amount: "5.17" }),
        option({ code: "mondial_relay:service_point", carrierCode: "mondial_relay", carrier: "Mondial Relay", name: "Point Relais", lastMile: "service_point", amount: "3.91" }),
        option({ code: "sendcloud:letter", carrierCode: "sendcloud", carrier: "Sendcloud", name: "Unstamped letter", lastMile: "home_delivery", amount: "0" }),
      ] }), { status: 200, headers: { "content-type": "application/json" } });
    }));
    vi.resetModules();
    const { createShippingQuote } = await import("~/services/shipping.server");
    const quote = await createShippingQuote({ cartId: crypto.randomUUID(), locale: "fr-FR", audience: "retail", address, lines: [await cartLine()] });

    expect(quote.rates.map((rate) => rate.carrier)).toEqual(["Mondial Relay", "FedEx"]);
    expect(quote.rates.every((rate) => rate.deliveryMethod === "home")).toBe(true);
  });

  it("validates a service point and returns only its compatible pickup options", async () => {
    useRealShippingEnvironment();
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/check-availability")) return new Response("true", { status: 200, headers: { "content-type": "application/json" } });
      if (url.includes("servicepoints.sendcloud.sc")) return new Response(JSON.stringify({ id: 10575092, is_active: true, name: "Café Relais", street: "rue Nationale", house_number: "1", postal_code: "37000", city: "Tours", country: "FR", carrier: "mondial_relay", general_shop_type: "servicepoint" }), { status: 200, headers: { "content-type": "application/json" } });
      const body = JSON.parse(String(init?.body));
      expect(body).toMatchObject({ carrier_code: "mondial_relay", functionalities: { last_mile: "service_point" }, to_service_point: { id: 10575092 } });
      return new Response(JSON.stringify({ data: [
        option({ code: "mondial_relay:service_point", carrierCode: "mondial_relay", carrier: "Mondial Relay", name: "Point Relais", lastMile: "service_point", amount: "3.91" }),
        option({ code: "fedex:domestic", carrierCode: "fedex", carrier: "FedEx", name: "FedEx Priority", lastMile: "home_delivery", amount: "9.33" }),
      ] }), { status: 200, headers: { "content-type": "application/json" } });
    }));
    vi.resetModules();
    const { createShippingQuote } = await import("~/services/shipping.server");
    const quote = await createShippingQuote({ cartId: crypto.randomUUID(), locale: "fr-FR", audience: "retail", address, pickupPointId: "10575092", lines: [await cartLine()] });

    expect(quote.rates).toHaveLength(1);
    expect(quote.rates[0]).toMatchObject({ carrier: "Mondial Relay", deliveryMethod: "pickup", pickupPoint: { id: "10575092", name: "Café Relais" } });
  });
});
