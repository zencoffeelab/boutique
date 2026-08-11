import { afterEach, describe, expect, it, vi } from "vitest";

const address = { line1: "1 rue du Café", line2: "", postalCode: "37000", city: "Tours", countryCode: "FR" };

function point(input: Partial<Record<string, unknown>> = {}) {
  return {
    identifiant: "370000",
    nom: "Bureau de poste",
    adresse1: "1 rue Nationale",
    codePostal: "37000",
    localite: "Tours",
    codePays: "FR",
    typeDePoint: "BPR",
    reseau: "R01",
    distanceEnMetre: 300,
    poidsMaxi: 20_000,
    congesTotal: false,
    ...input,
  };
}

function configured() {
  vi.stubEnv("SHIPPING_MOCK", "false");
  vi.stubEnv("COLISSIMO_PICKUP_API_KEY", "pickup-key");
  vi.stubEnv("COLISSIMO_PICKUP_PARTNER_CLIENT_CODE", "123456");
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("Colissimo Point Retrait directory", () => {
  it("returns up to 12 compatible French points sorted by distance", async () => {
    configured();
    const points = Array.from({ length: 15 }, (_, index) => point({ identifiant: String(370000 + index), distanceEnMetre: 1_500 - index * 50 }));
    points.push(point({ identifiant: "380000", congesTotal: true }));
    points.push(point({ identifiant: "380001", poidsMaxi: 100 }));
    vi.stubGlobal("fetch", vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(JSON.parse(String(init?.body))).toMatchObject({ apiKey: "pickup-key", codTiersPourPartenaire: "123456", countryCode: "FR", optionInter: "0", weight: "500" });
      return new Response(JSON.stringify({ errorCode: 0, listePointRetraitAcheminement: points }), { status: 200 });
    }));
    const { searchPickupPoints } = await import("~/services/pickup-points.server");
    const result = await searchPickupPoints({ locale: "fr-FR", address, weightGrams: 500 });

    expect(result).toHaveLength(12);
    expect(result.map((item) => item.distanceMeters)).toEqual([...result.map((item) => item.distanceMeters)].sort((a, b) => Number(a) - Number(b)));
    expect(result.every((item) => item.countryCode === "FR" && item.maxWeightGrams! >= 500)).toBe(true);
  });

  it("uses optionInter for an EU destination", async () => {
    configured();
    vi.stubGlobal("fetch", vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(JSON.parse(String(init?.body))).toMatchObject({ countryCode: "DE", optionInter: "1", lang: "EN" });
      return new Response(JSON.stringify({ errorCode: 0, listePointRetraitAcheminement: [point({ identifiant: "101150", codePays: "DE", codePostal: "10115", localite: "Berlin" })] }), { status: 200 });
    }));
    const { searchPickupPoints } = await import("~/services/pickup-points.server");
    const result = await searchPickupPoints({ locale: "en-GB", address: { ...address, countryCode: "DE", postalCode: "10115", city: "Berlin" }, weightGrams: 500 });
    expect(result[0]).toMatchObject({ id: "101150", countryCode: "DE" });
  });

  it("revalidates point country, availability and maximum weight", async () => {
    configured();
    vi.stubGlobal("fetch", vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(JSON.parse(String(init?.body))).toMatchObject({ id: "370000", countryCode: "FR", optionInter: "0", weight: "1500" });
      return new Response(JSON.stringify({ errorCode: 0, pointRetraitAcheminement: point({ poidsMaxi: 1_000 }) }), { status: 200 });
    }));
    const { getPickupPointById } = await import("~/services/pickup-points.server");
    await expect(getPickupPointById({ id: "370000", locale: "fr-FR", countryCode: "FR", weightGrams: 1_500 })).rejects.toThrow("poids");
  });

  it("keeps pickup disabled without a Colissimo key while home delivery stays independent", async () => {
    vi.stubEnv("SHIPPING_MOCK", "false");
    vi.stubEnv("COLISSIMO_PICKUP_API_KEY", "");
    const { pickupPointsConfigured } = await import("~/services/pickup-points.server");
    expect(pickupPointsConfigured()).toBe(false);
  });
});
