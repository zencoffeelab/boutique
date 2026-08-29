import { Link, useLocation } from "react-router";

export function loader() { return new Response(null, { status: 404 }); }
export function headers() { return { "X-Robots-Tag": "noindex, nofollow" }; }
export const meta = () => [
  { title: "Page introuvable | Zen Coffee Lab" },
  { name: "robots", content: "noindex,nofollow" },
];
export default function NotFound() {
  const location = useLocation(); const english = location.pathname === "/en" || location.pathname.startsWith("/en/");
  return <div className="empty-state"><p className="eyebrow">404</p><h1>{english ? "This page has gone for coffee." : "Cette page est partie prendre un café."}</h1><Link className="button button--dark" to={english ? "/en" : "/"}>{english ? "Back home" : "Retour à l’accueil"}</Link></div>;
}
