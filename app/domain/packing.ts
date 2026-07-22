import type { PackedParcel, PackagingPreset, ResolvedCartLine } from "./types";

type Unit = Readonly<{ variantId: string; weightGrams: number }>;

export function packCartByWeight(
  lines: readonly Pick<ResolvedCartLine, "variantId" | "quantity" | "unitWeightGrams">[],
  presets: readonly PackagingPreset[],
): PackedParcel[] {
  const activePresets = presets
    .filter((preset) => preset.active)
    .toSorted((a, b) => a.maxNetWeightGrams - b.maxNetWeightGrams);

  if (activePresets.length === 0) {
    throw new Error("No active packaging preset is configured.");
  }

  const maxPreset = activePresets.at(-1)!;
  const units: Unit[] = [];
  for (const line of lines) {
    if (!Number.isSafeInteger(line.quantity) || line.quantity <= 0) {
      throw new RangeError("Every cart line must have a positive integer quantity.");
    }
    if (!Number.isSafeInteger(line.unitWeightGrams) || line.unitWeightGrams <= 0) {
      throw new RangeError("Every cart line must have a positive integer weight.");
    }
    if (line.unitWeightGrams > maxPreset.maxNetWeightGrams) {
      throw new Error(`Variant ${line.variantId} is heavier than every packaging preset.`);
    }
    for (let index = 0; index < line.quantity; index += 1) {
      units.push({ variantId: line.variantId, weightGrams: line.unitWeightGrams });
    }
  }

  units.sort((a, b) => b.weightGrams - a.weightGrams || a.variantId.localeCompare(b.variantId));

  const bins: Array<{ units: Unit[]; netWeightGrams: number }> = [];
  for (const unit of units) {
    const existing = bins.find(
      (bin) => bin.netWeightGrams + unit.weightGrams <= maxPreset.maxNetWeightGrams,
    );
    if (existing) {
      existing.units.push(unit);
      existing.netWeightGrams += unit.weightGrams;
    } else {
      bins.push({ units: [unit], netWeightGrams: unit.weightGrams });
    }
  }

  return bins.map((bin) => {
    const preset =
      activePresets.find((candidate) => candidate.maxNetWeightGrams >= bin.netWeightGrams) ??
      maxPreset;
    const quantityByVariant = new Map<string, { quantity: number; unitWeightGrams: number }>();
    for (const unit of bin.units) {
      const current = quantityByVariant.get(unit.variantId);
      quantityByVariant.set(unit.variantId, {
        quantity: (current?.quantity ?? 0) + 1,
        unitWeightGrams: unit.weightGrams,
      });
    }
    return {
      presetId: preset.id,
      presetName: preset.name,
      netWeightGrams: bin.netWeightGrams,
      shippingWeightGrams: bin.netWeightGrams + preset.tareWeightGrams,
      lengthCm: preset.lengthCm,
      widthCm: preset.widthCm,
      heightCm: preset.heightCm,
      lines: [...quantityByVariant.entries()].map(([variantId, value]) => ({
        variantId,
        ...value,
      })),
    };
  });
}
