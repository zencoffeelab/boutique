import type { ShippingRate } from "./types";

export function shippingRateLabel(rate: Pick<ShippingRate, "deliveryMethod">, locale: string = "fr-FR") {
  const method = rate.deliveryMethod === "pickup"
    ? (locale === "en-GB" ? "Pickup Point" : "Point Retrait")
    : (locale === "en-GB" ? "Home Delivery" : "Domicile");
  return `Colissimo — ${method}`;
}

export function shippingRatePromotionLabel(rate: Pick<ShippingRate, "freeShippingApplied">, locale: string) {
  if (!rate.freeShippingApplied) return null;
  return locale === "en-GB" ? "Free" : "Offert";
}
