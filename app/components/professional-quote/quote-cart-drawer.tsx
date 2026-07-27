import { FileText, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { useQuoteCart } from "~/components/professional-quote/quote-cart-provider";
import { discountedProfessionalPrice } from "~/domain/professional-quote";
import { formatMoney } from "~/domain/money";
import type { Locale } from "~/domain/types";

export function QuoteCartDrawer({ locale }: { locale: Locale }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const { lines, drawerOpen, closeDrawer, updateKilograms, removeLine, clear } = useQuoteCart();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const navigate = useNavigate();
  const english = locale === "en-GB";
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (drawerOpen && !dialog.open) dialog.showModal();
    if (!drawerOpen && dialog.open) dialog.close();
  }, [drawerOpen]);
  const totalCents = lines.reduce((total, line) => total + discountedProfessionalPrice(line.basePriceCentsPerKg, line.kilograms).totalCents, 0);
  const getQuote = async () => {
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch("/api/professional-quotes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ locale, lines: lines.map(({ productId, variantId, kilograms }) => ({ productId, variantId, kilograms })) }),
      });
      const data = await response.json() as { ok?: boolean; accountUrl?: string; message?: string };
      if (!response.ok || !data.ok || !data.accountUrl) throw new Error(data.message || (english ? "Unable to generate the quote." : "Impossible de générer le devis."));
      clear();
      closeDrawer();
      navigate(data.accountUrl);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSubmitting(false);
    }
  };
  return <dialog id="quote-cart-drawer" ref={dialogRef} className="cart-drawer quote-cart-drawer" aria-labelledby="quote-cart-title" onClose={closeDrawer} onCancel={closeDrawer} onClick={(event) => { if (event.target === event.currentTarget) closeDrawer(); }}>
    <div className="cart-drawer__panel">
      <header className="cart-drawer__header"><div><p className="eyebrow">B2B · Zen Coffee Lab</p><h2 id="quote-cart-title">{english ? "Your quote basket" : "Votre panier de devis"}</h2></div><button className="icon-button" type="button" onClick={closeDrawer} aria-label={english ? "Close quote basket" : "Fermer le panier de devis"} autoFocus><X aria-hidden="true" /></button></header>
      <p className="cart-drawer__shipping-message">{english ? "Volume discounts are calculated separately for each coffee: 10%, 20%, then 30%." : "Les remises sont calculées séparément pour chaque café : 10 %, 20 %, puis 30 %."}</p>
      <div className="cart-drawer__content">
        {error ? <p className="form-message form-error" role="alert">{error}</p> : null}
        {lines.length === 0 ? <div className="cart-drawer__empty"><FileText aria-hidden="true" /><p>{english ? "Your quote basket is empty." : "Votre panier de devis est vide."}</p></div> : null}
        <div className="cart-drawer__lines">
          {lines.map((line) => { const price = discountedProfessionalPrice(line.basePriceCentsPerKg, line.kilograms); return <article className="cart-drawer-line quote-cart-line" key={line.productId}>
            <img src={line.imageUrl} alt="" width="88" height="88" />
            <div><strong>{line.productNames[locale]}</strong><label><span>{english ? "Kilograms" : "Kilogrammes"}</span><input type="number" min="1" max={Math.floor(line.availableKilograms)} value={line.kilograms} onChange={(event) => updateKilograms(line.productId, Number(event.currentTarget.value))} /></label><p>{price.discountPercent > 0 ? `–${price.discountPercent} % · ` : ""}{formatMoney(price.totalCents, locale)}</p></div>
            <button className="cart-drawer-line__remove" type="button" onClick={() => removeLine(line.productId)} aria-label={english ? `Remove ${line.productNames[locale]}` : `Supprimer ${line.productNames[locale]}`}><Trash2 aria-hidden="true" /></button>
          </article>; })}
        </div>
      </div>
      {lines.length > 0 ? <footer className="cart-drawer__footer"><div className="cart-drawer__subtotal"><span>{english ? "Estimated total" : "Total estimé"}</span><strong>{formatMoney(totalCents, locale)}</strong></div><button className="button button--dark" type="button" onClick={getQuote} disabled={submitting}>{submitting ? (english ? "Generating…" : "Génération…") : (english ? "Get my quote" : "Obtenir mon devis")}</button><small>{english ? "The final price is recalculated securely when the PDF is generated." : "Le tarif final est recalculé de façon sécurisée lors de la génération du PDF."}</small></footer> : null}
    </div>
  </dialog>;
}
