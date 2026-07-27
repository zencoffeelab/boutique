import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { Link, useLoaderData } from "react-router";
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

export function FrenchLegalNotice() {
  return <section className="article-body rich-text-content legal-document" aria-label="Mentions légales">
    <section>
      <h2>1. Éditeur du site</h2>
      <address className="legal-contact-details">
        <p><strong>Nom / Prénom :</strong> SIMON-MESLET Ugo<br /><strong>Statut :</strong> Micro-entrepreneur<br /><strong>Nom commercial :</strong> Zen Coffee Lab<br /><strong>Adresse :</strong> 32 rue Louis Blanc<br /><strong>Email :</strong> <a href="mailto:contact@zencoffeelab.com">contact@zencoffeelab.com</a><br /><strong>Téléphone :</strong> <a href="tel:+33612692079">06 12 69 20 79</a><br /><strong>SIRET :</strong> 84886706500056<br /><strong>Directeur de la publication :</strong> SIMON-MESLET Ugo</p>
      </address>
      <p>Les personnes accédant au Site sont dénommées ci-après les « Utilisateurs ».</p>
    </section>
    <section><h2>2. Hébergement du site</h2><p>Le Site est hébergé par OVH SAS, société immatriculée au RCS de Lille sous le numéro 537 407 926 sise 2, rue Kellermann, 59100 Roubaix.</p></section>
    <section><h2>3. Propriété intellectuelle</h2><p>L’ensemble du contenu du site (textes, images, logos, etc.) est la propriété exclusive de Zen Coffee Lab, sauf mention contraire.</p><p>Toute reproduction, distribution ou utilisation sans autorisation est interdite.</p></section>
    <section><h2>4. Responsabilité</h2><p>L’éditeur ne saurait être tenu responsable des erreurs présentes sur le site, ni des dommages résultant de son utilisation.</p></section>
    <section>
      <h2>5. Données personnelles</h2>
      <p>Les données personnelles sont traitées conformément à la <Link to="/politique-de-confidentialite">politique de confidentialité</Link> disponible sur le site.</p>
      <p>Dans le cadre de l’utilisation du Site, Zen Coffee Lab est susceptible de collecter et traiter des données personnelles des Utilisateurs, conformément à la réglementation en vigueur, notamment le Règlement Général sur la Protection des Données (RGPD) et la Loi Informatique et Libertés.</p>
      <p><strong>Destinataires :</strong></p>
      <p>Les données sont traitées par Zen Coffee Lab et ses prestataires autorisés (hébergement, paiement, livraison, etc.). Elles ne sont en aucun cas cédées ou vendues à des tiers non autorisés.</p>
      <p><strong>Droits des utilisateurs :</strong><br />Conformément à la législation, vous disposez des droits suivants :</p>
      <ul><li>Accès à vos données</li><li>Rectification</li><li>Suppression</li><li>Limitation</li><li>Opposition au traitement</li><li>Portabilité des données (si applicable)</li></ul>
    </section>
    <section><h2>6. Cookies</h2><p>Le Site utilise des cookies pour :</p><ul><li>Améliorer votre navigation</li><li>Réaliser des statistiques (Google Analytics)</li><li>Mesurer la performance publicitaire (Google Ads, Meta Pixel)</li></ul><p>Vous pouvez configurer vos préférences depuis le bandeau cookies ou via les paramètres de votre navigateur.</p></section>
    <section><h2>7. Droit applicable</h2><p>Le site est soumis au droit français.</p><p>Zen Coffee Lab se réserve le droit de modifier les présentes mentions légales à tout moment. Les Utilisateurs sont invités à les consulter régulièrement.</p></section>
  </section>;
}

