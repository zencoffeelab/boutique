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
import { PublicCaptchaMount } from "~/components/public-captcha";
import { ComingSoonPage } from "~/components/coming-soon-page";
import { QuoteCartProvider } from "~/components/professional-quote/quote-cart-provider";
import { CookieConsent } from "~/components/cookie-consent";
import { SiteFooter } from "~/components/site-footer";
import { SiteHeader } from "~/components/site-header";
import { getSessionStatus } from "~/lib/auth.server";
import { getProducts } from "~/lib/catalog.server";
import { getContentPage } from "~/lib/content.server";
import { getComingSoon } from "~/lib/coming-soon.server";
import { comingSoonCopy, defaultComingSoonSettings, isSiteShellHiddenPath, shouldShowComingSoon } from "~/lib/coming-soon";
import { getLocale } from "~/lib/i18n";
import { defaultSiteNavigation } from "~/lib/site-navigation";
import { getSiteNavigation } from "~/lib/site-navigation.server";
import { isAllowedDuringRequiredPasswordSetup, passwordSetupPath } from "~/lib/password-setup";
import { safeInternalPath } from "~/lib/redirects";
import "./app.css";

export const links: LinksFunction = () => [
  { rel: "icon", href: "/favicon.svg?v=3", type: "image/svg+xml" },
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
  const shellHidden = isSiteShellHiddenPath(requestUrl.pathname);
  const [session, footerProducts, announcementContent, navigation, comingSoon] = await Promise.all([
    getSessionStatus(request),
    shellHidden
      ? Promise.resolve([])
      : getProducts({ status: "published", availableOnly: true }).then(
          (products) =>
            products
              .map((product) => ({
                slug: product.slug,
                name: product.translations[locale].name,
                publishedAt: product.publishedAt,
              }))
              .toSorted((first, second) =>
                (second.publishedAt ? Date.parse(second.publishedAt) : 0) -
                (first.publishedAt ? Date.parse(first.publishedAt) : 0),
              )
              .slice(0, 4),
    ),
    shellHidden ? Promise.resolve(null) : getContentPage("bandeau", locale),
    shellHidden ? Promise.resolve(defaultSiteNavigation) : getSiteNavigation(),
    shellHidden ? Promise.resolve(comingSoonCopy(defaultComingSoonSettings, locale)) : getComingSoon(locale),
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
    accountInitials: session.accountInitials,
    admin: session.admin,
    footerProducts,
    announcement: announcementContent?.title ?? null,
    navigation,
    comingSoon,
  }, { headers: session.responseHeaders });
}

export default function App() {
  const { locale, gaMeasurementId, signedIn, professional, professionalUserId, accountInitials, admin, footerProducts, announcement, navigation, comingSoon } = useLoaderData<typeof loader>();
  const location = useLocation();
  const isAdmin = location.pathname === "/admin" || location.pathname.startsWith("/admin/");
  const isPasswordSetup = location.pathname === "/activation/mot-de-passe" || location.pathname === "/en/activate/password";
  const shellHidden = isSiteShellHiddenPath(location.pathname);
  const constructionMode = shouldShowComingSoon(comingSoon.active, location.pathname, admin);
  return (
    <html lang={locale === "fr-FR" ? "fr" : "en"}>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        {constructionMode ? <meta name="robots" content="noindex,nofollow" /> : null}
        <Links />
      </head>
      <body className={isAdmin ? "admin-body" : isPasswordSetup ? "password-setup-body" : constructionMode ? "coming-soon-body" : undefined}>
        {constructionMode ? <ComingSoonPage title={comingSoon.title} message={comingSoon.message} locale={locale} /> : <CartProvider locale={locale}>
          <QuoteCartProvider key={professionalUserId ?? "guest"} storageNamespace={professionalUserId ?? "guest"}>
            {shellHidden ? null : <SiteHeader signedIn={signedIn} professional={professional} accountInitials={accountInitials} announcement={announcement ?? undefined} navigation={navigation} />}
            <main id="main-content" tabIndex={-1}>
              <Outlet />
            </main>
            {shellHidden ? null : <SiteFooter products={footerProducts} admin={admin} navigation={navigation} />}
            {shellHidden ? null : <CookieConsent measurementId={gaMeasurementId} />}
          </QuoteCartProvider>
        </CartProvider>}
        <ScrollRestoration />
        <Scripts />
        <PublicCaptchaMount />
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
