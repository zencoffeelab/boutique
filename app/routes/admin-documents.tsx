import {
  Download,
  Eye,
  FileText,
  Plus,
  Receipt,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { Form, Link, useLoaderData } from "react-router";
import { AdminShell } from "~/components/admin-shell";
import { Badge } from "~/components/ui/badge";
import { Card, CardContent, CardHeader } from "~/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import { formatMoney } from "~/domain/money";
import { requireAdmin } from "~/lib/auth.server";
import { createServiceSupabase } from "~/lib/supabase.server";

type DocumentType = "invoice" | "quote";
type DocumentStatus =
  | "issued"
  | "pending_payment"
  | "bank_transfer_pending"
  | "paid"
  | "expired"
  | "canceled";

type AdminDocumentLine = {
  label: string;
  quantity: number;
  unitCents: number;
  totalCents: number;
  discountPercent?: number;
};
type AdminDocumentPreview = {
  addressLines: string[];
  lines: AdminDocumentLine[];
  shippingCents: number;
  subtotalCents: number;
  discountCents: number;
  validUntil: string | null;
};

type AdminDocument = {
  id: string;
  type: DocumentType;
  label: string;
  number: string;
  date: string;
  customer: string;
  email: string;
  status: DocumentStatus;
  totalCents: number;
  weightKg: number | null;
  paidAt: string | null;
  pdfHref: string;
  preview: AdminDocumentPreview;
};

const DOCUMENT_DATE_FORMATTER = new Intl.DateTimeFormat("fr-FR", {
  dateStyle: "medium",
  timeStyle: "short",
});
const quoteStatuses: DocumentStatus[] = [
  "pending_payment",
  "bank_transfer_pending",
  "paid",
  "expired",
  "canceled",
];

function includesSearch(document: AdminDocument, query: string) {
  if (!query) return true;
  const normalized = query.toLocaleLowerCase("fr-FR");
  return [
    document.number,
    document.customer,
    document.email,
    document.type === "invoice" ? "facture" : "devis",
  ].some((value) => value.toLocaleLowerCase("fr-FR").includes(normalized));
}

function customerName(input: {
  first_name?: string | null;
  last_name?: string | null;
  company_name?: string | null;
  email: string;
}) {
  return (
    [
      input.company_name,
      [input.first_name, input.last_name].filter(Boolean).join(" "),
    ]
      .filter(Boolean)
      .join(" · ") || input.email
  );
}

export function buildAdminDocuments(
  invoices: Array<{
    id: string;
    order_id: string;
    invoice_number: string;
    issued_at: string;
    total_cents: number;
  }>,
  orders: Array<{
    id: string;
    order_number: string;
    email: string;
    profile_id: string | null;
    shipping_address: Record<string, unknown> | null;
    shipping_charged_cents: number;
    created_at: string;
  }>,
  orderLines: Array<{
    order_id: string;
    quantity: number;
    product_name: string;
    variant_label: string;
    unit_price_cents: number;
    line_total_cents: number;
  }>,
  quotes: Array<{
    id: string;
    quote_number: string;
    email: string;
    profile_id: string;
    status: DocumentStatus;
    total_cents: number;
    total_weight_kg: number;
    subtotal_before_discount_cents: number;
    discount_cents: number;
    valid_until: string;
    created_at: string;
    paid_at: string | null;
    storage_path: string | null;
  }>,
  quoteLines: Array<{
    quote_id: string;
    product_name: string;
    variant_label: string;
    kilograms: number;
    discounted_price_cents_per_kg: number;
    line_total_cents: number;
    discount_percent: number;
  }>,
  profiles: Array<{
    id: string;
    first_name: string | null;
    last_name: string | null;
  }>,
  applications: Array<{
    invited_user_id: string | null;
    company_name: string | null;
  }>,
) {
  const ordersById = new Map(orders.map((order) => [order.id, order]));
  const profilesById = new Map(
    profiles.map((profile) => [profile.id, profile]),
  );
  const companiesByUserId = new Map(
    applications
      .filter((application) => application.invited_user_id)
      .map((application) => [
        application.invited_user_id as string,
        application.company_name,
      ]),
  );
  const orderLinesByOrderId = new Map<string, typeof orderLines>();
  for (const line of orderLines)
    orderLinesByOrderId.set(line.order_id, [
      ...(orderLinesByOrderId.get(line.order_id) ?? []),
      line,
    ]);
  const quoteLinesByQuoteId = new Map<string, typeof quoteLines>();
  for (const line of quoteLines)
    quoteLinesByQuoteId.set(line.quote_id, [
      ...(quoteLinesByQuoteId.get(line.quote_id) ?? []),
      line,
    ]);
  const documents: AdminDocument[] = [];

  for (const invoice of invoices) {
    const order = ordersById.get(invoice.order_id);
    if (!order) continue;
    const profile = order.profile_id
      ? profilesById.get(order.profile_id)
      : undefined;
    documents.push({
      id: invoice.id,
      type: "invoice",
      label: "test",
      number: invoice.invoice_number,
      date: invoice.issued_at,
      customer: customerName({ ...profile, email: order.email }),
      email: order.email,
      status: "issued",
      totalCents: invoice.total_cents,
      weightKg: null,
      paidAt: null,
      pdfHref: `/api/orders/${order.id}/invoice`,
      preview: {
        addressLines: [
          addressValue(order.shipping_address, "firstName", "lastName"),
          addressValue(order.shipping_address, "company"),
          addressValue(order.shipping_address, "line1"),
          [
            addressValue(order.shipping_address, "postalCode"),
            addressValue(order.shipping_address, "city"),
          ]
            .filter(Boolean)
            .join(" "),
          addressValue(order.shipping_address, "countryCode"),
          order.email,
        ].filter(Boolean),
        lines: (orderLinesByOrderId.get(order.id) ?? []).map((line) => ({
          label: `${line.product_name} - ${line.variant_label}`,
          quantity: line.quantity,
          unitCents: line.unit_price_cents,
          totalCents: line.line_total_cents,
        })),
        shippingCents: order.shipping_charged_cents,
        subtotalCents: (orderLinesByOrderId.get(order.id) ?? []).reduce(
          (sum, line) => sum + line.line_total_cents,
          0,
        ),
        discountCents: 0,
        validUntil: null,
      },
    });
  }

  for (const quote of quotes) {
    const profile = profilesById.get(quote.profile_id);
    documents.push({
      id: quote.id,
      type: "quote",
      label: "test",
      number: quote.quote_number,
      date: quote.created_at,
      customer: customerName({
        ...profile,
        company_name: companiesByUserId.get(quote.profile_id),
        email: quote.email,
      }),
      email: quote.email,
      status: quote.status,
      totalCents: quote.total_cents,
      weightKg: Number(quote.total_weight_kg),
      paidAt: quote.paid_at,
      pdfHref: `/api/professional-quotes/${quote.id}/pdf`,
      preview: {
        addressLines: [
          customerName({
            ...profile,
            company_name: companiesByUserId.get(quote.profile_id),
            email: quote.email,
          }),
          quote.email,
        ],
        lines: (quoteLinesByQuoteId.get(quote.id) ?? []).map((line) => ({
          label: `${line.product_name} - ${line.variant_label}`,
          quantity: line.kilograms,
          unitCents: line.discounted_price_cents_per_kg,
          totalCents: line.line_total_cents,
          discountPercent: line.discount_percent,
        })),
        shippingCents: 0,
        subtotalCents: quote.subtotal_before_discount_cents,
        discountCents: quote.discount_cents,
        validUntil: quote.valid_until,
      },
    });
  }

  return documents.toSorted(
    (left, right) =>
      new Date(right.date).getTime() - new Date(left.date).getTime(),
  );
}

function addressValue(
  address: Record<string, unknown> | null,
  ...keys: string[]
) {
  if (!address) return "";
  return keys
    .map((key) => address[key])
    .filter(
      (value): value is string =>
        typeof value === "string" && Boolean(value.trim()),
    )
    .join(" ")
    .trim();
}

export async function loader({ request }: LoaderFunctionArgs) {
  const admin = await requireAdmin(request);
  const url = new URL(request.url);
  const query = (url.searchParams.get("q") ?? "").trim().slice(0, 100);
  const requestedType = url.searchParams.get("type");
  const type =
    requestedType === "invoice" || requestedType === "quote"
      ? requestedType
      : "all";
  const requestedStatus = url.searchParams.get(
    "status",
  ) as DocumentStatus | null;
  const status =
    requestedStatus && ["issued", ...quoteStatuses].includes(requestedStatus)
      ? requestedStatus
      : "all";
  if (admin.demo)
    return {
      demo: true,
      query,
      type,
      status,
      summary: {
        total: 0,
        invoices: 0,
        quotes: 0,
        invoiceTotalCents: 0,
        quoteTotalCents: 0,
        pendingQuotes: 0,
      },
      documents: [],
    };

  const client = createServiceSupabase();
  if (!client)
    throw new Response("Base de données indisponible.", { status: 503 });
  const [invoiceResult, quoteResult, profileResult, applicationResult] =
    await Promise.all([
      client
        .from("invoices")
        .select("id,order_id,invoice_number,issued_at,total_cents")
        .order("issued_at", { ascending: false })
        .limit(10_000),
      client
        .from("professional_quotes")
        .select(
          "id,quote_number,email,profile_id,status,total_cents,total_weight_kg,subtotal_before_discount_cents,discount_cents,valid_until,created_at,paid_at,storage_path",
        )
        .order("created_at", { ascending: false })
        .limit(10_000),
      client.from("profiles").select("id,first_name,last_name").limit(10_000),
      client
        .from("professional_applications")
        .select("invited_user_id,company_name")
        .not("invited_user_id", "is", null)
        .order("created_at", { ascending: false })
        .limit(10_000),
    ]);
  if (invoiceResult.error)
    throw new Response(invoiceResult.error.message, { status: 500 });
  if (quoteResult.error)
    throw new Response(quoteResult.error.message, { status: 500 });
  if (profileResult.error)
    throw new Response(profileResult.error.message, { status: 500 });
  if (applicationResult.error)
    throw new Response(applicationResult.error.message, { status: 500 });

  const invoiceOrderIds = [
    ...new Set((invoiceResult.data ?? []).map((invoice) => invoice.order_id)),
  ];
  const orderResult = invoiceOrderIds.length
    ? await client
        .from("orders")
        .select(
          "id,order_number,email,profile_id,shipping_address,shipping_charged_cents,created_at",
        )
        .in("id", invoiceOrderIds)
    : { data: [], error: null };
  if (orderResult.error)
    throw new Response(orderResult.error.message, { status: 500 });
  const [orderLinesResult, quoteLinesResult] = await Promise.all([
    invoiceOrderIds.length
      ? client
          .from("order_lines")
          .select(
            "order_id,quantity,product_name,variant_label,unit_price_cents,line_total_cents",
          )
          .in("order_id", invoiceOrderIds)
          .order("created_at")
      : Promise.resolve({ data: [], error: null }),
    (quoteResult.data ?? []).length
      ? client
          .from("professional_quote_lines")
          .select(
            "quote_id,product_name,variant_label,kilograms,discounted_price_cents_per_kg,line_total_cents,discount_percent",
          )
          .in(
            "quote_id",
            (quoteResult.data ?? []).map((quote) => quote.id),
          )
          .order("created_at")
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (orderLinesResult.error)
    throw new Response(orderLinesResult.error.message, { status: 500 });
  if (quoteLinesResult.error)
    throw new Response(quoteLinesResult.error.message, { status: 500 });

  const allDocuments = buildAdminDocuments(
    invoiceResult.data ?? [],
    orderResult.data ?? [],
    orderLinesResult.data ?? [],
    (quoteResult.data ?? []) as Array<{
      id: string;
      quote_number: string;
      email: string;
      profile_id: string;
      status: DocumentStatus;
      total_cents: number;
      total_weight_kg: number;
      subtotal_before_discount_cents: number;
      discount_cents: number;
      valid_until: string;
      created_at: string;
      paid_at: string | null;
      storage_path: string | null;
    }>,
    quoteLinesResult.data ?? [],
    profileResult.data ?? [],
    applicationResult.data ?? [],
  );
  const documents = allDocuments.filter(
    (document) =>
      (type === "all" || document.type === type) &&
      (status === "all" || document.status === status) &&
      includesSearch(document, query),
  );
  return {
    demo: false,
    query,
    type,
    status,
    summary: {
      total: 0,
      invoices: 0,
      quotes: 0,
      invoiceTotalCents: 0,
      quoteTotalCents: 0,
      pendingQuotes: 0,
    },
    documents,
  };
}

export const meta: MetaFunction = () => [
  { title: "Factures + devis | Administration Zen Coffee Lab" },
  { name: "robots", content: "noindex,nofollow" },
];

function statusLabel(status: DocumentStatus) {
  return {
    issued: "Émise",
    pending_payment: "À payer",
    bank_transfer_pending: "Virement en attente",
    paid: "Payé",
    expired: "Expiré",
    canceled: "Annulé",
  }[status];
}

function documentTypeLabel(type: DocumentType) {
  return type === "invoice" ? "Facture" : "Devis";
}

type SimulationLine = {
  id: number;
  label: string;
  quantity: number;
  unitCents: number;
  discountPercent: number;
};

function formatInvoicePreviewMoney(cents: number, english: boolean) {
  if (!english) return formatMoney(cents, "fr-FR");
  return `${(cents / 100).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
}

function englishSimulationProductLabel(label: string) {
  return label
    .replace(/^Colombie/, "Colombia")
    .replace(/^Éthiopie/, "Ethiopia");
}

function NewDocumentSimulator({
  type,
  onClose,
}: {
  type: DocumentType;
  onClose: () => void;
}) {
  const quote = type === "quote";
  const [englishInvoice, setEnglishInvoice] = useState(false);
  const previewLocale = englishInvoice ? "en-GB" : "fr-FR";
  const [customer, setCustomer] = useState("Corentin Courtois");
  const [email, setEmail] = useState("yarpyamdog@gmail.com");
  const [address, setAddress] = useState(
    "35 rue Yves Noel, 35200 Rennes, France",
  );
  const customerAddressLines = address
    .split(",")
    .map((line) => line.trim())
    .filter(Boolean);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [validUntil, setValidUntil] = useState("");
  const [shippingCents, setShippingCents] = useState(950);
  const [lines, setLines] = useState<SimulationLine[]>([
    {
      id: 1,
      label: "Colombie — El Recreo · 200 g",
      quantity: 1,
      unitCents: 1300,
      discountPercent: 0,
    },
    {
      id: 2,
      label: "Éthiopie — Aricha · 200 g",
      quantity: 1,
      unitCents: 1800,
      discountPercent: 0,
    },
    {
      id: 3,
      label: "Éthiopie — Adola · 200 g",
      quantity: 1,
      unitCents: 1300,
      discountPercent: 0,
    },
    {
      id: 4,
      label: "Colombie — Santa Barbara · 200 g",
      quantity: 1,
      unitCents: 1500,
      discountPercent: 0,
    },
  ]);
  const total =
    lines.reduce(
      (sum, line) =>
        sum +
        Math.max(
          0,
          Math.round(
            line.quantity * line.unitCents * (1 - line.discountPercent / 100),
          ),
        ),
      0,
    ) + (quote ? 0 : Math.max(0, shippingCents));
  const updateLine = (id: number, patch: Partial<SimulationLine>) =>
    setLines((current) =>
      current.map((line) => (line.id === id ? { ...line, ...patch } : line)),
    );
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);
  return (
    <div
      className="admin-document-simulator"
      role="dialog"
      aria-modal="true"
      aria-labelledby="new-document-simulator-title"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="admin-document-simulator__panel">
        <header className="admin-document-preview__toolbar">
          <div>
            <p className="eyebrow">Nouveau document temporaire</p>
            <h2 id="new-document-simulator-title">
              Simuler {quote ? "un nouveau devis" : "une nouvelle facture"}
            </h2>
          </div>
          <button
            className="icon-button"
            type="button"
            onClick={onClose}
            aria-label="Fermer la simulation"
          >
            <X aria-hidden="true" />
          </button>
        </header>
        <div className="admin-document-simulator__body">
          <form
            className="admin-document-simulator__form"
            onSubmit={(event) => event.preventDefault()}
          >
            <p className="eyebrow">Données de simulation</p>
            <div className="admin-document-simulator__grid">
              <label>
                Client
                <input
                  value={customer}
                  onChange={(event) => setCustomer(event.currentTarget.value)}
                  placeholder="Nom du client"
                />
              </label>
              <label>
                E-mail
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.currentTarget.value)}
                  placeholder="client@exemple.fr"
                />
              </label>
              <label className="field--wide">
                Adresse
                <input
                  value={address}
                  onChange={(event) => setAddress(event.currentTarget.value)}
                  placeholder="Adresse, code postal, ville"
                />
              </label>
              <label>
                Date
                <input
                  type="date"
                  value={date}
                  onChange={(event) => setDate(event.currentTarget.value)}
                />
              </label>
              <label>
                Langue du document
                <select
                  value={englishInvoice ? "en" : "fr"}
                  onChange={(event) =>
                    setEnglishInvoice(event.currentTarget.value === "en")
                  }
                >
                  <option value="fr">Français</option>
                  <option value="en">English</option>
                </select>
              </label>
              {quote ? (
                <label>
                  Valable jusqu’au
                  <input
                    type="date"
                    value={validUntil}
                    onChange={(event) =>
                      setValidUntil(event.currentTarget.value)
                    }
                  />
                </label>
              ) : (
                <label>
                  Livraison (€)
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={(shippingCents / 100).toFixed(2)}
                    onChange={(event) =>
                      setShippingCents(
                        Math.round(
                          Number(event.currentTarget.value || 0) * 100,
                        ),
                      )
                    }
                  />
                </label>
              )}
            </div>
            <div className="admin-document-simulator__lines">
              <div className="admin-document-simulator__lines-heading">
                <p className="eyebrow">Lignes</p>
                <button
                  className="ui-button ui-button--outline ui-button--sm"
                  type="button"
                  onClick={() =>
                    setLines((current) => [
                      ...current,
                      {
                        id: Date.now(),
                        label: "Nouvelle prestation",
                        quantity: 1,
                        unitCents: 0,
                        discountPercent: 0,
                      },
                    ])
                  }
                >
                  <Plus aria-hidden="true" /> Ajouter une ligne
                </button>
              </div>
              {lines.map((line) => (
                <div className="admin-document-simulator__line" key={line.id}>
                  <label>
                    Description
                    <input
                      value={line.label}
                      onChange={(event) =>
                        updateLine(line.id, {
                          label: event.currentTarget.value,
                        })
                      }
                    />
                  </label>
                  <label>
                    Qté
                    <input
                      type="number"
                      min="1"
                      step="1"
                      value={line.quantity}
                      onChange={(event) =>
                        updateLine(line.id, {
                          quantity: Math.max(
                            1,
                            Number(event.currentTarget.value || 1),
                          ),
                        })
                      }
                    />
                  </label>
                  <label>
                    Prix unitaire (€)
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={(line.unitCents / 100).toFixed(2)}
                      onChange={(event) =>
                        updateLine(line.id, {
                          unitCents: Math.max(
                            0,
                            Math.round(
                              Number(event.currentTarget.value || 0) * 100,
                            ),
                          ),
                        })
                      }
                    />
                  </label>
                  <label>
                    Remise (%)
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="1"
                      value={line.discountPercent}
                      onChange={(event) =>
                        updateLine(line.id, {
                          discountPercent: Math.min(
                            100,
                            Math.max(0, Number(event.currentTarget.value || 0)),
                          ),
                        })
                      }
                    />
                  </label>
                  {lines.length > 1 ? (
                    <button
                      className="icon-button"
                      type="button"
                      onClick={() =>
                        setLines((current) =>
                          current.filter((item) => item.id !== line.id),
                        )
                      }
                      aria-label="Supprimer la ligne"
                    >
                      <Trash2 aria-hidden="true" />
                    </button>
                  ) : null}
                </div>
              ))}
            </div>
          </form>
          <article className="admin-document-paper admin-document-simulator__paper">
            <header className="admin-document-paper__header">
              <div>
                <strong>ZEN COFFEE LAB</strong>
                <small>MICRO-TORRÉFACTEUR</small>
              </div>
              <div className="admin-document-paper__seller">
                <strong>Zen Coffee Lab</strong>
                <span>32 rue Louis Blanc</span>
                <span>37000 Tours, France</span>
                <span>contact@zencoffeelab.com</span>
              </div>
              <section className="admin-document-paper__recipient">
                <strong>{customer || (englishInvoice ? "Customer name" : "Nom du client")}</strong>
                <span>{customerAddressLines[0] || (englishInvoice ? "Customer address" : "Adresse du client")}</span>
                <span>{customerAddressLines.slice(1).join(", ")}</span>
              </section>
            </header>
            <section className="admin-document-paper__title">
              <div>
                <h3>{quote ? (englishInvoice ? "PROFESSIONAL QUOTE" : "DEVIS PROFESSIONNEL") : (englishInvoice ? "INVOICE" : "FACTURE")}</h3>
                <span>{quote ? "SIMULATION" : (englishInvoice ? "NEXT INVOICE" : "PROCHAINE FACTURE")}</span>
              </div>
              <div>
                <strong>{quote ? (englishInvoice ? "TO BE SET" : "À définir") : (englishInvoice ? "ISSUED" : "ÉMISE")}</strong>
                <span>
                  {englishInvoice ? "Date: " : "Date : "}
                  {date
                    ? new Date(`${date}T12:00:00`).toLocaleDateString(previewLocale)
                    : "-"}
                </span>
                {quote && validUntil ? (
                  <span>
                    {englishInvoice ? "Valid until: " : "Valable jusqu’au : "}
                    {new Date(`${validUntil}T12:00:00`).toLocaleDateString(
                      previewLocale,
                    )}
                  </span>
                ) : null}
              </div>
            </section>
            <table className="admin-document-paper__table">
              <thead>
                <tr>
                  <th>{englishInvoice ? "Description" : "Libellé"}</th>
                  <th>{englishInvoice ? "Qty" : "Quantité"}</th>
                  <th>{englishInvoice ? "Unit price" : "Prix unitaire"}</th>
                  <th>{englishInvoice ? "Amount" : "Montant"}</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line) => (
                  <tr key={line.id}>
                    <td>{englishInvoice ? englishSimulationProductLabel(line.label) : line.label}</td>
                    <td>{line.quantity}</td>
                    <td>{formatInvoicePreviewMoney(line.unitCents, englishInvoice)}</td>
                    <td>
                      {formatInvoicePreviewMoney(
                        Math.max(
                          0,
                          Math.round(
                            line.quantity *
                              line.unitCents *
                              (1 - line.discountPercent / 100),
                          ),
                        ),
                        englishInvoice,
                      )}
                    </td>
                  </tr>
                ))}
                {!quote && shippingCents > 0 ? (
                  <tr>
                    <td>{englishInvoice ? "Shipping" : "Livraison"}</td>
                    <td>1</td>
                    <td>{formatInvoicePreviewMoney(shippingCents, englishInvoice)}</td>
                    <td>{formatInvoicePreviewMoney(shippingCents, englishInvoice)}</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
            <section className="admin-document-paper__bottom">
              <div>
                <p>
                  <strong>{englishInvoice ? "Terms and conditions" : "Termes et conditions"}</strong>
                </p>
                <p>{englishInvoice ? "VAT not applicable, art. 293 B of the French tax code." : "TVA non applicable, art. 293 B du CGI."}</p>
              </div>
              <dl>
                <div className="admin-document-paper__total">
                  <dt>TOTAL</dt>
                  <dd>{formatInvoicePreviewMoney(total, englishInvoice)}</dd>
                </div>
              </dl>
            </section>
            <footer className="admin-document-paper__footer">
              <div>
                <strong>Zen Coffee Lab</strong>
                <span>Ugo Simon-Meslet</span>
                <span>SIRET : 848 867 065 00056</span>
              </div>
              <div className="admin-document-paper__footer-inline">
                <strong>{englishInvoice ? "Payment method" : "Mode de paiement"}</strong>
                <span>{englishInvoice ? "Card payment" : "Carte bancaire"}</span>
              </div>
              <div className="admin-document-paper__footer-inline">
                <strong>{quote ? (englishInvoice ? "Quote" : "Devis") : (englishInvoice ? "Invoice" : "Facture")}</strong>
                <span>{quote ? "Simulation" : (englishInvoice ? "Next issue" : "Prochaine émission")}</span>
              </div>
            </footer>
          </article>
        </div>
        <footer className="admin-document-preview__actions">
          <button
            className="ui-button ui-button--outline"
            type="button"
            onClick={onClose}
          >
            Fermer la simulation
          </button>
        </footer>
      </div>
    </div>
  );
}

function AdminDocumentPreview({
  document,
  onClose,
}: {
  document: AdminDocument;
  onClose: () => void;
}) {
  const preview = document.preview;
  const quote = document.type === "quote";
  const grandTotal = document.totalCents;
  return (
    <div
      className="admin-document-preview"
      role="dialog"
      aria-modal="true"
      aria-labelledby="document-preview-title"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="admin-document-preview__panel">
        <header className="admin-document-preview__toolbar">
          <div>
            <p className="eyebrow">Aperçu du document</p>
            <h2 id="document-preview-title">
              {documentTypeLabel(document.type)} · {document.number}
            </h2>
          </div>
          <button
            className="icon-button"
            type="button"
            onClick={onClose}
            aria-label="Fermer la prévisualisation"
          >
            <X aria-hidden="true" />
          </button>
        </header>
        <article className="admin-document-paper">
          <header className="admin-document-paper__header">
            <div>
              <strong>ZEN COFFEE LAB</strong>
              <small>MICRO-TORRÉFACTEUR</small>
            </div>
            <div>
              <strong>Zen Coffee Lab</strong>
              <span>Ugo Simon-Meslet</span>
              <span>32 rue Louis Blanc</span>
              <span>37000 Tours · France</span>
              <span>SIRET 848 867 065 00056</span>
              <span>contact@zencoffeelab.com</span>
            </div>
          </header>
          <section className="admin-document-paper__recipient">
            <strong>{preview.addressLines[0] ?? document.customer}</strong>
            {preview.addressLines.slice(1).map((line) => (
              <span key={line}>{line}</span>
            ))}
          </section>
          <section className="admin-document-paper__title">
            <div>
              <h3>{quote ? "DEVIS PROFESSIONNEL" : "FACTURE"}</h3>
              <span>{document.number}</span>
            </div>
            <div>
              <strong>{quote ? statusLabel(document.status) : "PAYÉ"}</strong>
              <span>
                Date : {DOCUMENT_DATE_FORMATTER.format(new Date(document.date))}
              </span>
              {quote && preview.validUntil ? (
                <span>
                  Valable jusqu’au :{" "}
                  {new Date(preview.validUntil).toLocaleDateString("fr-FR")}
                </span>
              ) : null}
            </div>
          </section>
          <table className="admin-document-paper__table">
            <thead>
              <tr>
                <th>Libellé</th>
                <th>Quantité</th>
                <th>Prix unitaire</th>
                <th>Montant</th>
              </tr>
            </thead>
            <tbody>
              {preview.lines.map((line) => (
                <tr key={line.label}>
                  <td>{line.label}</td>
                  <td>{line.quantity}</td>
                  <td>{formatMoney(line.unitCents, "fr-FR")}</td>
                  <td>{formatMoney(line.totalCents, "fr-FR")}</td>
                </tr>
              ))}
              {!quote && preview.shippingCents > 0 ? (
                <tr>
                  <td>Livraison</td>
                  <td>1</td>
                  <td>{formatMoney(preview.shippingCents, "fr-FR")}</td>
                  <td>{formatMoney(preview.shippingCents, "fr-FR")}</td>
                </tr>
              ) : null}
            </tbody>
          </table>
          <section className="admin-document-paper__bottom">
            <div>
              <p>
                <strong>Termes et conditions</strong>
              </p>
              <p>TVA non applicable, art. 293 B du CGI.</p>
              <p>
                {quote
                  ? "Ce devis est une simulation fidèle du document enregistré."
                  : "Merci pour votre commande."}
              </p>
            </div>
            <dl>
              <div className="admin-document-paper__total">
                <dt>TOTAL</dt>
                <dd>{formatMoney(grandTotal, "fr-FR")}</dd>
              </div>
            </dl>
          </section>
          <footer>
            Zen Coffee Lab · Ugo Simon-Meslet · 32 rue Louis Blanc · 37000 Tours
            · France · SIRET 848 867 065 00056
          </footer>
        </article>
        <footer className="admin-document-preview__actions">
          <a
            className="ui-button ui-button--default"
            href={document.pdfHref}
            target="_blank"
            rel="noreferrer"
          >
            <Download aria-hidden="true" /> Ouvrir le PDF
          </a>
          <button
            className="ui-button ui-button--outline"
            type="button"
            onClick={onClose}
          >
            Fermer
          </button>
        </footer>
      </div>
    </div>
  );
}

export default function AdminDocuments() {
  const { demo, query, type, status, summary, documents } =
    useLoaderData<typeof loader>();
  const [selectedDocument, setSelectedDocument] =
    useState<AdminDocument | null>(null);
  const [simulationType, setSimulationType] = useState<DocumentType | null>(
    null,
  );
  return (
    <AdminShell active="documents">
      <header className="admin-heading">
        <div>
          <p className="eyebrow">Professionnels</p>
          <h1>Factures + devis</h1>
          <p className="admin-heading__description">
            Retrouvez tous les documents commerciaux créés depuis le début,
            classés par date, client et statut.
          </p>
        </div>
        <div className="admin-heading__actions">
          <button
            className="ui-button ui-button--default ui-button--sm"
            type="button"
            onClick={() => setSimulationType("invoice")}
          >
            <Plus aria-hidden="true" /> Simuler une facture
          </button>
          <a
            className="ui-button ui-button--outline ui-button--sm"
            href="https://app.indy.fr/facturation/devis"
            target="_blank"
            rel="noreferrer"
          >
            <Plus aria-hidden="true" /> Simuler un devis
          </a>
          <Link
            className="ui-button ui-button--outline ui-button--sm"
            to="/admin/professionnels"
          >
            Voir les professionnels
          </Link>
        </div>
      </header>
      {demo ? (
        <p className="admin-notice">
          Connectez Supabase pour consulter les factures et devis.
        </p>
      ) : null}
      <section
        className="stats-grid"
        aria-label="Indicateurs factures et devis"
      >
        <Card>
          <CardContent>
            <FileText aria-hidden="true" />
            <p className="stat-label">Documents</p>
            <p className="stat-value">{summary.total}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <Receipt aria-hidden="true" />
            <p className="stat-label">Factures</p>
            <p className="stat-value">{summary.invoices}</p>
            <small>{formatMoney(summary.invoiceTotalCents, "fr-FR")}</small>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <FileText aria-hidden="true" />
            <p className="stat-label">Devis</p>
            <p className="stat-value">{summary.quotes}</p>
            <small>{formatMoney(summary.quoteTotalCents, "fr-FR")}</small>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <Receipt aria-hidden="true" />
            <p className="stat-label">Devis à suivre</p>
            <p className="stat-value">{summary.pendingQuotes}</p>
            <small>En attente de paiement</small>
          </CardContent>
        </Card>
      </section>
      <Form
        method="get"
        className="admin-filter admin-document-filter"
        role="search"
      >
        <label className="sr-only" htmlFor="document-search">
          Rechercher un document
        </label>
        <input
          id="document-search"
          name="q"
          type="search"
          defaultValue={query}
          placeholder="Référence, client ou e-mail"
        />
        <label className="sr-only" htmlFor="document-type">
          Type de document
        </label>
        <select id="document-type" name="type" defaultValue={type}>
          <option value="all">Factures et devis</option>
          <option value="invoice">Factures uniquement</option>
          <option value="quote">Devis uniquement</option>
        </select>
        <label className="sr-only" htmlFor="document-status">
          Statut du document
        </label>
        <select id="document-status" name="status" defaultValue={status}>
          <option value="all">Tous les statuts</option>
          <option value="issued">Factures émises</option>
          <option value="pending_payment">Devis à payer</option>
          <option value="bank_transfer_pending">Virements en attente</option>
          <option value="paid">Devis payés</option>
          <option value="expired">Devis expirés</option>
          <option value="canceled">Devis annulés</option>
        </select>
        <button className="ui-button ui-button--default" type="submit">
          <Search aria-hidden="true" /> Rechercher
        </button>
      </Form>
      <Card className="admin-professional-section">
        <CardHeader>
          <p className="eyebrow">Registre documentaire</p>
          <h2>
            {documents.length} document{documents.length > 1 ? "s" : ""} affiché
            {documents.length > 1 ? "s" : ""}
          </h2>
        </CardHeader>
        <CardContent style={{ padding: 0 }}>
          <div className="admin-document-table-wrap">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead>Référence</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead>Montant</TableHead>
                  <TableHead>Document</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {documents.map((document) => (
                  <TableRow key={`${document.type}-${document.id}`}>
                    <TableCell>
                      <Badge
                        className={`admin-document-type admin-document-type--${document.type}`}
                      >
                        {documentTypeLabel(document.type)}
                      </Badge>
                      <br />
                      <Badge>{document.label}</Badge>
                    </TableCell>
                    <TableCell>
                      <strong>{document.number}</strong>
                      {document.weightKg !== null ? (
                        <>
                          <br />
                          <small>
                            {document.weightKg.toLocaleString("fr-FR", {
                              maximumFractionDigits: 2,
                            })}{" "}
                            kg
                          </small>
                        </>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      <strong>{document.customer}</strong>
                      <br />
                      <small>
                        <a href={`mailto:${document.email}`}>
                          {document.email}
                        </a>
                      </small>
                    </TableCell>
                    <TableCell>
                      {DOCUMENT_DATE_FORMATTER.format(new Date(document.date))}
                    </TableCell>
                    <TableCell>
                      <Badge
                        className={`admin-document-status admin-document-status--${document.status}`}
                      >
                        {statusLabel(document.status)}
                      </Badge>
                      {document.type === "quote" && document.paidAt ? (
                        <>
                          <br />
                          <small>
                            Payé le{" "}
                            {DOCUMENT_DATE_FORMATTER.format(
                              new Date(document.paidAt),
                            )}
                          </small>
                        </>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      <strong>
                        {formatMoney(document.totalCents, "fr-FR")}
                      </strong>
                    </TableCell>
                    <TableCell>
                      <div className="admin-document-actions">
                        <button
                          className="text-link"
                          type="button"
                          onClick={() => setSelectedDocument(document)}
                        >
                          <Eye aria-hidden="true" /> Voir
                        </button>
                        <a
                          className="text-link"
                          href={document.pdfHref}
                          target="_blank"
                          rel="noreferrer"
                        >
                          <Download aria-hidden="true" /> PDF
                        </a>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {documents.length ? null : (
            <p className="admin-empty-state">
              Aucun document ne correspond aux filtres.
            </p>
          )}
        </CardContent>
      </Card>
      {selectedDocument ? (
        <AdminDocumentPreview
          document={selectedDocument}
          onClose={() => setSelectedDocument(null)}
        />
      ) : null}
      {simulationType ? (
        <NewDocumentSimulator
          type={simulationType}
          onClose={() => setSimulationType(null)}
        />
      ) : null}
    </AdminShell>
  );
}