export function FrenchPrivacyPolicy() {
  return <section className="article-body rich-text-content legal-document" aria-label="Politique de confidentialité">
    <section>
      <h2>1. Collecte des données</h2>
      <p>La présente Politique de Confidentialité a pour objet d’informer les utilisateurs du site www.zencoffeelab.com (ci-après le « Site ») sur la collecte, l’utilisation, le partage et la protection de leurs données personnelles par la société Zen Coffee Lab, en conformité avec le Règlement Général sur la Protection des Données (RGPD) et la loi française.</p>
      <p>Les données personnelles collectées sur le site sont :</p>
      <ul><li>Nom et prénom</li><li>Adresse postale</li><li>Adresse email</li><li>Numéro de téléphone</li><li>Données de paiement (via des prestataires sécurisés)</li></ul>
      <p>Ces données sont collectées lors :</p>
      <ul><li>D’une commande</li><li>De la création d’un compte</li><li>D’un contact via formulaire</li></ul>
    </section>
    <section><h2>2. Finalité des données</h2><p>Les données sont utilisées pour :</p><ul><li>Traiter et livrer les commandes</li><li>Gérer la relation client</li><li>Envoyer des emails (confirmation, suivi, SAV)</li><li>Respecter les obligations légales</li></ul></section>
    <section><h2>3. Base légale</h2><p>Le traitement repose sur :</p><ul><li>L’exécution du contrat (commande)</li><li>Le respect d’obligations légales</li><li>Le consentement (ex. : newsletter)</li><li>Une obligation légale (comptabilité, conservation des factures)</li></ul></section>
    <section><h2>4. Destinataires des données</h2><p>Les données peuvent être transmises à :</p><ul><li>Des prestataires de paiement (ex. : Stripe, PayPal)</li><li>Des transporteurs (ex. : La Poste, Mondial Relay)</li><li>Des outils de statistiques et de performance (ex. : Google Analytics, Meta Pixel)</li><li>Des outils techniques (hébergement, emailing)</li></ul></section>
    <section><h2>5. Durée de conservation</h2><p>Les données sont conservées :</p><ul><li>Données clients : 5 ans après la fin de la relation commerciale</li><li>Données de facturation : 10 ans (obligation légale)</li><li>Données marketing : 3 ans à compter du dernier contact</li><li>Cookies : 13 mois maximum</li></ul></section>
    <section><h2>6. Sécurité</h2><p>Le site met en œuvre des mesures de sécurité pour protéger les données personnelles.</p></section>
    <section><h2>7. Droits des utilisateurs</h2><p>Conformément au RGPD, vous disposez des droits suivants :</p><ul><li>Accès</li><li>Rectification</li><li>Suppression</li><li>Opposition</li><li>Portabilité</li></ul><p>Pour exercer vos droits :<br />Contact : <a href="mailto:contact@zencoffeelab.com">contact@zencoffeelab.com</a></p><p>Vous pouvez également introduire une réclamation auprès de la <a href="https://www.cnil.fr" rel="noreferrer" target="_blank">CNIL</a>.</p></section>
    <section><h2>8. Cookies</h2><p>Le site utilise des cookies pour :</p><ul><li>Le fonctionnement du site</li><li>La mesure d’audience</li><li>L’amélioration de l’expérience</li></ul><p>Un bandeau de consentement permet d’accepter ou refuser les cookies.</p></section>
    <section><h2>9. Modifications</h2><p>La présente politique peut être modifiée à tout moment.</p><p className="legal-document__updated">Date de mise à jour : 02/04/2026</p></section>
  </section>;
}

export default function Legal() {
  const { locale, kind, content } = useLoaderData<typeof loader>(); const english = locale === "en-GB";
  const title = kind === "terms" ? (english ? "Terms and conditions of sale" : "Conditions générales de vente") : kind === "privacy" ? (english ? "Privacy policy" : "Politique de confidentialité") : (english ? "Legal notice" : "Mentions légales");
  const sourceDocument = !english && kind === "legal" ? <FrenchLegalNotice /> : !english && kind === "privacy" ? <FrenchPrivacyPolicy /> : null;
  return <article><header className="page-hero"><p className="eyebrow">Zen Coffee Lab</p><h1>{content?.title ?? title}</h1></header>{sourceDocument ?? (content ? <ContentBlocks blocks={content.blocks} /> : <div className="article-body"><p>{english ? "This document is a pre-production template. Company registration, tax, hosting and consumer mediation details must be reviewed by the owner or legal counsel before launch." : "Ce document est un modèle de préproduction. Les informations d’immatriculation, fiscales, d’hébergement et de médiation doivent être validées par le propriétaire ou son conseil avant la mise en ligne."}</p><h2>{english ? "Publisher" : "Éditeur"}</h2><p>Zen Coffee Lab · Tours, France · contact@zencoffeelab.com</p><h2>{english ? "Data and orders" : "Données et commandes"}</h2><p>{english ? "Personal data is used only to process applications, accounts, orders, delivery and legal obligations. Analytics is loaded only after consent." : "Les données personnelles sont utilisées uniquement pour traiter les demandes, comptes, commandes, livraisons et obligations légales. La mesure d’audience n’est chargée qu’après consentement."}</p></div>)}</article>;
}
