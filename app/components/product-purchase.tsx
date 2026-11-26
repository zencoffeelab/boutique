import { Minus, Plus, ShoppingBag } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useCart } from "~/components/cart/cart-provider";
import { buildProductCartLine } from "~/domain/cart";
import { formatMoney } from "~/domain/money";
import type { Audience, Locale, Product } from "~/domain/types";
import { dictionary } from "~/lib/i18n";

export function ProductPurchase({ product, locale, audience = "retail" }: { product: Product; locale: Locale; audience?: Audience }) {
  const offerFor = (variant: Product["variants"][number]) =>
    variant.offers.find((offer) => offer.audience === audience && offer.active) ??
    (audience === "professional"
      ? variant.offers.find((offer) => offer.audience === "retail" && offer.active)
      : undefined);
  const variants = useMemo(() => product.variants
    .filter((variant) => Boolean(offerFor(variant)))
    .sort((left, right) => left.weightGrams - right.weightGrams), [audience, product.variants]);
  const firstAvailableVariant = variants.find((variant) => {
    const offer = offerFor(variant);
    return offer ? variant.stockOnHand - variant.stockReserved >= offer.minimumQuantity : false;
  });
  const [variantId, setVariantId] = useState(firstAvailableVariant?.id ?? variants[0]?.id ?? "");
  const [roast, setRoast] = useState<"filter" | "espresso">(product.showFilterRoastOption ? "filter" : "espresso");
  const [quantity, setQuantity] = useState(1);
  const [added, setAdded] = useState(false);
  const addedResetTimer = useRef<number | null>(null);
  const { addItem, hydrated } = useCart();
  const variant = variants.find((candidate) => candidate.id === variantId);
  const offer = variant ? offerFor(variant) : undefined;
  const available = variant ? variant.stockOnHand - variant.stockReserved : 0;
  const minimum = offer?.minimumQuantity ?? 1;
  const t = dictionary[locale];
  const hasRoastOptions = product.showFilterRoastOption || product.showEspressoRoastOption;
  useEffect(() => () => {
    if (addedResetTimer.current) window.clearTimeout(addedResetTimer.current);
  }, []);
  if (!variant || !offer) return <p>{t.soldOut}</p>;
  const add = () => {
    addItem(buildProductCartLine({ product, variant, offer, audience: offer.audience, quantity: Math.max(minimum, quantity) }));
    setAdded(true);
    if (addedResetTimer.current) window.clearTimeout(addedResetTimer.current);
    addedResetTimer.current = window.setTimeout(() => {
      setAdded(false);
      addedResetTimer.current = null;
    }, 2_000);
  };
  return (
    <section className="purchase-panel" aria-label={locale === "fr-FR" ? "Options d’achat" : "Purchase options"}>
      <p className="purchase-panel__label purchase-panel__label--quantity"><span>{locale === "fr-FR" ? "Quantité :" : "Quantity:"}</span><span className="quantity-stepper purchase-row__quantity-mobile" aria-label={t.quantity}><button type="button" onClick={() => setQuantity((value) => Math.max(minimum, value - 1))} aria-label="Moins"><Minus aria-hidden="true" /></button><output>{Math.max(minimum, quantity)}</output><button type="button" onClick={() => setQuantity((value) => Math.min(available, value + 1))} aria-label="Plus"><Plus aria-hidden="true" /></button></span></p>
      <div className="variant-selector" role="group" aria-label={t.weight}>
        {variants.map((candidate) => {
          const candidateOffer = offerFor(candidate)!;
          return <button key={candidate.id} className={candidate.id === variantId ? "is-selected" : undefined} type="button" onClick={() => { setVariantId(candidate.id); setQuantity(candidateOffer.minimumQuantity); setAdded(false); }}><span>{candidate.label}</span><strong>{formatMoney(candidateOffer.price.amount, locale)}</strong></button>;
        })}
      </div>
      {hasRoastOptions ? <>
        <p className="purchase-panel__label purchase-panel__label--roast">{locale === "fr-FR" ? "Torréfaction :" : "Roast:"}</p>
        <div className="variant-selector" role="group" aria-label={locale === "fr-FR" ? "Torréfaction" : "Roast"}>
          {product.showFilterRoastOption ? <button className={roast === "filter" ? "is-selected" : undefined} type="button" onClick={() => setRoast("filter")}>{locale === "fr-FR" ? "Filtre" : "Filter"}</button> : null}
          {product.showEspressoRoastOption ? <button className={roast === "espresso" ? "is-selected" : undefined} type="button" onClick={() => setRoast("espresso")}>Espresso</button> : null}
        </div>
      </> : null}
      <div className="purchase-row">
        <div className="quantity-stepper purchase-row__quantity-desktop" aria-label={t.quantity}>
          <button type="button" onClick={() => setQuantity((value) => Math.max(minimum, value - 1))} aria-label="Moins"><Minus aria-hidden="true" /></button>
          <output>{Math.max(minimum, quantity)}</output>
          <button type="button" onClick={() => setQuantity((value) => Math.min(available, value + 1))} aria-label="Plus"><Plus aria-hidden="true" /></button>
        </div>
        <button className="button button--dark purchase-button" type="button" onClick={add} disabled={!hydrated || available < minimum}>
          <ShoppingBag aria-hidden="true" />{available < minimum ? t.soldOut : added ? (locale === "fr-FR" ? "Ajouté !" : "Added!") : t.addToCart}
        </button>
      </div>
    </section>
  );
}
