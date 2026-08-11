import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { canDeletePackagingPreset, ShippingHelp } from "~/routes/admin-shipping";

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
    const html = renderToStaticMarkup(<ShippingHelp presets={[preset]} thresholds={{ fr: 7_500, euUk: 15_000 }} />);

    expect(html).toContain("Comprendre les emballages et le franco");
    expect(html).toContain("Carton S");
    expect(html).toContain("75");
    expect(html).toContain("150");
    expect(html).toContain("Acheter les étiquettes");
    expect(html).toContain("grille commerciale");
    expect(html).toContain("Royaume-Uni");
  });
});
