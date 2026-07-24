import { BookOpen, Boxes, CircleHelp, FileText, LayoutDashboard, Package, ShoppingCart, Users } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router";
import { Logo } from "~/components/logo";

export type AdminSection = "dashboard" | "orders" | "products" | "stocks" | "shipping" | "professionals" | "content" | "faq" | "advice";

const navigation = [
  { section: "dashboard", label: "Tableau de bord", href: "/admin", icon: LayoutDashboard },
  { section: "orders", label: "Commandes", href: "/admin/commandes", icon: ShoppingCart },
  { section: "products", label: "Produits", href: "/admin/produits", icon: Package },
  { section: "stocks", label: "Stocks", href: "/admin/produits#catalogue", icon: Boxes },
  { section: "shipping", label: "Expédition", href: "/admin/expedition", icon: Boxes },
  { section: "professionals", label: "Professionnels", href: "/admin/professionnels", icon: Users },
  { section: "content", label: "Pages", href: "/admin/contenus", icon: FileText },
  { section: "faq", label: "FAQ", href: "/admin/faq", icon: CircleHelp },
  { section: "advice", label: "Conseils", href: "/admin/conseils", icon: BookOpen },
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
