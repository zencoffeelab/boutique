export type ProductRibbon = "new" | "last-stock" | "sold-out" | "back-soon";

export function getProductRibbons({
  stockOnHandGrams,
  stockReservedGrams,
  ribbonNew,
  ribbonBackSoon,
}: {
  stockOnHandGrams: number;
  stockReservedGrams: number;
  ribbonNew: boolean;
  ribbonBackSoon: boolean;
}): ProductRibbon[] {
  const availableGrams = Math.max(0, stockOnHandGrams - stockReservedGrams);
  const ribbons: ProductRibbon[] = [];
  if (ribbonNew) ribbons.push("new");
  if (availableGrams === 0) {
    ribbons.push("sold-out");
    if (ribbonBackSoon) ribbons.push("back-soon");
  } else if (availableGrams < 1_000) {
    ribbons.push("last-stock");
  }
  return ribbons;
}
