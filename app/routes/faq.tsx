import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { useLoaderData } from "react-router";
import { getFaqItems } from "~/lib/content.server";
import { getLocale } from "~/lib/i18n";
import { JsonLd, pageMeta } from "~/lib/seo";

const items = [
  { fr: ["Quand mon café est-il torréfié ?", "Nous torréfions en petits lots chaque semaine. La date de torréfaction figure sur chaque paquet."], en: ["When is my coffee roasted?", "We roast in small batches every week. The roasting date is printed on every bag."] },
  { fr: ["Comment conserver mon café ?", "Conservez le paquet fermé, à température ambiante, à l’abri de la lumière et de l’humidité. Évitez le réfrigérateur."], en: ["How should I store coffee?", "Keep the bag closed at room temperature, away from light and moisture. Avoid the refrigerator."] },
  { fr: ["Quels sont les délais d’expédition ?", "Les commandes sont généralement préparées sous deux jours ouvrés. Le délai du transporteur s’ajoute ensuite."], en: ["How long does shipping take?", "Orders are usually prepared within two business days, followed by the carrier transit time."] },
  { fr: ["Livrez-vous hors de France ?", "Nous livrons dans l’Union européenne et au Royaume-Uni. Les droits éventuels au Royaume-Uni restent à la charge du destinataire."], en: ["Do you ship outside France?", "We ship within the European Union and to the United Kingdom. Any UK duties remain payable by the recipient."] },
];
export async function loader({ request }: LoaderFunctionArgs) { const locale = getLocale(request); return { locale, managedItems: await getFaqItems(locale) }; }
export const meta: MetaFunction<typeof loader> = ({ data }) => pageMeta(`FAQ | Zen Coffee Lab`, data?.locale === "en-GB" ? "Answers about coffee, roasting, orders and delivery." : "Réponses sur le café, la torréfaction, les commandes et la livraison.", data?.locale === "en-GB" ? "/en/faq" : "/faq");
export default function FAQ() {
  const { locale, managedItems } = useLoaderData<typeof loader>(); const english = locale === "en-GB"; const translated = managedItems?.length ? managedItems : items.map((item) => english ? item.en : item.fr);
  return <><JsonLd value={{ "@context": "https://schema.org", "@type": "FAQPage", mainEntity: translated.map(([question, answer]) => ({ "@type": "Question", name: question, acceptedAnswer: { "@type": "Answer", text: answer } })) }} /><header className="page-hero"><p className="eyebrow">{english ? "Need help?" : "Besoin d’aide ?"}</p><h1>{english ? "Frequently asked questions" : "Questions fréquentes"}</h1></header><section className="faq-list">{translated.map(([question, answer]) => <details key={question}><summary>{question}</summary><p>{answer}</p></details>)}</section></>;
}
