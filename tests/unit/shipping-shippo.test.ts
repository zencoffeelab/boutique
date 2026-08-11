import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("~/lib/catalog.server", async () => {
  const actual = await vi.importActual<typeof import("~/lib/catalog.server")>("~/lib/catalog.server");
  return {
    ...actual,
    getPackagingPresets: async () => [{
      id: "test-box",
      name: "Carton test",
      maxNetWeightGrams: 1_000,
      tareWeightGrams: 180,
      lengthCm: 24,
      widthCm: 18,
      heightCm: 10,
      active: true,
    }],
  };
});

const address = {
  firstName: "Ada",
  lastName: "Lovelace",
  company: "",
  email: "ada@example.com",
  phone: "+33600000000",
  line1: "1 rue du Café",
  line2: "",
  postalCode: "37000",
  city: "Tours",
  countryCode: "FR",
};

async function cartLine(quantity = 1) {
  const { getProducts } = await import("~/lib/catalog.server");
  const product = (await getProducts({ status: "published" }))[0];
  return { productId: product.id, variantId: product.variants[0].id, audience: "retail" as const, quantity };
}

function useRealShippingEnvironment(freeThreshold = 999_999) {
  vi.stubEnv("SHIPPING_MOCK", "false");
  vi.stubEnv("SHIPPO_API_TOKEN", "shippo_test_token");
  vi.stubEnv("SHIP_FROM_STREET1", "10 rue du Café");
  vi.stubEnv("SHIP_FROM_POSTAL_CODE", "37000");
  vi.stubEnv("SHIP_FROM_PHONE", "+33200000000");
  vi.stubEnv("FREE_SHIPPING_FR_CENTS", String(freeThreshold));
  vi.stubEnv("FREE_SHIPPING_EU_UK_CENTS", String(freeThreshold));
  vi.stubEnv("VITE_SUPABASE_URL", "");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
}

function shippoFetch(amounts: number[]) {
  let shipmentIndex = 0;
  const shipmentBodies: any[] = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes("/carrier_accounts")) {
      return new Response(JSON.stringify({
        carrier: "colissimo",
        object_id: "colissimo-account",
        active: true,
        test: true,
        is_shippo_account: true,
      }), { status: 200 });
    }
    if (url.endsWith("/shipments/")) {
      const body = JSON.parse(String(init?.body));
      shipmentBodies.push(body);
      const token = body.extra.location_external_id
        ? "colissimo_pick_up_point"
        : body.address_to.country === "FR"
          ? "colissimo_home"
          : "colissimo_international_expert";
      const amount = amounts[shipmentIndex] ?? amounts.at(-1) ?? 0;
      shipmentIndex += 1;
      return new Response(JSON.stringify({
        object_id: `shipment-${shipmentIndex}`,
        status: "SUCCESS",
        rates: [
          { object_id: `ignored-${shipmentIndex}`, amount: "1.00", currency: "EUR", provider: "Colissimo", servicelevel: { token: "colissimo_home_c2c", name: "C2C" } },
          { object_id: `rate-${shipmentIndex}`, amount: (amount / 100).toFixed(2), currency: "EUR", provider: "Colissimo", estimated_days: body.address_to.country === "FR" ? 2 : 5, servicelevel: { token, name: token } },
          { object_id: `usd-${shipmentIndex}`, amount: "0.50", currency: "USD", provider: "Colissimo", servicelevel: { token, name: token } },
        ],
      }), { status: 201 });
    }
    throw new Error(`Unexpected request: ${url}`);
  });
  return { fetchMock, shipmentBodies };
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("Shippo Colissimo shipping quotes", () => {
  it("selects only Colissimo Domicile in France and keeps private IDs server-side", async () => {
    useRealShippingEnvironment();
    const { fetchMock, shipmentBodies } = shippoFetch([887]);
    vi.stubGlobal("fetch", fetchMock);
    const { createShippingQuote, publicQuote } = await import("~/services/shipping.server");
    const quote = await createShippingQuote({ cartId: crypto.randomUUID(), locale: "fr-FR", audience: "retail", address, lines: [await cartLine()] });

    expect(quote.rates[0]).toMatchObject({
      provider: "shippo",
      carrier: "Colissimo",
      service: "Domicile",
      serviceToken: "colissimo_home",
      amountCents: 750,
      shippoRateIds: ["rate-1"],
    });
    expect(shipmentBodies[0]).toMatchObject({ carrier_accounts: ["colissimo-account"], address_to: { country: "FR" }, async: false });
    expect(publicQuote(quote).rates[0]).not.toHaveProperty("shippoRateIds");
    expect(publicQuote(quote).rates[0]).not.toHaveProperty("shippoShipmentIds");
    expect(publicQuote(quote).rates[0]).not.toHaveProperty("serviceToken");
  });

  it("uses International Expert in another EU country and applies free shipping", async () => {
    useRealShippingEnvironment(0);
    const { fetchMock } = shippoFetch([1_423]);
    vi.stubGlobal("fetch", fetchMock);
    const { createShippingQuote } = await import("~/services/shipping.server");
    const quote = await createShippingQuote({
      cartId: crypto.randomUUID(),
      locale: "en-GB",
      audience: "retail",
      address: { ...address, countryCode: "DE", postalCode: "10115", city: "Berlin" },
      lines: [await cartLine()],
    });

    expect(quote.rates[0]).toMatchObject({
      service: "International Expert",
      serviceToken: "colissimo_international_expert",
      amountCents: 0,
      freeShippingApplied: true,
      signatureRequired: true,
    });
  });

  it("creates one Shippo shipment per parcel, aggregates the real amounts and applies the commercial rule", async () => {
    useRealShippingEnvironment();
    const { fetchMock } = shippoFetch([650, 725]);
    vi.stubGlobal("fetch", fetchMock);
    const { createShippingQuote } = await import("~/services/shipping.server");
    const quote = await createShippingQuote({ cartId: crypto.randomUUID(), locale: "fr-FR", audience: "retail", address, lines: [await cartLine(6)] });

    expect(quote.parcels).toHaveLength(2);
    expect(quote.rates[0]).toMatchObject({ amountCents: 1_200, shippoRateIds: ["rate-1", "rate-2"] });
    expect(fetchMock.mock.calls.filter(([input]) => String(input).includes("/carrier_accounts"))).toHaveLength(1);
    expect(fetchMock.mock.calls.filter(([input]) => String(input).endsWith("/shipments/"))).toHaveLength(2);
  });
});
