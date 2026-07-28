import { Eye, X } from "lucide-react";
import { useId, useRef } from "react";
import { Link, useFetcher } from "react-router";
import { formatMoney } from "~/domain/money";
import type { Locale } from "~/domain/types";

type QuotePreviewLine = {
  id: string;
  product_name: string;
  variant_label: string;
  kilograms: number;
  discount_percent: number;
  discounted_price_cents_per_kg: number;
  line_total_cents: number;
};

type QuotePreview = {
  id: string;
  quote_number: string;
  status: string;
  total_weight_kg: number;
  subtotal_before_discount_cents: number;
  discount_cents: number;
  total_cents: number;
  valid_until: string;
  created_at: string;
  lines: QuotePreviewLine[];
};

type QuotePreviewResponse =
  | { ok: true; quote: QuotePreview }
  | { ok: false; message: string };

function quoteStatusLabel(status: string, english: boolean) {
  const labels: Record<string, [string, string]> = {
    pending_payment: ["À régler", "Awaiting payment"],
    bank_transfer_pending: ["Virement en attente", "Bank transfer pending"],
    paid: ["Payé", "Paid"],
    expired: ["Expiré", "Expired"],
    canceled: ["Annulé", "Cancelled"],
  };
  return labels[status]?.[english ? 1 : 0] ?? status;
}

export function ProfessionalQuotePreview({ quoteId, locale }: { quoteId: string; locale: Locale }) {
  const english = locale === "en-GB";
  const titleId = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const fetcher = useFetcher<QuotePreviewResponse>();
  const quote = fetcher.data?.ok ? fetcher.data.quote : null;
  const canPay = quote?.status === "pending_payment" && new Date(quote.valid_until).getTime() > Date.now();
  const paymentHref = `${english ? "/en/quotes" : "/devis"}/${quoteId}/${english ? "payment" : "paiement"}`;

  const openPreview = () => {
    dialogRef.current?.showModal();
    void fetcher.load(`/api/professional-quotes/${quoteId}/preview`);
  };

  return <>
    <button className="text-link quote-preview-trigger" type="button" onClick={openPreview}><Eye aria-hidden="true" />{english ? "Quick view" : "Voir le devis"}</button>
    <dialog
      ref={dialogRef}
      className="quote-preview-modal"
      aria-labelledby={titleId}
      onClick={(event) => { if (event.target === event.currentTarget) event.currentTarget.close(); }}
    >
      <div className="quote-preview-modal__panel">
        <header>
          <div><p className="eyebrow">Zen Coffee Lab</p><h2 id={titleId}>{english ? "Professional quote" : "Devis professionnel"}</h2></div>
          <form method="dialog"><button type="submit" aria-label={english ? "Close quote preview" : "Fermer l’aperçu du devis"}><X aria-hidden="true" /></button></form>
        </header>
        <div className="quote-preview-modal__content">
          {!fetcher.data ? <p className="quote-preview-modal__loading" role="status">{english ? "Loading quote…" : "Chargement du devis…"}</p> : null}
          {fetcher.data && !fetcher.data.ok ? <p className="form-message form-error" role="alert">{fetcher.data.message}</p> : null}
          {quote ? <>
            <div className="quote-preview-modal__meta">
              <div><span>{english ? "Quote" : "Devis"}</span><strong>{quote.quote_number}</strong></div>
              <div><span>Date</span><strong>{new Date(quote.created_at).toLocaleDateString(locale)}</strong></div>
              <div><span>{english ? "Valid until" : "Valable jusqu’au"}</span><strong>{new Date(quote.valid_until).toLocaleDateString(locale)}</strong></div>
              <div><span>{english ? "Status" : "Statut"}</span><strong>{quoteStatusLabel(quote.status, english)}</strong></div>
            </div>
            <div className="quote-preview-modal__table-wrap">
              <table className="ui-table">
                <thead><tr><th>{english ? "Coffee" : "Café"}</th><th>{english ? "Quantity" : "Quantité"}</th><th>{english ? "Price / kg" : "Prix / kg"}</th><th>{english ? "Discount" : "Remise"}</th><th>{english ? "Amount" : "Montant"}</th></tr></thead>
                <tbody>{quote.lines.map((line) => <tr key={line.id}><td><strong>{line.product_name}</strong><small>{line.variant_label}</small></td><td>{Number(line.kilograms).toLocaleString(locale)} kg</td><td>{formatMoney(line.discounted_price_cents_per_kg, locale)}</td><td>{line.discount_percent} %</td><td><strong>{formatMoney(line.line_total_cents, locale)}</strong></td></tr>)}</tbody>
              </table>
            </div>
            <dl className="quote-preview-modal__totals">
              <div><dt>{english ? "Subtotal before volume discount" : "Sous-total avant remise volume"}</dt><dd>{formatMoney(quote.subtotal_before_discount_cents, locale)}</dd></div>
              <div><dt>{english ? "Volume discount" : "Remise volume"}</dt><dd>–{formatMoney(quote.discount_cents, locale)}</dd></div>
              <div><dt>Total EUR</dt><dd>{formatMoney(quote.total_cents, locale)}</dd></div>
            </dl>
            <footer>
              <a className="ui-button ui-button--outline" href={`/api/professional-quotes/${quoteId}/pdf`}>{english ? "Download PDF" : "Télécharger le PDF"}</a>
              {canPay ? <Link className="ui-button ui-button--default" to={paymentHref}>{english ? "Pay quote" : "Régler le devis"}</Link> : null}
            </footer>
          </> : null}
        </div>
      </div>
    </dialog>
  </>;
}
