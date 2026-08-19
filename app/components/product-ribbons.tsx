import type { CSSProperties } from "react";
import type { Product } from "~/domain/types";
import { getProductRibbons, type ProductRibbon as ProductRibbonKind } from "~/lib/product-ribbons";

const labels: Record<ProductRibbonKind, { fr: string; en: string }> = {
  new: { fr: "Nouveau", en: "New" },
  "last-stock": { fr: "Derniers stocks", en: "Last stock" },
  "sold-out": { fr: "Rupture de stock", en: "Out of stock" },
  "back-soon": { fr: "De retour bientôt", en: "Back soon" },
};

export function ProductRibbons({ product, locale }: { product: Product; locale: "fr-FR" | "en-GB" }) {
  const ribbons = getProductRibbons(product);
  if (ribbons.length === 0) return null;
  return <div className="product-ribbons" style={{ "--product-ribbon-color": product.thumbnailBackgroundColor } as CSSProperties} aria-label={locale === "fr-FR" ? "Statut du café" : "Coffee status"}>
    {ribbons.map((ribbon) => <span className={`product-ribbon product-ribbon--${ribbon}`} key={ribbon}>{labels[ribbon][locale === "fr-FR" ? "fr" : "en"]}</span>)}
  </div>;
}
