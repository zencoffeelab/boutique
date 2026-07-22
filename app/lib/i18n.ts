import type { Locale } from "~/domain/types";

export function getLocale(request: Request): Locale {
  const pathname = new URL(request.url).pathname;
  return pathname === "/en" || pathname.startsWith("/en/") ? "en-GB" : "fr-FR";
}

export function localePath(locale: Locale, frenchPath: string, englishPath?: string): string {
  if (locale === "fr-FR") return frenchPath;
  return `/en${englishPath ?? frenchPath}`;
}

export const dictionary = {
  "fr-FR": {
    shop: "Boutique",
    professional: "Professionnels",
    about: "À propos",
    advice: "Conseils",
    cart: "Panier",
    account: "Compte",
    discover: "Découvrir nos cafés",
    addToCart: "Ajouter au panier",
    soldOut: "Épuisé",
    from: "À partir de",
    freeShipping: "Livraison offerte dès 75 € en France",
    producer: "Producteur",
    region: "Région",
    variety: "Variété",
    process: "Traitement",
    altitude: "Altitude",
    weight: "Poids",
    quantity: "Quantité",
    tasting: "Dans la tasse",
  },
  "en-GB": {
    shop: "Shop",
    professional: "Professionals",
    about: "About us",
    advice: "Tips",
    cart: "Cart",
    account: "Account",
    discover: "Discover our coffees",
    addToCart: "Add to cart",
    soldOut: "Sold out",
    from: "From",
    freeShipping: "Free delivery in France from €75",
    producer: "Producer",
    region: "Region",
    variety: "Variety",
    process: "Process",
    altitude: "Altitude",
    weight: "Weight",
    quantity: "Quantity",
    tasting: "In the cup",
  },
} as const;

export function alternatePath(pathname: string): string {
  if (pathname === "/en") return "/";
  if (pathname.startsWith("/en/shop/")) return pathname.replace("/en/shop/", "/boutique/");
  if (pathname === "/en/shop") return "/boutique";
  if (pathname === "/en/about-us") return "/a-propos";
  if (pathname === "/en/professional") return "/professionnel";
  if (pathname === "/en/tips") return "/conseils";
  if (pathname.startsWith("/en/tips/")) return pathname.replace("/en/tips/", "/conseils/");
  if (pathname === "/en/cart") return "/panier";
  if (pathname === "/en/checkout") return "/commande";
  if (pathname === "/en/my-account") return "/mon-compte";
  if (pathname.startsWith("/en/")) return pathname.slice(3) || "/";
  if (pathname.startsWith("/boutique/")) return pathname.replace("/boutique/", "/en/shop/");
  const mappings: Record<string, string> = {
    "/": "/en",
    "/boutique": "/en/shop",
    "/a-propos": "/en/about-us",
    "/professionnel": "/en/professional",
    "/conseils": "/en/tips",
    "/panier": "/en/cart",
    "/commande": "/en/checkout",
    "/mon-compte": "/en/my-account",
  };
  return mappings[pathname] ?? `/en${pathname}`;
}
