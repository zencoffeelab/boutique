export type ProductRibbon = "new" | "last-stock" | "sold-out" | "back-soon";

export function isProductSoldOut(stockOnHandGrams: number, status: "draft" | "published" | "archived") {
  return status !== "archived" && stockOnHandGrams <= 0;
}

export function getProductRibbons({
  stockOnHandGrams,
  ribbonNew,
  ribbonBackSoon,
}: {
  stockOnHandGrams: number;
  ribbonNew: boolean;
  ribbonBackSoon: boolean;
}): ProductRibbon[] {
  const ribbons: ProductRibbon[] = [];
  if (ribbonNew) ribbons.push("new");
  if (stockOnHandGrams <= 0) {
    ribbons.push("sold-out");
    if (ribbonBackSoon) ribbons.push("back-soon");
  } else if (stockOnHandGrams < 1_000) {
    ribbons.push("last-stock");
  }
  return ribbons;
}
