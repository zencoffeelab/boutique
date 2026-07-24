import { Menu, ShoppingBag, UserRound, X } from "lucide-react";
import { useState } from "react";
import { Link, useLocation } from "react-router";
import { CartDrawer } from "~/components/cart/cart-drawer";
import { useCart } from "~/components/cart/cart-provider";
import { Logo } from "~/components/logo";
import { alternatePath, dictionary } from "~/lib/i18n";

export function SiteHeader() {
  const location = useLocation();
  const locale = location.pathname === "/en" || location.pathname.startsWith("/en/") ? "en-GB" : "fr-FR";
  const t = dictionary[locale];
  const [menuOpen, setMenuOpen] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const { itemCount } = useCart();
  const paths = locale === "fr-FR"
    ? { home: "/", shop: "/boutique", professional: "/professionnel", advice: "/conseils", about: "/a-propos", cart: "/panier", account: "/mon-compte" }
    : { home: "/en", shop: "/en/shop", professional: "/en/professional", advice: "/en/tips", about: "/en/about-us", cart: "/en/cart", account: "/en/my-account" };
  const closeMenu = () => setMenuOpen(false);
  return (
    <>
      <a className="skip-link" href="#main-content">{locale === "fr-FR" ? "Aller au contenu" : "Skip to content"}</a>
      <div className="announcement">{t.freeShipping}</div>
      <header className="site-header">
        <button className="icon-button mobile-menu-button" type="button" onClick={() => setMenuOpen((value) => !value)} aria-expanded={menuOpen} aria-controls="primary-navigation">
          {menuOpen ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
          <span className="sr-only">Menu</span>
        </button>
        <nav id="primary-navigation" className={menuOpen ? "site-nav is-open" : "site-nav"} aria-label={locale === "fr-FR" ? "Navigation principale" : "Primary navigation"}>
          <Link onClick={closeMenu} to={paths.shop}>{t.shop}</Link>
          <Link onClick={closeMenu} to={paths.professional}>{t.professional}</Link>
          <Link onClick={closeMenu} to={paths.advice}>{t.advice}</Link>
          <Link onClick={closeMenu} to={paths.about}>{t.about}</Link>
        </nav>
        <Logo home={paths.home} />
        <div className="header-actions">
          <Link className="language-link" to={alternatePath(location.pathname)}>{locale === "fr-FR" ? "EN" : "FR"}</Link>
          <Link className="icon-button" to={paths.account} aria-label={t.account}><UserRound aria-hidden="true" /></Link>
          <button className="icon-button cart-button" type="button" onClick={() => { closeMenu(); setCartOpen(true); }} aria-label={`${t.cart} (${itemCount})`} aria-expanded={cartOpen} aria-controls="cart-drawer">
            <ShoppingBag aria-hidden="true" /><span>{itemCount}</span>
          </button>
        </div>
      </header>
      <CartDrawer open={cartOpen} locale={locale} onClose={() => setCartOpen(false)} />
    </>
  );
}
