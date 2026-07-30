import { Link, useLocation } from "react-router";
import { Logo } from "./logo";
import { defaultSiteNavigation, getSiteNavigationItem, siteNavigationLabel, type SiteNavigationConfiguration } from "~/lib/site-navigation";

type FooterProductLink = Readonly<{
  slug: string;
  name: string;
}>;

export function SiteFooter({ products = [], admin = false, navigation = defaultSiteNavigation }: { products?: readonly FooterProductLink[]; admin?: boolean; navigation?: SiteNavigationConfiguration }) {
  const location = useLocation();
  const english = location.pathname === "/en" || location.pathname.startsWith("/en/");
  const locale = english ? "en-GB" : "fr-FR";
  return (
    <footer className="site-footer">
      <div className="footer-intro">
        <Logo home={english ? "/en" : "/"} />
        <p>
          {english
            ? "We are the result of all the work accomplished upstream and select our coffees with care, both with the aim of building direct relationships with producers and of offering a light roast that best expresses the terroir, the variety and the producer’s original vision."
            : "Nous sommes le fruit de tout le travail accompli en amont et choisissons nos cafés avec soin, tant dans le projet d'établir des liens directs avec les producteurs, que dans le but d'offrir une torréfaction légère qui représentera le mieux possible le terroir, la variété et la vision originelle du producteur."}
        </p>
      </div>
      {navigation.footerColumns.map((column) => <div className="site-footer__navigation-column" key={column.id}>
        <h2>{column.titles[locale]}</h2>
        {column.items.map((key) => {
          if (key === "available-products") return products.map((product) => (
            <Link key={`${column.id}-${product.slug}`} to={english ? `/en/shop/${product.slug}` : `/boutique/${product.slug}`}>{product.name}</Link>
          ));
          const item = getSiteNavigationItem(key);
          return item.paths ? <Link key={key} to={item.paths[locale]}>{siteNavigationLabel(key, locale, "footer")}</Link> : null;
        })}
      </div>)}
      <div className="footer-bottom">
        <div className="footer-bottom__meta">
          <p>© {new Date().getFullYear()} Zen Coffee Lab</p>
          {admin ? <Link className="footer-admin-link" to="/admin">Back-office</Link> : null}
        </div>
        <a href="https://www.instagram.com/zencoffeeclub/" rel="noreferrer" target="_blank">Instagram ↗</a>
      </div>
    </footer>
  );
}
