import { Minus, Plus, ShoppingBag } from "lucide-react";
import { useMemo, useState } from "react";
import { useCart } from "~/components/cart/cart-provider";
import { formatMoney } from "~/domain/money";
import type { Audience, Locale, Product } from "~/domain/types";
import { dictionary } from "~/lib/i18n";

export function ProductPurchase({ product, locale, audience = "retail" }: { product: Product; locale: Locale; audience?: Audience }) {
  const variants = useMemo(() => product.variants.filter((variant) => variant.offers.some((offer) => offer.audience === audience && offer.active)), [audience, product.variants]);
  const [variantId, setVariantId] = useState(variants[0]?.id ?? "");
  const [quantity, setQuantity] = useState(1);
  const [added, setAdded] = useState(false);
  const { addItem, hydrated } = useCart();
  const variant = variants.find((candidate) => candidate.id === variantId);
  const offer = variant?.offers.find((candidate) => candidate.audience === audience && candidate.active);
  const available = variant ? variant.stockOnHand - variant.stockReserved : 0;
  const minimum = offer?.minimumQuantity ?? 1;
  const t = dictionary[locale];
  if (!variant || !offer) return <p>{t.soldOut}</p>;
  const add = () => {
    addItem({ productId: product.id, variantId: variant.id, audience, quantity: Math.max(minimum, quantity) });
    setAdded(true);
  };
  return (
    <section className="purchase-panel" aria-label={locale === "fr-FR" ? "Options d’achat" : "Purchase options"}>
      <div className="variant-selector" role="group" aria-label={t.weight}>
        {variants.map((candidate) => {
          const candidateOffer = candidate.offers.find((item) => item.audience === audience && item.active)!;
          return <button key={candidate.id} className={candidate.id === variantId ? "is-selected" : undefined} type="button" onClick={() => { setVariantId(candidate.id); setQuantity(candidateOffer.minimumQuantity); setAdded(false); }}><span>{candidate.label}</span><strong>{formatMoney(candidateOffer.price.amount, locale)}</strong></button>;
        })}
      </div>
      <div className="purchase-row">
        <div className="quantity-stepper" aria-label={t.quantity}>
          <button type="button" onClick={() => setQuantity((value) => Math.max(minimum, value - 1))} aria-label="Moins"><Minus aria-hidden="true" /></button>
          <output>{Math.max(minimum, quantity)}</output>
          <button type="button" onClick={() => setQuantity((value) => Math.min(available, value + 1))} aria-label="Plus"><Plus aria-hidden="true" /></button>
        </div>
        <button className="button button--dark purchase-button" type="button" onClick={add} disabled={!hydrated || available < minimum}>
          <ShoppingBag aria-hidden="true" />{available < minimum ? t.soldOut : added ? (locale === "fr-FR" ? "Ajouté !" : "Added!") : t.addToCart}
        </button>
      </div>
      <p className="stock-note">{available} {locale === "fr-FR" ? "unités disponibles" : "units available"}{minimum > 1 ? ` · minimum ${minimum}` : ""}</p>
    </section>
  );
}
