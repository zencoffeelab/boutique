import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { createMemoryRouter, RouterProvider } from "react-router";
import { DEFAULT_SHIPPING_PRICE_RULE } from "~/domain/shipping-pricing";
import { canDeletePackagingPreset, ShippingHelp, ShippingPriceRuleForm } from "~/routes/admin-shipping";

const preset = {
  id: "00000000-0000-4000-8000-000000000001",
  name: "Carton S",
  max_net_weight_grams: 1_000,
  tare_weight_grams: 180,
  length_cm: 24,
  width_cm: 18,
  height_cm: 10,
  active: true,
};

describe("shipping administration", () => {
  it("keeps at least one active packaging preset", () => {
    expect(canDeletePackagingPreset(true, 1)).toBe(false);
    expect(canDeletePackagingPreset(true, 2)).toBe(true);
    expect(canDeletePackagingPreset(false, 1)).toBe(true);
  });

  it("documents packaging, free shipping and label purchase in the help dialog", () => {
    const html = renderToStaticMarkup(<ShippingHelp presets={[preset]} thresholds={{ fr: 7_500, euUk: 15_000 }} pricingRule={DEFAULT_SHIPPING_PRICE_RULE} />);

    expect(html).toContain("Comprendre les emballages et le franco");
    expect(html).toContain("Carton S");
    expect(html).toContain("75");
    expect(html).toContain("150");
    expect(html).toContain("Générer les étiquettes Colissimo");
    expect(html).toContain("webhook signé");
    expect(html).toContain("numéro définitif");
    expect(html).toContain("réduction progressive");
    expect(html).toContain("10 %");
    expect(html).toContain("25 %");
    expect(html).toContain("23");
    expect(html).toContain("terminaison ,00 €");
    expect(html).toContain("Shippo");
    expect(html).toContain("Point Retrait");
    expect(html).not.toContain("Royaume-Uni");
  });

  it("shows every editable pricing bound and the four EU zones", () => {
    const router = createMemoryRouter([{ path: "/", element: <ShippingPriceRuleForm rule={DEFAULT_SHIPPING_PRICE_RULE} demo={false} /> }]);
    const html = renderToStaticMarkup(<RouterProvider router={router} />);

    expect(html).toContain('name="minimumWeightKg"');
    expect(html).toContain('name="maximumWeightKg"');
    expect(html).toContain('name="minimumDiscount"');
    expect(html).toContain('name="maximumDiscount"');
    expect(html).toContain('name="minimumDiscountPercent"');
    expect(html).toContain('name="maximumDiscountPercent"');
    expect(html).toContain("Zone 1");
    expect(html).toContain("Zone 4");
    expect(html).toContain("France");
    expect(html).toContain("Chypre");
    expect(html).toContain("Malte");
    expect(html).toContain("Enregistrer la règle");
  });
});
