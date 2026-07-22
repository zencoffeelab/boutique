import { Link, useLocation } from "react-router";
import { Logo } from "./logo";

export function SiteFooter() {
  const location = useLocation();
  const english = location.pathname === "/en" || location.pathname.startsWith("/en/");
  return (
    <footer className="site-footer">
      <div className="footer-intro">
        <Logo home={english ? "/en" : "/"} />
        <p>{english ? "Lightly roasted specialty coffee, with clarity and intention." : "Des cafés de spécialité torréfiés avec légèreté, clarté et intention."}</p>
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
      </div>
      <div className="footer-bottom">
        <p>© {new Date().getFullYear()} Zen Coffee Lab</p>
        <a href="https://www.instagram.com/zencoffeeclub/" rel="noreferrer" target="_blank">Instagram ↗</a>
      </div>
    </footer>
  );
}
