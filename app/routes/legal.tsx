import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { useLoaderData } from "react-router";
import { ContentBlocks } from "~/components/content-blocks";
import { getContentPage } from "~/lib/content.server";
import { getLocale } from "~/lib/i18n";

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url); const locale = getLocale(request);
  const kind = url.pathname.includes("confidential") || url.pathname.includes("privacy") ? "privacy" : url.pathname.includes("cgv") || url.pathname.includes("terms") ? "terms" : "legal";
  const pageKey = kind === "terms" ? "cgv" : kind === "privacy" ? "politique-de-confidentialite" : "mentions-legales";
  return { locale, kind, content: await getContentPage(pageKey, locale) };
}
export const meta: MetaFunction<typeof loader> = ({ data }) => [{ title: `${data?.kind === "terms" ? "CGV" : data?.kind === "privacy" ? "Confidentialité" : "Mentions légales"} | Zen Coffee Lab` }];
export default function Legal() {
  const { locale, kind, content } = useLoaderData<typeof loader>(); const english = locale === "en-GB";
  const title = kind === "terms" ? (english ? "Terms and conditions of sale" : "Conditions générales de vente") : kind === "privacy" ? (english ? "Privacy policy" : "Politique de confidentialité") : (english ? "Legal notice" : "Mentions légales");
  return <article><header className="page-hero"><p className="eyebrow">Zen Coffee Lab</p><h1>{content?.title ?? title}</h1></header>{content ? <ContentBlocks blocks={content.blocks} /> : <div className="article-body"><p>{english ? "This document is a pre-production template. Company registration, tax, hosting and consumer mediation details must be reviewed by the owner or legal counsel before launch." : "Ce document est un modèle de préproduction. Les informations d’immatriculation, fiscales, d’hébergement et de médiation doivent être validées par le propriétaire ou son conseil avant la mise en ligne."}</p><h2>{english ? "Publisher" : "Éditeur"}</h2><p>Zen Coffee Lab · Tours, France · contact@zencoffeelab.com</p><h2>{english ? "Data and orders" : "Données et commandes"}</h2><p>{english ? "Personal data is used only to process applications, accounts, orders, delivery and legal obligations. Analytics is loaded only after consent." : "Les données personnelles sont utilisées uniquement pour traiter les demandes, comptes, commandes, livraisons et obligations légales. La mesure d’audience n’est chargée qu’après consentement."}</p></div>}</article>;
}
