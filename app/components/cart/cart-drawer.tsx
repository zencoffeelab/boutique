import { CheckCircle2, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router";
import { useCart } from "~/components/cart/cart-provider";
import { formatMoney } from "~/domain/money";
import type { Audience, Locale } from "~/domain/types";

type PreviewLine = {
  productId: string;
  variantId: string;
  audience: Audience;
  quantity: number;
  productSlug: string;
  productName: string;
  variantLabel: string;
  unitPriceCents: number;
  availableStock: number;
  imageUrl: string;
};

type PreviewResponse = {
  ok: boolean;
  lines?: PreviewLine[];
  unavailableKeys?: string[];
  freeShippingFranceThresholdCents?: number;
  message?: string;
};

const lineKey = (line: Pick<PreviewLine, "variantId" | "audience">) => `${line.variantId}:${line.audience}`;
const CART_DRAWER_ANIMATION_MS = 280;

export function CartDrawer({ open, locale, onClose }: { open: boolean; locale: Locale; onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const { lines, hydrated, removeItem, addedNotification } = useCart();
  const [preview, setPreview] = useState<PreviewResponse>({ ok: true, lines: [], unavailableKeys: [] });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [closing, setClosing] = useState(false);
  const english = locale === "en-GB";

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open) {
      setClosing(false);
      if (!dialog.open) dialog.showModal();
      return;
    }

    if (!dialog.open) {
      setClosing(false);
      return;
    }

    setClosing(true);
    const closeTimer = window.setTimeout(() => {
      if (dialog.open) dialog.close();
      setClosing(false);
    }, CART_DRAWER_ANIMATION_MS);

    return () => window.clearTimeout(closeTimer);
  }, [open]);

  useEffect(() => {
    if (!open || !hydrated) return;
    if (lines.length === 0) {
      setPreview((current) => ({ ...current, ok: true, lines: [], unavailableKeys: [] }));
      setLoading(false);
      setError("");
      return;
    }
    if (lines.every((line) => line.preview)) {
      setPreview((current) => ({ ...current, ok: true, lines: [], unavailableKeys: [] }));
      setLoading(false);
      setError("");
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    setError("");
    fetch("/api/cart/preview", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ locale, lines }),
      signal: controller.signal,
    }).then(async (response) => {
      const data = await response.json() as PreviewResponse;
      if (!response.ok || !data.ok) throw new Error(data.message || (english ? "Unable to load your cart." : "Impossible de charger votre panier."));
      setPreview(data);
    }).catch((cause) => {
      if (cause instanceof DOMException && cause.name === "AbortError") return;
      setError(cause instanceof Error ? cause.message : String(cause));
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
  }, [english, hydrated, lines, locale, open]);

  const currentLinesByKey = useMemo(() => new Map(lines.map((line) => [lineKey(line), line])), [lines]);
  const cachedPreviewLines: PreviewLine[] = lines.flatMap((line) => line.preview ? [{
    productId: line.productId,
    variantId: line.variantId,
    audience: line.audience,
    quantity: line.quantity,
    productSlug: line.preview.productSlug,
    productName: line.preview.productNames[locale],
    variantLabel: line.preview.variantLabel,
    unitPriceCents: line.preview.unitPriceCents,
    availableStock: Number.POSITIVE_INFINITY,
    imageUrl: line.preview.imageUrl,
  }] : []);
  const previewLinesByKey = new Map(cachedPreviewLines.map((line) => [lineKey(line), line]));
  for (const line of preview.lines ?? []) previewLinesByKey.set(lineKey(line), line);
  const displayedLines = [...previewLinesByKey.values()].flatMap((line) => {
    const current = currentLinesByKey.get(lineKey(line));
    return current ? [{ ...line, quantity: current.quantity }] : [];
  });
  const unavailableKeys = (preview.unavailableKeys ?? []).filter((key) => currentLinesByKey.has(key));
  const subtotalCents = displayedLines.reduce((total, line) => total + line.unitPriceCents * line.quantity, 0);
  const thresholdCents = preview.freeShippingFranceThresholdCents ?? 7_500;
  const remainingCents = Math.max(0, thresholdCents - subtotalCents);
  const hasIssue = unavailableKeys.length > 0 || displayedLines.some((line) => line.quantity > line.availableStock);
  const paths = locale === "fr-FR"
    ? { shop: "/boutique", cart: "/panier", checkout: "/commande", product: "/boutique/" }
    : { shop: "/en/shop", cart: "/en/cart", checkout: "/en/checkout", product: "/en/shop/" };

  return (
    <dialog id="cart-drawer" ref={dialogRef} className={`cart-drawer${closing ? " is-closing" : ""}`} aria-labelledby="cart-drawer-title" onClose={onClose} onCancel={(event) => { event.preventDefault(); onClose(); }} onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="cart-drawer__panel">
        <header className="cart-drawer__header">
          <div><p className="eyebrow">Zen Coffee Lab</p><h2 id="cart-drawer-title">{english ? "Your cart" : "Votre panier"}</h2></div>
          <button className="icon-button" type="button" onClick={onClose} aria-label={english ? "Close cart" : "Fermer le panier"} autoFocus><X aria-hidden="true" /></button>
        </header>

        {addedNotification || lines.length > 0 ? <div className="cart-drawer__messages">
          {addedNotification ? <div className="cart-drawer__added-message" role="status" aria-live="polite" aria-atomic="true"><CheckCircle2 aria-hidden="true" /><span><strong>{english ? "Added to cart" : "Ajouté au panier"}</strong><small>{addedNotification.productName}{addedNotification.variantLabel ? ` · ${addedNotification.variantLabel}` : ""}</small></span></div> : null}
          {lines.length > 0 ? <p className="cart-drawer__shipping-message">{remainingCents === 0
            ? (english ? "Congratulations! You qualify for free delivery in France." : "Félicitations ! La livraison en France vous est offerte.")
            : (english ? `${formatMoney(remainingCents, locale)} left for free delivery in France.` : `Plus que ${formatMoney(remainingCents, locale)} pour la livraison offerte en France.`)}</p> : null}
        </div> : null}

        <div className="cart-drawer__content">
          {loading && !displayedLines.length ? <p className="cart-drawer__status">{english ? "Loading your cart…" : "Chargement du panier…"}</p> : null}
          {error ? <p className="form-message form-error" role="alert">{error}</p> : null}
          {!loading && !error && lines.length === 0 ? <div className="cart-drawer__empty"><p>{english ? "Your cart is waiting for a great coffee." : "Votre panier attend un bon café."}</p><Link className="button button--light" to={paths.shop} onClick={onClose}>{english ? "Browse coffees" : "Voir les cafés"}</Link></div> : null}
          <div className="cart-drawer__lines" aria-live="polite">
            {displayedLines.map((line) => <article className="cart-drawer-line" key={lineKey(line)}>
              <Link to={`${paths.product}${line.productSlug}`} onClick={onClose} tabIndex={-1} aria-hidden="true"><img src={line.imageUrl} alt="" width="88" height="88" /></Link>
              <div><Link className="cart-drawer-line__name" to={`${paths.product}${line.productSlug}`} onClick={onClose}>{line.productName} – {line.variantLabel}</Link><p>{english ? "Quantity" : "Quantité"} : {line.quantity}</p>{line.quantity > line.availableStock ? <p className="cart-drawer-line__warning">{english ? `Only ${line.availableStock} available.` : `Seulement ${line.availableStock} disponible${line.availableStock > 1 ? "s" : ""}.`}</p> : null}<strong>{formatMoney(line.unitPriceCents * line.quantity, locale)}</strong></div>
              <button className="cart-drawer-line__remove" type="button" onClick={() => removeItem(line.variantId, line.audience)} aria-label={english ? `Remove ${line.productName}` : `Supprimer ${line.productName}`}><Trash2 aria-hidden="true" /></button>
            </article>)}
            {unavailableKeys.map((key) => {
              const line = currentLinesByKey.get(key)!;
              return <article className="cart-drawer-line cart-drawer-line--unavailable" key={key}><div><strong>{english ? "Unavailable item" : "Article indisponible"}</strong><p>{english ? "Remove this item to continue." : "Retirez cet article pour continuer."}</p></div><button className="cart-drawer-line__remove" type="button" onClick={() => removeItem(line.variantId, line.audience)} aria-label={english ? "Remove unavailable item" : "Supprimer l’article indisponible"}><Trash2 aria-hidden="true" /></button></article>;
            })}
          </div>
        </div>

        {lines.length > 0 ? <footer className="cart-drawer__footer">
          <div className="cart-drawer__subtotal"><span>{english ? "Subtotal" : "Sous-total"}</span><strong>{formatMoney(subtotalCents, locale)}</strong></div>
          <Link className="button button--dark" to={hasIssue ? paths.cart : paths.checkout} onClick={onClose}>{hasIssue ? (english ? "Update cart" : "Mettre le panier à jour") : (english ? "Continue to checkout" : "Passer la commande")}</Link>
          <Link className="cart-drawer__cart-link" to={paths.cart} onClick={onClose}>{english ? "View full cart" : "Voir le panier complet"}</Link>
        </footer> : null}
      </div>
    </dialog>
  );
}
