import { Check, ChevronDown, FileText, Menu, MonitorSmartphone, ShoppingBag, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { Link, useLocation } from "react-router";
import { AccountDrawer } from "~/components/account/account-drawer";
import { CartDrawer } from "~/components/cart/cart-drawer";
import { useCart } from "~/components/cart/cart-provider";
import { QuoteCartDrawer } from "~/components/professional-quote/quote-cart-drawer";
import { useQuoteCart } from "~/components/professional-quote/quote-cart-provider";
import { Logo } from "~/components/logo";
import { alternatePath, dictionary } from "~/lib/i18n";
import type { Locale } from "~/domain/types";
import { defaultSiteNavigation, getSiteNavigationItem, siteNavigationLabel, type SiteNavigationConfiguration } from "~/lib/site-navigation";

const languageOptions = [
  { locale: "fr-FR", code: "FR", label: "Français" },
  { locale: "en-GB", code: "EN", label: "English" },
] as const;

function LanguageFlag({ locale, className }: { locale: Locale; className: string }) {
  return <span className={className} data-language-flag={locale} aria-hidden="true">
    <svg viewBox="0 0 30 20" focusable="false" shapeRendering="geometricPrecision">
      {locale === "fr-FR" ? <>
        <rect width="10" height="20" fill="#002395" />
        <rect x="10" width="10" height="20" fill="#fff" />
        <rect x="20" width="10" height="20" fill="#ed2939" />
      </> : <>
        <rect width="30" height="20" fill="#012169" />
        <path d="M0 0 30 20M30 0 0 20" stroke="#fff" strokeWidth="5" />
        <path d="M0 0 30 20M30 0 0 20" stroke="#c8102e" strokeWidth="2" />
        <path d="M15 0v20M0 10h30" stroke="#fff" strokeWidth="7" />
        <path d="M15 0v20M0 10h30" stroke="#c8102e" strokeWidth="4" />
      </>}
    </svg>
  </span>;
}

function AccountLinkContent({ signedIn, label, initials }: { signedIn: boolean; label: string; initials: string | null }) {
  return <><span className="account-button__label">{label}</span>{signedIn ? <span className="account-avatar" aria-hidden="true">{initials || "Z"}</span> : null}</>;
}

function LanguageSelector({ locale, frenchPath, englishPath }: { locale: Locale; frenchPath: string; englishPath: string }) {
  const menuId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const firstOptionRef = useRef<HTMLAnchorElement>(null);
  const [open, setOpen] = useState(false);
  const activeLanguage = languageOptions.find((option) => option.locale === locale)!;
  const toggle = () => {
    if (open) {
      setOpen(false);
      return;
    }
    setOpen(true);
    window.requestAnimationFrame(() => firstOptionRef.current?.focus());
  };
  return <div
    className="language-selector"
    onBlur={(event) => {
      if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false);
    }}
    onKeyDown={(event) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
    }}
  >
    <button
      ref={triggerRef}
      className="language-selector__trigger"
      type="button"
      aria-label={locale === "fr-FR" ? "Langue active : Français" : "Active language: English"}
      aria-haspopup="menu"
      aria-expanded={open}
      aria-controls={menuId}
      onClick={toggle}
    >
      <LanguageFlag locale={activeLanguage.locale} className="language-selector__flag" />
      <span>{activeLanguage.code}</span>
      <ChevronDown className={`language-selector__chevron${open ? " is-open" : ""}`} aria-hidden="true" />
    </button>
    {open ? <div id={menuId} className="language-selector__menu" role="menu" aria-label={locale === "fr-FR" ? "Choisir la langue" : "Choose language"}>
      {languageOptions.map((option, index) => {
        const active = option.locale === locale;
        return <Link
          ref={index === 0 ? firstOptionRef : undefined}
          className={active ? "is-active" : undefined}
          to={option.locale === "fr-FR" ? frenchPath : englishPath}
          role="menuitem"
          aria-label={`${option.label} (${option.code})`}
          aria-current={active ? "true" : undefined}
          onClick={() => setOpen(false)}
          key={option.locale}
        >
          <LanguageFlag locale={option.locale} className="language-selector__option-flag" />
          <span className="language-selector__option-copy"><strong>{option.code}</strong><small>{option.label}</small></span>
          {active ? <Check aria-hidden="true" /> : null}
        </Link>;
      })}
    </div> : null}
  </div>;
}

