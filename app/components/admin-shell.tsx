import { BookOpen, Boxes, Check, CircleHelp, FileText, History, LayoutDashboard, LogOut, Package, ShoppingCart, UserRound, Users, X } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useActionData, useFetchers, useLocation, useNavigate } from "react-router";
import { Logo } from "~/components/logo";

export type AdminSection = "dashboard" | "orders" | "products" | "shipping" | "customers" | "professionals" | "content" | "faq" | "advice" | "changelog";

const navigation = [
  { section: "dashboard", label: "Tableau de bord", href: "/admin", icon: LayoutDashboard },
  { section: "orders", label: "Commandes", href: "/admin/commandes", icon: ShoppingCart },
  { section: "products", label: "Produits", href: "/admin/produits", icon: Package },
  { section: "shipping", label: "Expédition", href: "/admin/expedition", icon: Boxes },
  { section: "customers", label: "Clients", href: "/admin/clients", icon: UserRound },
  { section: "professionals", label: "Professionnels", href: "/admin/professionnels", icon: Users },
  { section: "content", label: "Pages", href: "/admin/contenus", icon: FileText },
  { section: "faq", label: "FAQ", href: "/admin/faq", icon: CircleHelp },
  { section: "advice", label: "Conseils", href: "/admin/conseils", icon: BookOpen },
  { section: "changelog", label: "Modifications", href: "/admin/modifications", icon: History },
] as const;

type AdminMutationResult = {
  ok?: unknown;
  message?: unknown;
};

const redirectedConfirmationMessages: Readonly<Record<string, string>> = {
  "product-created": "Produit créé.",
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

export function AdminShell({ active, children }: { active: AdminSection; children: ReactNode }) {
  return <div className="admin-shell">
    <aside className="admin-sidebar">
      <Logo />
      <nav aria-label="Administration">
        {navigation.map(({ section, label, href, icon: Icon }) => <Link aria-current={section === active ? "page" : undefined} to={href} key={section}><Icon aria-hidden="true" /> {label}</Link>)}
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
