import { Link, useLocation } from "react-router";
import { Logo } from "./logo";

type FooterProductLink = Readonly<{
  slug: string;
  name: string;
}>;

export function SiteFooter({ products = [], admin = false }: { products?: readonly FooterProductLink[]; admin?: boolean }) {
  const location = useLocation();
  const english = location.pathname === "/en" || location.pathname.startsWith("/en/");
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
      <div>
        <h2>{english ? "Explore" : "Explorer"}</h2>
        <Link to={english ? "/en/shop" : "/boutique"}>{english ? "Shop" : "Boutique"}</Link>
        <Link to={english ? "/en/professional" : "/professionnel"}>{english ? "Professionals" : "Professionnels"}</Link>
        <Link to={english ? "/en/archives" : "/archives"}>Archives</Link>
      </div>
      <div>
        <h2>{english ? "Help" : "Aide"}</h2>
        <Link to={english ? "/en/faq" : "/faq"}>FAQ</Link>
        <Link to={english ? "/en/contact" : "/contact"}>Contact</Link>
        <Link to={english ? "/en/general-terms-and-conditions-of-sale" : "/cgv"}>{english ? "Terms" : "CGV"}</Link>
        <Link to={english ? "/en/legal-notice" : "/mentions-legales"}>{english ? "Legal notice" : "Mentions légales"}</Link>
        <Link to={english ? "/en/privacy-policy" : "/politique-de-confidentialite"}>{english ? "Privacy policy" : "Politique de confidentialité"}</Link>
      </div>
      <div>
        <h2>{english ? "Shop" : "Boutique"}</h2>
        <Link to={english ? "/en/shop" : "/boutique"}>{english ? "All coffees" : "Tous les cafés"}</Link>
        {products.map((product) => (
          <Link key={product.slug} to={english ? `/en/shop/${product.slug}` : `/boutique/${product.slug}`}>
            {product.name}
          </Link>
        ))}
      </div>
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
