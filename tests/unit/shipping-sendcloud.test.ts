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
  vi.stubEnv("COLISSIMO_FR_MODE", "shippo_only");
  vi.stubEnv("SENDCLOUD_PUBLIC_KEY", "public-key");
  vi.stubEnv("SENDCLOUD_SECRET_KEY", "private-key");
  vi.stubEnv("VITE_SUPABASE_URL", "");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
}

function useHybridShippingEnvironment() {
  useRealShippingEnvironment();
  vi.stubEnv("SHIPPO_API_TOKEN", "shippo-token");
  vi.stubEnv("SHIP_FROM_STREET1", "1 rue du Café");
  vi.stubEnv("SHIP_FROM_POSTAL_CODE", "37000");
  vi.stubEnv("SHIP_FROM_PHONE", "+33200000000");
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

  it("uses Shippo exclusively for Colissimo deliveries in France", async () => {
    useHybridShippingEnvironment();
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("api.goshippo.com/shipments")) return new Response(JSON.stringify({ rates: [{
        object_id: "shippo-colissimo-rate", amount: "6.25", currency: "EUR", provider: "Colissimo",
        estimated_days: 2, servicelevel: { name: "Colissimo Domicile", token: "colissimo_home" },
      }] }), { status: 200, headers: { "content-type": "application/json" } });
      return new Response(JSON.stringify({ data: [
        option({ code: "colissimo:home", carrierCode: "colissimo", carrier: "Colissimo", name: "Colissimo France", lastMile: "home_delivery", amount: "7.90" }),
        option({ code: "fedex:domestic", carrierCode: "fedex", carrier: "FedEx", name: "FedEx Priority", lastMile: "home_delivery", amount: "9.33" }),
      ] }), { status: 200, headers: { "content-type": "application/json" } });
    });
    vi.stubGlobal("fetch", fetchMock);
    vi.resetModules();
    const { createShippingQuote, publicQuote } = await import("~/services/shipping.server");
    const quote = await createShippingQuote({ cartId: crypto.randomUUID(), locale: "fr-FR", audience: "retail", address, lines: [await cartLine()] });

    expect(quote.rates).toHaveLength(2);
    expect(quote.rates.find((rate) => rate.carrier === "Colissimo")).toMatchObject({ provider: "shippo", shippoRateIds: ["shippo-colissimo-rate"] });
    expect(quote.rates.some((rate) => rate.provider === "sendcloud" && rate.carrier === "Colissimo")).toBe(false);
    expect(publicQuote(quote).rates.find((rate) => rate.carrier === "Colissimo")).not.toHaveProperty("shippoRateIds");
  });

  it("returns both Shippo and Sendcloud Colissimo rates in comparison mode", async () => {
    useHybridShippingEnvironment();
    vi.stubEnv("COLISSIMO_FR_MODE", "compare");
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes("api.goshippo.com/shipments")) return new Response(JSON.stringify({ rates: [{
        object_id: "shippo-colissimo-rate", amount: "6.25", currency: "EUR", provider: "Colissimo",
        estimated_days: 2, servicelevel: { name: "Colissimo Domicile", token: "colissimo_home" },
      }] }), { status: 200, headers: { "content-type": "application/json" } });
      return new Response(JSON.stringify({ data: [
        option({ code: "colissimo:home", carrierCode: "colissimo", carrier: "Colissimo", name: "Colissimo France", lastMile: "home_delivery", amount: "7.90" }),
        option({ code: "fedex:domestic", carrierCode: "fedex", carrier: "FedEx", name: "FedEx Priority", lastMile: "home_delivery", amount: "9.33" }),
      ] }), { status: 200, headers: { "content-type": "application/json" } });
    }));
    vi.resetModules();
    const { createShippingQuote } = await import("~/services/shipping.server");
    const quote = await createShippingQuote({ cartId: crypto.randomUUID(), locale: "fr-FR", audience: "retail", address, lines: [await cartLine()] });
    const colissimoRates = quote.rates.filter((rate) => rate.carrier === "Colissimo");

    expect(colissimoRates).toHaveLength(2);
    expect(colissimoRates.map((rate) => ({ provider: rate.provider, amountCents: rate.amountCents }))).toEqual([
      { provider: "shippo", amountCents: 625 },
      { provider: "sendcloud", amountCents: 790 },
    ]);
  });

  it("can restore a Sendcloud-only Colissimo mode without calling Shippo", async () => {
    useHybridShippingEnvironment();
    vi.stubEnv("COLISSIMO_FR_MODE", "sendcloud_only");
    const fetchMock = vi.fn(async (_input: RequestInfo | URL) => new Response(JSON.stringify({ data: [
      option({ code: "colissimo:home", carrierCode: "colissimo", carrier: "Colissimo", name: "Colissimo France", lastMile: "home_delivery", amount: "7.90" }),
    ] }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    vi.resetModules();
    const { createShippingQuote } = await import("~/services/shipping.server");
    const quote = await createShippingQuote({ cartId: crypto.randomUUID(), locale: "fr-FR", audience: "retail", address, lines: [await cartLine()] });

    expect(quote.rates).toHaveLength(1);
    expect(quote.rates[0]).toMatchObject({ provider: "sendcloud", carrier: "Colissimo", amountCents: 790 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain("sendcloud.sc");
  });

  it("reuses the active Sendcloud sender address when dedicated Shippo sender variables are absent", async () => {
    useHybridShippingEnvironment();
    vi.stubEnv("SHIP_FROM_STREET1", "");
    vi.stubEnv("SHIP_FROM_POSTAL_CODE", "");
    vi.stubEnv("SHIP_FROM_PHONE", "");
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("sender-addresses")) return new Response(JSON.stringify({ data: [{ is_active: true, name: "Zen", company_name: "Zen Coffee Lab", house_number: "10", address_line_1: "rue du Test", city: "Tours", postal_code: "37000", country_code: "FR", phone_number: "+33200000000", email: "contact@example.com" }] }), { status: 200 });
      if (url.includes("api.goshippo.com/shipments")) {
        expect(JSON.parse(String(init?.body)).address_from).toMatchObject({ street1: "10 rue du Test", zip: "37000", country: "FR" });
        return new Response(JSON.stringify({ rates: [{ object_id: "shippo-colissimo-rate", amount: "6.25", currency: "EUR", provider: "Colissimo", servicelevel: { name: "Colissimo Domicile", token: "colissimo_home" } }] }), { status: 200 });
      }
      return new Response(JSON.stringify({ data: [option({ code: "fedex:domestic", carrierCode: "fedex", carrier: "FedEx", name: "FedEx Priority", lastMile: "home_delivery", amount: "9.33" })] }), { status: 200 });
    }));
    vi.resetModules();
    const { createShippingQuote } = await import("~/services/shipping.server");
    const quote = await createShippingQuote({ cartId: crypto.randomUUID(), locale: "fr-FR", audience: "retail", address, lines: [await cartLine()] });

    expect(quote.rates.map((rate) => rate.carrier)).toEqual(["Colissimo", "FedEx"]);
  });

  it("never falls back to Sendcloud Colissimo in France when Shippo fails", async () => {
    useHybridShippingEnvironment();
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("api.goshippo.com/shipments")) return new Response("unavailable", { status: 503 });
      return new Response(JSON.stringify({ data: [
        option({ code: "colissimo:home", carrierCode: "colissimo", carrier: "Colissimo", name: "Colissimo France", lastMile: "home_delivery", amount: "7.90" }),
        option({ code: "fedex:domestic", carrierCode: "fedex", carrier: "FedEx", name: "FedEx Priority", lastMile: "home_delivery", amount: "9.33" }),
      ] }), { status: 200, headers: { "content-type": "application/json" } });
    }));
    vi.resetModules();
    const { createShippingQuote } = await import("~/services/shipping.server");
    const quote = await createShippingQuote({ cartId: crypto.randomUUID(), locale: "fr-FR", audience: "retail", address, lines: [await cartLine()] });

    expect(quote.rates.map((rate) => rate.carrier)).toEqual(["FedEx"]);
  });

  it("keeps Sendcloud Colissimo outside France and does not call Shippo", async () => {
    useHybridShippingEnvironment();
    const fetchMock = vi.fn(async (_input: RequestInfo | URL) => new Response(JSON.stringify({ data: [
      option({ code: "colissimo:international", carrierCode: "colissimo", carrier: "Colissimo", name: "Colissimo International", lastMile: "home_delivery", amount: "12.40" }),
    ] }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    vi.resetModules();
    const { createShippingQuote } = await import("~/services/shipping.server");
    const quote = await createShippingQuote({ cartId: crypto.randomUUID(), locale: "fr-FR", audience: "retail", address: { ...address, countryCode: "DE", postalCode: "10115", city: "Berlin" }, lines: [await cartLine()] });

    expect(quote.rates[0]).toMatchObject({ provider: "sendcloud", carrier: "Colissimo" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain("sendcloud.sc");
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
