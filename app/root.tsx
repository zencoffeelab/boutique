import type { LinksFunction, LoaderFunctionArgs, MetaFunction } from "react-router";
import {
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  isRouteErrorResponse,
  useLoaderData,
  useLocation,
  useRouteError,
} from "react-router";
import { CartProvider } from "~/components/cart/cart-provider";
import { CookieConsent } from "~/components/cookie-consent";
import { SiteFooter } from "~/components/site-footer";
import { SiteHeader } from "~/components/site-header";
import { getLocale } from "~/lib/i18n";
import "./app.css";

export const links: LinksFunction = () => [
  { rel: "icon", href: "/favicon.svg", type: "image/svg+xml" },
  { rel: "preconnect", href: "https://www.zencoffeelab.com" },
];

export const meta: MetaFunction = () => [
  { title: "Zen Coffee Lab — Café de spécialité torréfié à Tours" },
  { name: "description", content: "Micro-torréfacteur de cafés de spécialité, torréfiés à la demande à Tours." },
  { property: "og:site_name", content: "Zen Coffee Lab" },
  { property: "og:type", content: "website" },
];

export async function loader({ request }: LoaderFunctionArgs) {
  return {
    locale: getLocale(request),
    gaMeasurementId: process.env.VITE_GA_MEASUREMENT_ID ?? "",
  };
}

export default function App() {
  const { locale, gaMeasurementId } = useLoaderData<typeof loader>();
  const location = useLocation();
  const isAdmin = location.pathname === "/admin" || location.pathname.startsWith("/admin/");
  return (
    <html lang={locale === "fr-FR" ? "fr" : "en"}>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body className={isAdmin ? "admin-body" : undefined}>
        <CartProvider>
          {isAdmin ? null : <SiteHeader />}
          <main id="main-content" tabIndex={-1}>
            <Outlet />
          </main>
          {isAdmin ? null : <SiteFooter />}
          {isAdmin ? null : <CookieConsent measurementId={gaMeasurementId} />}
        </CartProvider>
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export function ErrorBoundary() {
  const error = useRouteError();
  const status = isRouteErrorResponse(error) ? error.status : 500;
  const message = isRouteErrorResponse(error)
    ? typeof error.data === "string"
      ? error.data
      : error.statusText
    : error instanceof Error
      ? error.message
      : "Une erreur inattendue est survenue.";
  return (
    <html lang="fr">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{status} — Zen Coffee Lab</title>
        <Links />
      </head>
      <body>
        <main className="error-page">
          <p className="eyebrow">Erreur {status}</p>
          <h1>La tasse s’est renversée.</h1>
          <p>{message}</p>
          <a className="button button--dark" href="/">Retour à l’accueil</a>
        </main>
        <Scripts />
      </body>
    </html>
  );
}