export function SiteHeader({ signedIn, professional, accountInitials, admin = false, announcement, navigation = defaultSiteNavigation }: { signedIn: boolean; professional: boolean; accountInitials: string | null; admin?: boolean; announcement?: string; navigation?: SiteNavigationConfiguration }) {
  const location = useLocation();
  const locale = location.pathname === "/en" || location.pathname.startsWith("/en/") ? "en-GB" : "fr-FR";
  const t = dictionary[locale];
  const [menuOpen, setMenuOpen] = useState(false);
  const [accountDrawerOpen, setAccountDrawerOpen] = useState(() => new URLSearchParams(location.search).get("account") === "welcome");
  const [mobilePreview, setMobilePreview] = useState(false);
  const embeddedMobilePreview = new URLSearchParams(location.search).get("mobilePreview") === "1";
  const { itemCount, drawerOpen, openDrawer, closeDrawer } = useCart();
  const quoteCart = useQuoteCart();
  const paths = locale === "fr-FR"
    ? { home: "/", shop: "/boutique", professional: "/professionnel", advice: "/blog", about: "/a-propos", cart: "/panier", account: "/mon-compte" }
    : { home: "/en", shop: "/en/shop", professional: "/en/professional", advice: "/en/blog", about: "/en/about-us", cart: "/en/cart", account: "/en/my-account" };
  const closeMenu = () => setMenuOpen(false);
  const openAccountDrawer = () => {
    closeMenu();
    closeDrawer();
    quoteCart.closeDrawer();
    setAccountDrawerOpen(true);
  };
  const closeAccountDrawer = () => setAccountDrawerOpen(false);
  const accountLabel = signedIn
    ? (locale === "fr-FR" ? "Mon compte" : "My account")
    : (locale === "fr-FR" ? "Connexion" : "Sign in");
  const currentLanguagePath = `${location.pathname}${location.search}`;
  const alternateLanguagePath = `${alternatePath(location.pathname)}${location.search}`;
  const frenchPath = locale === "fr-FR" ? currentLanguagePath : alternateLanguagePath;
  const englishPath = locale === "en-GB" ? currentLanguagePath : alternateLanguagePath;
  useEffect(() => {
    if (!admin || embeddedMobilePreview) return;
    const enabled = window.sessionStorage.getItem("zen-admin-mobile-preview") === "true";
    setMobilePreview(enabled);
  }, [admin, embeddedMobilePreview]);
  useEffect(() => {
    if (!embeddedMobilePreview) return;
    const preservePreviewOnNavigation = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (!(target instanceof HTMLAnchorElement) || target.target === "_blank" || target.hasAttribute("download")) return;
      const url = new URL(target.href, window.location.href);
      if (url.origin !== window.location.origin || url.searchParams.has("mobilePreview")) return;
      event.preventDefault();
      url.searchParams.set("mobilePreview", "1");
      window.location.assign(`${url.pathname}${url.search}${url.hash}`);
    };
    document.addEventListener("click", preservePreviewOnNavigation, true);
    return () => document.removeEventListener("click", preservePreviewOnNavigation, true);
  }, [embeddedMobilePreview]);
  const toggleMobilePreview = () => {
    const next = !mobilePreview;
    setMobilePreview(next);
    window.sessionStorage.setItem("zen-admin-mobile-preview", String(next));
  };
  const closeMobilePreview = () => {
    setMobilePreview(false);
    window.sessionStorage.setItem("zen-admin-mobile-preview", "false");
  };
  const mobilePreviewUrl = `${location.pathname}${location.search ? `${location.search}&` : "?"}mobilePreview=1`;
  return (
    <>
      <a className="skip-link" href="#main-content">{locale === "fr-FR" ? "Aller au contenu" : "Skip to content"}</a>
      <div className="announcement">{announcement || t.freeShipping}</div>
      <header className="site-header">
        <button className="icon-button mobile-menu-button" type="button" onClick={() => setMenuOpen((value) => !value)} aria-expanded={menuOpen} aria-controls="primary-navigation">
          {menuOpen ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
          <span className="sr-only">Menu</span>
        </button>
        <nav id="primary-navigation" className={menuOpen ? "site-nav is-open" : "site-nav"} aria-label={locale === "fr-FR" ? "Navigation principale" : "Primary navigation"}>
          {navigation.menu.map((key) => {
            const item = getSiteNavigationItem(key);
            return item.paths ? <Link onClick={closeMenu} to={item.paths[locale]} key={key}>{siteNavigationLabel(key, locale, "menu")}</Link> : null;
          })}
          {signedIn ? <button className="mobile-account-link is-signed-in" type="button" onClick={openAccountDrawer} aria-expanded={accountDrawerOpen} aria-controls="account-drawer"><AccountLinkContent signedIn label={accountLabel} initials={accountInitials} /></button> : <Link className="mobile-account-link" onClick={closeMenu} to={paths.account}><AccountLinkContent signedIn={false} label={accountLabel} initials={null} /></Link>}
        </nav>
        <Logo home={paths.home} />
        <div className="header-actions">
          <LanguageSelector locale={locale} frenchPath={frenchPath} englishPath={englishPath} />
          {professional ? <button className="icon-button quote-cart-button" type="button" onClick={() => { closeMenu(); quoteCart.openDrawer(); }} aria-label={`${locale === "fr-FR" ? "Panier de devis" : "Quote basket"} (${quoteCart.totalKilograms} kg)`} aria-expanded={quoteCart.drawerOpen} aria-controls="quote-cart-drawer"><FileText aria-hidden="true" /><span>{quoteCart.totalKilograms}</span></button> : null}
          <button className="icon-button cart-button" type="button" onClick={() => { closeMenu(); openDrawer(); }} aria-label={`${t.cart} (${itemCount})`} aria-expanded={drawerOpen} aria-controls="cart-drawer">
            <ShoppingBag aria-hidden="true" /><span>{itemCount}</span>
          </button>
          {admin && !embeddedMobilePreview ? <button className={`admin-mobile-preview-button${mobilePreview ? " is-active" : ""}`} type="button" onClick={toggleMobilePreview} aria-pressed={mobilePreview} aria-label={mobilePreview ? "Désactiver l’aperçu mobile" : "Activer l’aperçu mobile"} title={mobilePreview ? "Désactiver l’aperçu mobile" : "Aperçu mobile"}><MonitorSmartphone aria-hidden="true" /><span>Mobile</span></button> : null}
          {signedIn ? <button className="account-button is-signed-in" type="button" onClick={openAccountDrawer} aria-label={accountLabel} aria-expanded={accountDrawerOpen} aria-controls="account-drawer"><AccountLinkContent signedIn label={accountLabel} initials={accountInitials} /></button> : <Link className="account-button" to={paths.account} aria-label={accountLabel}><AccountLinkContent signedIn={false} label={accountLabel} initials={null} /></Link>}
        </div>
      </header>
      <CartDrawer open={drawerOpen} locale={locale} onClose={closeDrawer} />
      {professional ? <QuoteCartDrawer locale={locale} /> : null}
      {signedIn ? <AccountDrawer open={accountDrawerOpen} locale={locale} onClose={closeAccountDrawer} /> : null}
      {admin && mobilePreview && !embeddedMobilePreview ? <div className="admin-mobile-preview" role="dialog" aria-modal="true" aria-label="Aperçu mobile du site">
        <div className="admin-mobile-preview__toolbar">
          <span><MonitorSmartphone aria-hidden="true" /> Aperçu mobile</span>
          <button type="button" onClick={closeMobilePreview} aria-label="Fermer l’aperçu mobile" title="Fermer l’aperçu mobile"><X aria-hidden="true" /></button>
        </div>
        <div className="admin-mobile-preview__device">
          <iframe title="Aperçu mobile de la page" src={mobilePreviewUrl} />
        </div>
      </div> : null}
    </>
  );
}
