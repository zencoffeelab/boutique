import { BookOpen, Boxes, Check, CircleHelp, FileText, History, LayoutDashboard, LogOut, Mail, Package, ShoppingCart, UserRound, Users, X } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useActionData, useFetchers, useLocation, useNavigate } from "react-router";
import { Logo } from "~/components/logo";

export type AdminSection = "dashboard" | "orders" | "products" | "shipping" | "customers" | "professionals" | "documents" | "mail" | "content" | "announcement" | "faq" | "advice" | "changelog";

const navigation = [
  { section: "dashboard", label: "Tableau de bord", href: "/admin", icon: LayoutDashboard },
  { section: "orders", label: "Commandes", href: "/admin/commandes", icon: ShoppingCart },
  { section: "products", label: "Produits", href: "/admin/produits", icon: Package },
  { section: "shipping", label: "Expédition", href: "/admin/expedition", icon: Boxes },
  { section: "customers", label: "Clients", href: "/admin/clients", icon: UserRound },
  { section: "professionals", label: "Professionnels", href: "/admin/professionnels", icon: Users },
  { section: "documents", label: "Factures + devis", href: "/admin/professionnels/factures-devis", icon: FileText },
  { section: "mail", label: "Messagerie", href: "/admin/messagerie", icon: Mail },
  { section: "content", label: "Pages", href: "/admin/contenus", icon: FileText },
  { section: "faq", label: "FAQ", href: "/admin/faq", icon: CircleHelp },
  { section: "advice", label: "Blog", href: "/admin/conseils", icon: BookOpen },
  { section: "changelog", label: "Modifications", href: "/admin/modifications", icon: History },
] as const;

type AdminMutationResult = {
  ok?: unknown;
  message?: unknown;
};

const redirectedConfirmationMessages: Readonly<Record<string, string>> = {
  "product-created": "Produit créé.",
  "mail-sent": "E-mail envoyé et archivé dans la messagerie.",
  "mail-deleted": "E-mail supprimé définitivement.",
  "mail-labeled": "Label du message mis à jour.",
  "mail-label-created": "Label créé.",
  "mail-label-deleted": "Label supprimé.",
};

export function successfulAdminMessage(result: unknown) {
  if (!result || typeof result !== "object") return null;
  const { ok, message } = result as AdminMutationResult;
  if (ok !== true) return null;
  return typeof message === "string" && message.trim()
    ? message
    : "La modification a bien été enregistrée.";
}

function AdminFeedbackModal() {
  const actionData = useActionData();
  const fetchers = useFetchers();
  const location = useLocation();
  const navigate = useNavigate();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const handledActionDataRef = useRef<unknown>(undefined);
  const handledFetcherDataRef = useRef(new Map<string, unknown>());
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const searchParams = new URLSearchParams(location.search);
    const confirmation = searchParams.get("confirmation");
    const redirectedMessage = confirmation ? redirectedConfirmationMessages[confirmation] : null;
    if (!redirectedMessage) return;
    setMessage(redirectedMessage);
    searchParams.delete("confirmation");
    const search = searchParams.toString();
    void navigate(
      { pathname: location.pathname, search: search ? `?${search}` : "", hash: location.hash },
      { replace: true },
    );
  }, [location.hash, location.pathname, location.search, navigate]);

  useEffect(() => {
    if (actionData === undefined || actionData === handledActionDataRef.current) return;
    handledActionDataRef.current = actionData;
    const nextMessage = successfulAdminMessage(actionData);
    if (nextMessage) setMessage(nextMessage);
  }, [actionData]);

  useEffect(() => {
    let nextMessage: string | null = null;
    for (const fetcher of fetchers) {
      if (fetcher.data === undefined || handledFetcherDataRef.current.get(fetcher.key) === fetcher.data) continue;
      handledFetcherDataRef.current.set(fetcher.key, fetcher.data);
      nextMessage = successfulAdminMessage(fetcher.data) ?? nextMessage;
    }
    if (nextMessage) setMessage(nextMessage);
  }, [fetchers]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (message && dialog && !dialog.open) dialog.showModal();
  }, [message]);

  if (!message) return null;

  return <dialog
    ref={dialogRef}
    className="admin-feedback-modal"
    aria-labelledby="admin-feedback-title"
    aria-describedby="admin-feedback-message"
    onClose={() => setMessage(null)}
    onClick={(event) => { if (event.target === event.currentTarget) event.currentTarget.close(); }}
  >
    <div className="admin-feedback-modal__panel">
      <span className="admin-feedback-modal__icon"><Check aria-hidden="true" /></span>
      <div>
        <p className="eyebrow">Validation</p>
        <h2 id="admin-feedback-title">Modification confirmée</h2>
        <p id="admin-feedback-message">{message}</p>
      </div>
      <form method="dialog">
        <button className="ui-button ui-button--default" type="submit">Fermer</button>
      </form>
      <form className="admin-feedback-modal__close" method="dialog">
        <button type="submit" aria-label="Fermer la confirmation"><X aria-hidden="true" /></button>
      </form>
    </div>
  </dialog>;
}

