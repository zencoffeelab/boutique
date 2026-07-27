import type { LinksFunction, LoaderFunctionArgs, MetaFunction } from "react-router";
import {
  data,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  isRouteErrorResponse,
  useLoaderData,
  useLocation,
  useRouteError,
  redirect,
} from "react-router";
import { CartProvider } from "~/components/cart/cart-provider";
import { QuoteCartProvider } from "~/components/professional-quote/quote-cart-provider";
import { CookieConsent } from "~/components/cookie-consent";
import { SiteFooter } from "~/components/site-footer";
import { SiteHeader } from "~/components/site-header";
import { getSessionStatus } from "~/lib/auth.server";
import { getProducts } from "~/lib/catalog.server";
import { getLocale } from "~/lib/i18n";
import { isAllowedDuringRequiredPasswordSetup, passwordSetupPath } from "~/lib/password-setup";
import { safeInternalPath } from "~/lib/redirects";
import "./app.css";

export const links: LinksFunction = () => [
  { rel: "icon", href: "/favicon.svg?v=2", type: "image/svg+xml" },
  { rel: "preconnect", href: "https://www.zencoffeelab.com" },
];

export const meta: MetaFunction = () => [
  { title: "Zen Coffee Lab — Café de spécialité torréfié à Tours" },
  { name: "description", content: "Micro-torréfacteur de cafés de spécialité, torréfiés à la demande à Tours." },
  { property: "og:site_name", content: "Zen Coffee Lab" },
  { property: "og:type", content: "website" },
];

export async function loader({ request }: LoaderFunctionArgs) {
  const requestUrl = new URL(request.url);
  const locale = getLocale(request);
  const shellHidden =
    requestUrl.pathname === "/admin" ||
    requestUrl.pathname.startsWith("/admin/") ||
    requestUrl.pathname === "/activation/mot-de-passe" ||
    requestUrl.pathname === "/en/activate/password";
  const [session, footerProducts] = await Promise.all([
    getSessionStatus(request),
    shellHidden
      ? Promise.resolve([])
      : getProducts({ status: "published", availableOnly: true }).then(
          (products) =>
            products
              .map((product) => ({
                slug: product.slug,
                name: product.translations[locale].name,
              }))
              .toSorted((first, second) =>
                first.name.localeCompare(second.name, locale, {
                  sensitivity: "base",
                }),
              ),
        ),
  ]);
  const setupPath = passwordSetupPath(locale);
  if (session.passwordSetupRequired && !isAllowedDuringRequiredPasswordSetup(requestUrl.pathname)) {
    const next = safeInternalPath(`${requestUrl.pathname}${requestUrl.search}`, locale === "en-GB" ? "/en/professional" : "/professionnel");
    throw redirect(`${setupPath}?next=${encodeURIComponent(next)}`, { headers: session.responseHeaders });
  }
  return data({
    locale,
    gaMeasurementId: process.env.VITE_GA_MEASUREMENT_ID ?? "",
    signedIn: session.signedIn,
    professional: session.professional,
    professionalUserId: session.professionalUserId,
    admin: session.admin,
    footerProducts,
  }, { headers: session.responseHeaders });
}

export default function App() {
  const { locale, gaMeasurementId, signedIn, professional, professionalUserId, admin, footerProducts } = useLoaderData<typeof loader>();
  const location = useLocation();
  const isAdmin = location.pathname === "/admin" || location.pathname.startsWith("/admin/");
  const isPasswordSetup = location.pathname === "/activation/mot-de-passe" || location.pathname === "/en/activate/password";
  const shellHidden = isAdmin || isPasswordSetup;
  return (
    <html lang={locale === "fr-FR" ? "fr" : "en"}>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body className={isAdmin ? "admin-body" : isPasswordSetup ? "password-setup-body" : undefined}>
        <CartProvider>
          <QuoteCartProvider key={professionalUserId ?? "guest"} storageNamespace={professionalUserId ?? "guest"}>
            {shellHidden ? null : <SiteHeader signedIn={signedIn} professional={professional} />}
            <main id="main-content" tabIndex={-1}>
              <Outlet />
            </main>
            {shellHidden ? null : <SiteFooter products={footerProducts} admin={admin} />}
            {shellHidden ? null : <CookieConsent measurementId={gaMeasurementId} />}
          </QuoteCartProvider>
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
