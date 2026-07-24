import { afterEach, describe, expect, it, vi } from "vitest";

const address = {
  firstName: "Ada", lastName: "Lovelace", company: "", email: "ada@example.com", phone: "+33600000000",
  line1: "1 rue du Café", line2: "", postalCode: "37000", city: "Tours", countryCode: "FR",
};

function option(input: { code: string; carrierCode: string; carrier: string; name: string; lastMile?: string; amount: string; signature?: boolean }) {
  return {
    code: input.code, name: input.name, carrier: { code: input.carrierCode, name: input.carrier },
    functionalities: { last_mile: input.lastMile ?? "home_delivery", tracked: true, form_factor: "parcel", signature: input.signature ?? false },
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
  vi.stubEnv("FREE_SHIPPING_FR_CENTS", "999999");
  vi.stubEnv("FREE_SHIPPING_EU_UK_CENTS", "999999");
  vi.stubEnv("VITE_SUPABASE_URL", "");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
}

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.resetModules(); });

describe("Sendcloud zoned shipping quotes", () => {
  it("keeps only Mondial Relay Home and FedEx Priority in France at the configured prices", async () => {
    useRealShippingEnvironment();
    const fetchMock = vi.fn(async (_input: RequestInfo | URL) => new Response(JSON.stringify({ data: [
      option({ code: "mondial_relay:home_domestic,dualapi/c2c", carrierCode: "mondial_relay", carrier: "Mondial Relay", name: "Mondial Relay Home Domestic", amount: "5.17" }),
      option({ code: "fedex:domestic", carrierCode: "fedex", carrier: "FedEx", name: "FedEx Priority", amount: "9.33" }),
      option({ code: "fedex:domestic/delivery_before=1200", carrierCode: "fedex", carrier: "FedEx", name: "FedEx Priority Express", amount: "13.53" }),
      option({ code: "colissimo:home/fr", carrierCode: "colissimo", carrier: "Colissimo", name: "Colissimo Home", amount: "8.87" }),
      option({ code: "sendcloud:letter", carrierCode: "sendcloud", carrier: "Sendcloud", name: "Letter", amount: "0" }),
    ] }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    vi.resetModules();
    const { createShippingQuote, publicQuote } = await import("~/services/shipping.server");
    const quote = await createShippingQuote({ cartId: crypto.randomUUID(), locale: "fr-FR", audience: "retail", address, lines: [await cartLine()] });

    expect(quote.rates.map(({ carrier, service, amountCents, provider }) => ({ carrier, service, amountCents, provider }))).toEqual([
      { carrier: "Mondial Relay", service: "Mondial Relay Home Domestic", amountCents: 390, provider: "sendcloud" },
      { carrier: "FedEx", service: "FedEx Priority", amountCents: 950, provider: "sendcloud" },
    ]);
    expect(quote.rates[0].sendcloudParcelAmountsCents).toEqual([517]);
    expect(publicQuote(quote).rates[0]).not.toHaveProperty("configuredService");
    expect(fetchMock.mock.calls.every(([input]) => String(input).includes("sendcloud.sc"))).toBe(true);
  });

  it("keeps only FedEx home services in Zone 2 and distinguishes signature", async () => {
    useRealShippingEnvironment();
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ data: [
      option({ code: "mondial_relay:home_international_dualapi/c2c", carrierCode: "mondial_relay", carrier: "Mondial Relay", name: "Mondial Relay Home International", amount: "10.43" }),
      option({ code: "fedex:internationalconnect", carrierCode: "fedex", carrier: "FedEx", name: "FedEx International Connect Plus", amount: "9.23" }),
      option({ code: "fedex:internationalconnect/age_check=18", carrierCode: "fedex", carrier: "FedEx", name: "FedEx International Connect Plus - Signature", amount: "13.62", signature: true }),
      option({ code: "colissimo:international", carrierCode: "colissimo", carrier: "Colissimo", name: "Colissimo International", amount: "10.81", signature: true }),
    ] }), { status: 200 })));
    vi.resetModules();
    const { createShippingQuote } = await import("~/services/shipping.server");
    const quote = await createShippingQuote({ cartId: crypto.randomUUID(), locale: "fr-FR", audience: "retail", address: { ...address, countryCode: "DE", postalCode: "10115", city: "Berlin" }, lines: [await cartLine()] });

    expect(quote.rates.map(({ carrier, amountCents, signatureRequired }) => [carrier, amountCents, signatureRequired])).toEqual([
      ["FedEx", 850, false], ["FedEx", 1_150, true],
    ]);
  });

  it("uses Mondial Relay Point Relais International for Zone 2 pickup delivery", async () => {
    useRealShippingEnvironment();
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/check-availability")) return new Response("true", { status: 200, headers: { "content-type": "application/json" } });
      if (url.includes("servicepoints.sendcloud.sc")) return new Response(JSON.stringify({ id: 10445088, is_active: true, name: "Berlin PaketShop", street: "Hauptstrasse", house_number: "1", postal_code: "10115", city: "Berlin", country: "DE", carrier: "mondial_relay", general_shop_type: "servicepoint" }), { status: 200 });
      expect(JSON.parse(String(init?.body))).toMatchObject({ carrier_code: "mondial_relay", functionalities: { last_mile: "service_point" }, to_service_point: { id: 10445088 } });
      return new Response(JSON.stringify({ data: [
        option({ code: "mondial_relay:service_point,international_dualapi_qr/c2c", carrierCode: "mondial_relay", carrier: "Mondial Relay", name: "Mondial Relay Point Relais International QR", lastMile: "service_point", amount: "6.10" }),
        option({ code: "mondial_relay:service_point,international_dualapi/c2c", carrierCode: "mondial_relay", carrier: "Mondial Relay", name: "Mondial Relay Point Relais International", lastMile: "service_point", amount: "6.25" }),
      ] }), { status: 200 });
    }));
    vi.resetModules();
    const { createShippingQuote } = await import("~/services/shipping.server");
    const quote = await createShippingQuote({ cartId: crypto.randomUUID(), locale: "fr-FR", audience: "retail", address: { ...address, countryCode: "DE", postalCode: "10115", city: "Berlin" }, pickupPointId: "10445088", lines: [await cartLine()] });

    expect(quote.rates).toHaveLength(1);
    expect(quote.rates[0]).toMatchObject({ provider: "sendcloud", carrier: "Mondial Relay", service: "Mondial Relay Point Relais International", deliveryMethod: "pickup", amountCents: 450, pickupPoint: { id: "10445088" } });
  });

  it("keeps only standard FedEx in Zone 4", async () => {
    useRealShippingEnvironment();
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ data: [
      option({ code: "fedex:internationalconnect", carrierCode: "fedex", carrier: "FedEx", name: "FedEx International Connect Plus", amount: "14.27" }),
      option({ code: "colissimo:international", carrierCode: "colissimo", carrier: "Colissimo", name: "Colissimo International", amount: "13.85", signature: true }),
    ] }), { status: 200 })));
    vi.resetModules();
    const { createShippingQuote } = await import("~/services/shipping.server");
    const quote = await createShippingQuote({ cartId: crypto.randomUUID(), locale: "fr-FR", audience: "retail", address: { ...address, countryCode: "CZ", postalCode: "11000", city: "Prague" }, lines: [await cartLine()] });

    expect(quote.rates).toHaveLength(1);
    expect(quote.rates[0]).toMatchObject({ provider: "sendcloud", carrier: "FedEx", amountCents: 1_190 });
  });

  it("keeps only Colissimo in Zone 5", async () => {
    useRealShippingEnvironment();
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ data: [
      option({ code: "colissimo:international", carrierCode: "colissimo", carrier: "Colissimo", name: "Colissimo International", amount: "16.19", signature: true }),
      option({ code: "fedex:internationalconnect", carrierCode: "fedex", carrier: "FedEx", name: "FedEx International Connect Plus", amount: "28.62" }),
    ] }), { status: 200 })));
    vi.resetModules();
    const { createShippingQuote } = await import("~/services/shipping.server");
    const quote = await createShippingQuote({ cartId: crypto.randomUUID(), locale: "fr-FR", audience: "retail", address: { ...address, countryCode: "CY", postalCode: "1010", city: "Nicosia" }, lines: [await cartLine()] });

    expect(quote.rates).toHaveLength(1);
    expect(quote.rates[0]).toMatchObject({ provider: "sendcloud", carrier: "Colissimo", amountCents: 1_650, signatureRequired: true });
  });

  it("returns only Mondial Relay pickup points and applies the Zone 1 price", async () => {
    useRealShippingEnvironment();
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/check-availability")) return new Response("true", { status: 200, headers: { "content-type": "application/json" } });
      if (url.includes("servicepoints.sendcloud.sc")) return new Response(JSON.stringify({ id: 10575092, is_active: true, name: "Café Relais", street: "rue Nationale", house_number: "1", postal_code: "37000", city: "Tours", country: "FR", carrier: "mondial_relay", general_shop_type: "servicepoint" }), { status: 200 });
      expect(JSON.parse(String(init?.body))).toMatchObject({ carrier_code: "mondial_relay", functionalities: { last_mile: "service_point" }, to_service_point: { id: 10575092 } });
      return new Response(JSON.stringify({ data: [option({ code: "mondial_relay:service_point", carrierCode: "mondial_relay", carrier: "Mondial Relay", name: "Point Relais", lastMile: "service_point", amount: "3.41" })] }), { status: 200 });
    }));
    vi.resetModules();
    const { createShippingQuote } = await import("~/services/shipping.server");
    const quote = await createShippingQuote({ cartId: crypto.randomUUID(), locale: "fr-FR", audience: "retail", address, pickupPointId: "10575092", lines: [await cartLine()] });

    expect(quote.rates).toHaveLength(1);
    expect(quote.rates[0]).toMatchObject({ carrier: "Mondial Relay", amountCents: 390, deliveryMethod: "pickup", pickupPoint: { id: "10575092" } });
  });

  it("hides non-Mondial Relay pickup points from the search results", async () => {
    useRealShippingEnvironment();
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify([
      { id: 1, is_active: true, name: "Relais MR", street: "Nationale", house_number: "1", postal_code: "37000", city: "Tours", country: "FR", carrier: "mondial_relay", general_shop_type: "servicepoint", distance: 100 },
      { id: 2, is_active: true, name: "Relais Colissimo", street: "Nationale", house_number: "2", postal_code: "37000", city: "Tours", country: "FR", carrier: "colissimo", general_shop_type: "post_office", distance: 50 },
    ]), { status: 200 })));
    vi.resetModules();
    const { searchPickupPoints } = await import("~/services/pickup-points.server");
    const points = await searchPickupPoints({ locale: "fr-FR", address: { line1: address.line1, postalCode: address.postalCode, city: address.city, countryCode: "FR" }, weightGrams: 500 });

    expect(points.map((point) => point.network)).toEqual(["mondial_relay"]);
  });
});