function AdminMailUnreadBadge({ initialCount }: { initialCount?: number }) {
  const [remoteCount, setRemoteCount] = useState(0);

  useEffect(() => {
    if (initialCount !== undefined) return;
    let active = true;
    const refresh = async () => {
      try {
        const response = await fetch("/api/admin/mail/unread-count", { credentials: "same-origin", headers: { Accept: "application/json" } });
        if (!response.ok) return;
        const result = await response.json() as { unread?: unknown };
        if (active && typeof result.unread === "number") setRemoteCount(result.unread);
      } catch {
        // Le compteur sera retenté au prochain rafraîchissement sans interrompre le back-office.
      }
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), 60_000);
    return () => { active = false; window.clearInterval(timer); };
  }, [initialCount]);

  const unread = initialCount ?? remoteCount;
  if (unread <= 0) return null;
  const label = `${unread} e-mail${unread > 1 ? "s" : ""} non lu${unread > 1 ? "s" : ""}`;
  return <span className="admin-sidebar__mail-count" aria-label={label} title={label}>{unread > 99 ? "99+" : unread}</span>;
}

function AdminOrderUnreadBadge() {
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    let active = true;
    const refresh = async () => {
      try {
        const response = await fetch("/api/admin/orders/unread-count", { credentials: "same-origin", headers: { Accept: "application/json" } });
        if (!response.ok) return;
        const result = await response.json() as { unread?: unknown };
        if (active && typeof result.unread === "number") setUnread(result.unread);
      } catch {
        // Le compteur sera retenté au prochain rafraîchissement sans interrompre le back-office.
      }
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), 60_000);
    return () => { active = false; window.clearInterval(timer); };
  }, []);

  if (unread <= 0) return null;
  const label = `${unread} nouvelle${unread > 1 ? "s" : ""} commande${unread > 1 ? "s" : ""}`;
  return <span className="admin-sidebar__order-count" aria-label={label} title={label}>{unread > 99 ? "99+" : unread}</span>;
}

export function AdminShell({ active, children, unreadMailCount }: { active: AdminSection; children: ReactNode; unreadMailCount?: number }) {
  return <div className="admin-shell">
    <aside className="admin-sidebar">
      <Logo />
      <nav aria-label="Administration">
        {navigation.map(({ section, label, href, icon: Icon }) => <Link aria-current={section === active ? "page" : undefined} to={href} key={section}><Icon aria-hidden="true" /> {label}{section === "orders" ? <AdminOrderUnreadBadge /> : null}{section === "mail" ? <AdminMailUnreadBadge initialCount={unreadMailCount} /> : null}</Link>)}
      </nav>
      <form className="admin-logout" method="post" action="/mon-compte">
        <input type="hidden" name="intent" value="logout" />
        <button type="submit"><LogOut aria-hidden="true" /> Se déconnecter</button>
      </form>
    </aside>
    <main className="admin-main">{children}</main>
    <AdminFeedbackModal />
  </div>;
}
