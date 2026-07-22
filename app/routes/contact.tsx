import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { useLoaderData } from "react-router";
import { ContentBlocks } from "~/components/content-blocks";
import { getContentPage } from "~/lib/content.server";
import { getLocale } from "~/lib/i18n";
import { pageMeta } from "~/lib/seo";

export async function loader({ request }: LoaderFunctionArgs) { const locale = getLocale(request); return { locale, content: await getContentPage("contact", locale) }; }
export const meta: MetaFunction<typeof loader> = ({ data }) => pageMeta(data?.content?.seoTitle ?? `Contact | Zen Coffee Lab`, data?.content?.seoDescription ?? (data?.locale === "en-GB" ? "Contact the Zen Coffee Lab roastery." : "Contacter la micro-torréfaction Zen Coffee Lab."), data?.locale === "en-GB" ? "/en/contact" : "/contact");
export default function Contact() {
  const { locale, content } = useLoaderData<typeof loader>(); const english = locale === "en-GB";
  return <><header className="page-hero"><p className="eyebrow">{english ? "Let’s talk coffee" : "Parlons café"}</p><h1>{content?.title ?? (english ? "Contact us" : "Contactez-nous")}</h1><p className="lede">{english ? "A question about an order, a coffee or a professional project?" : "Une question sur une commande, un café ou un projet professionnel ?"}</p></header><ContentBlocks blocks={content?.blocks} /><section className="form-card"><h2>{english ? "Write to the roastery" : "Écrire à la torréfaction"}</h2><p>{english ? "We generally reply within two business days." : "Nous répondons généralement sous deux jours ouvrés."}</p><a className="button button--dark" href="mailto:contact@zencoffeelab.com">contact@zencoffeelab.com</a></section></>;
}
