import { FilePlus2 } from "lucide-react";
import { useState } from "react";
import { useQuoteCart } from "~/components/professional-quote/quote-cart-provider";
import { discountedProfessionalPrice, getProfessionalQuoteVariant } from "~/domain/professional-quote";
import type { Locale, Product } from "~/domain/types";
import { formatMoney } from "~/domain/money";

export function ProfessionalQuoteAdd({ product, locale }: { product: Product; locale: Locale }) {
  const selection = getProfessionalQuoteVariant(product);
  const availableKilograms = Math.max(0, Math.floor(product.professionalStockKg - product.professionalStockReservedKg));
  const [kilograms, setKilograms] = useState(1);
  const { addLine, hydrated, openDrawer } = useQuoteCart();
  const english = locale === "en-GB";
  if (!selection || availableKilograms < 1) return <p className="stock-note">{english ? "Unavailable for professional quotes" : "Indisponible pour les devis professionnels"}</p>;
  const estimate = discountedProfessionalPrice(selection.basePriceCentsPerKg, kilograms);
  const add = () => {
    addLine({
      productId: product.id,
      variantId: selection.variant.id,
      kilograms,
      productSlug: product.slug,
      productNames: {
        "fr-FR": product.translations["fr-FR"].name,
        "en-GB": product.translations["en-GB"].name,
      },
      variantLabel: selection.variant.label,
      basePriceCentsPerKg: selection.basePriceCentsPerKg,
      availableKilograms,
      imageUrl: product.media[0]?.url ?? "",
    });
    openDrawer();
  };
  return <div className="professional-quote-add">
    <div className="professional-quote-add__price"><span>{english ? "Base price" : "Prix de base"}</span><strong>{formatMoney(selection.basePriceCentsPerKg, locale)} / kg</strong></div>
    <label><span>{english ? "Quantity (kg)" : "Quantité (kg)"}</span><input type="number" min="1" max={availableKilograms} step="1" value={kilograms} onChange={(event) => setKilograms(Math.min(availableKilograms, Math.max(1, Math.floor(Number(event.currentTarget.value) || 1))))} /></label>
    <p>{estimate.discountPercent > 0 ? (english ? `${estimate.discountPercent}% volume discount applied` : `Remise volume de ${estimate.discountPercent} % appliquée`) : (english ? "10% off from 10 kg" : "–10 % à partir de 10 kg")}</p>
    <button className="button button--dark" type="button" onClick={add} disabled={!hydrated}><FilePlus2 aria-hidden="true" />{english ? "Add to quote" : "Ajouter au devis"}</button>
  </div>;
}
