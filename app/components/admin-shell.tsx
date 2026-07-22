import { Archive, Boxes, FileText, LayoutDashboard, Package, ShoppingCart, Users } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router";
import { Logo } from "~/components/logo";

export type AdminSection = "dashboard" | "orders" | "products" | "stocks" | "shipping" | "professionals" | "content" | "editorial" | "archives";

const navigation = [
  { section: "dashboard", label: "Tableau de bord", href: "/admin", icon: LayoutDashboard },
  { section: "orders", label: "Commandes", href: "/admin/commandes", icon: ShoppingCart },
  { section: "products", label: "Produits", href: "/admin#catalogue", icon: Package },
  { section: "stocks", label: "Stocks", href: "/admin#catalogue", icon: Boxes },
  { section: "shipping", label: "Expédition", href: "/admin/expedition", icon: Boxes },
  { section: "professionals", label: "Demandes pro", href: "/admin#demandes-pro", icon: Users },
  { section: "content", label: "Pages", href: "/admin/contenus", icon: FileText },
  { section: "editorial", label: "FAQ & Conseils", href: "/admin/editorial", icon: FileText },
  { section: "archives", label: "Archives", href: "/admin#catalogue", icon: Archive },
] as const;

export function AdminShell({ active, children }: { active: AdminSection; children: ReactNode }) {
  return <div className="admin-shell">
    <aside className="admin-sidebar">
      <Logo />
      <nav aria-label="Administration">
        {navigation.map(({ section, label, href, icon: Icon }) => <Link aria-current={section === active ? "page" : undefined} to={href} key={section}><Icon aria-hidden="true" /> {label}</Link>)}
      </nav>
    </aside>
    <main className="admin-main">{children}</main>
  </div>;
}
