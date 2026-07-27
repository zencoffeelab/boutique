import { BookOpen, Boxes, CircleHelp, FileText, History, LayoutDashboard, LogOut, Package, ShoppingCart, UserRound, Users } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router";
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
  </div>;
}
