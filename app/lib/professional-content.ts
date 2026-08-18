export type ProfessionalPageContent = {
  eyebrow: string; lede: string; loginLabel: string;
  steps: Array<{ title: string; text: string }>;
  applicationTitle: string; applicationIntro: string; submitLabel: string; sendingLabel: string;
  fieldLabels: { company: string; country: string; lastName: string; firstName: string; email: string; phone: string; business: string; volume: string; choose: string; privacy: string };
  banner: { eyebrow: string; title: string; text: string };
  success: { eyebrow: string; title: string; text: string; accountLabel: string; shopLabel: string };
  catalog: { eyebrow: string; title: string; lede: string; empty: string };
};
export type ProfessionalConnectedPageContent = { eyebrow: string; title: string; lede: string; steps: Array<{ title: string; text: string }>; shopText: string; shopButton: string; contactText: string; contactButton: string; sampleText: string; sampleButton: string; bannerEyebrow: string; bannerTitle: string; bannerText: string };

const connectedDefaults: Record<"fr-FR" | "en-GB", ProfessionalConnectedPageContent> = {
  "fr-FR": { eyebrow: "B2B · Zen Coffee Lab", title: "Du café pensé pour votre établissement", lede: "Des cafés traçables, des profils constants et un accompagnement direct par le torréfacteur.", steps: [{ title: "Présentez votre activité", text: "Complétez le formulaire en quelques minutes." }, { title: "Validation manuelle", text: "Nous étudions chaque demande et revenons vers vous." }, { title: "Accès sécurisé", text: "Définissez votre mot de passe et accédez aux conditions pro." }], shopText: "Vous savez déjà ce que vous voulez, ou vous êtes en quête d’exploration ? Rendez-vous dans la boutique", shopButton: "Rendez-vous dans la boutique", contactText: "Vous ne savez pas quoi choisir, vous nous laissez carte blanche ?", contactButton: "Nous contacter", sampleText: "Besoin d’échantillons ? C’est par ici", sampleButton: "Demander un devis", bannerEyebrow: "Une vraie relation", bannerTitle: "Le café n’est que le début.", bannerText: "Recettes, calibrage, accompagnement des équipes et recommandations de saison." },
  "en-GB": { eyebrow: "B2B · Zen Coffee Lab", title: "Coffee made for your business", lede: "Traceable coffees, consistent profiles and direct support from the roaster.", steps: [{ title: "Tell us about your business", text: "Complete the form in a few minutes." }, { title: "Manual review", text: "We review every request and get back to you." }, { title: "Secure access", text: "Set your password and access professional terms." }], shopText: "Already know what you want, or looking to explore? Visit the shop", shopButton: "Visit the shop", contactText: "Not sure what to choose? Leave it to us.", contactButton: "Contact us", sampleText: "Need samples? This way.", sampleButton: "Request a quote", bannerEyebrow: "A real relationship", bannerTitle: "Coffee is only the beginning.", bannerText: "Recipes, calibration, team guidance and seasonal recommendations." },
};

const defaults: Record<"fr-FR" | "en-GB", ProfessionalPageContent> = {
  "fr-FR": {
    eyebrow: "B2B · Zen Coffee Lab", lede: "Des cafés traçables, des profils constants et un accompagnement direct par le torréfacteur.", loginLabel: "Connexion",
    steps: [{ title: "Présentez votre activité", text: "Complétez le formulaire en quelques minutes." }, { title: "Validation manuelle", text: "Nous étudions chaque demande et revenons vers vous." }, { title: "Accès sécurisé", text: "Définissez votre mot de passe et accédez aux conditions pro." }],
    applicationTitle: "Demander un compte", applicationIntro: "Tous les champs sont obligatoires.", submitLabel: "Envoyer la demande", sendingLabel: "Envoi…",
    fieldLabels: { company: "Votre raison sociale", country: "Pays", lastName: "Nom", firstName: "Prénom", email: "Email", phone: "Téléphone", business: "Business", volume: "Volume mensuel", choose: "Choisir", privacy: "J’accepte que mes données soient utilisées pour traiter cette demande." },
    banner: { eyebrow: "Une vraie relation", title: "Le café n’est que le début.", text: "Recettes, calibrage, accompagnement des équipes et recommandations de saison." },
    success: { eyebrow: "Demande envoyée", title: "Merci, votre demande a bien été prise en compte.", text: "Notre équipe va maintenant l’étudier. Vous recevrez un e-mail dès qu’une décision aura été prise.", accountLabel: "Voir mon compte", shopLabel: "Découvrir nos cafés" },
    catalog: { eyebrow: "Zen Coffee Lab", title: "La boutique des professionnels", lede: "Des cafés lumineux et traçables, torréfiés à la demande.", empty: "Aucun café professionnel n’est disponible actuellement." },
  },
  "en-GB": {
    eyebrow: "B2B · Zen Coffee Lab", lede: "Traceable coffees, consistent profiles and direct support from the roaster.", loginLabel: "Sign in",
    steps: [{ title: "Tell us about your business", text: "Complete the form in a few minutes." }, { title: "Manual review", text: "We review every request and get back to you." }, { title: "Secure access", text: "Set your password and access professional terms." }],
    applicationTitle: "Apply for an account", applicationIntro: "All fields are required.", submitLabel: "Send application", sendingLabel: "Sending…",
    fieldLabels: { company: "Company name", country: "Country", lastName: "Last name", firstName: "First name", email: "Email", phone: "Phone", business: "Business", volume: "Monthly volume", choose: "Choose", privacy: "I agree that my data will be used to process this application." },
    banner: { eyebrow: "A real relationship", title: "Coffee is only the beginning.", text: "Recipes, calibration, team guidance and seasonal recommendations." },
    success: { eyebrow: "Application sent", title: "Thank you, we have received your application.", text: "Our team will review it. You will receive an email as soon as a decision has been made.", accountLabel: "View my account", shopLabel: "Discover our coffees" },
    catalog: { eyebrow: "Zen Coffee Lab", title: "The professional shop", lede: "Bright, traceable coffees, roasted to order.", empty: "No professional coffee is currently available." },
  },
};

export function getProfessionalPageContent(locale: "fr-FR" | "en-GB", blocks?: Array<{ type?: unknown; content?: unknown }> | null): ProfessionalPageContent {
  const fallback = defaults[locale];
  const raw = blocks?.find((block) => block.type === "professionalPage")?.content;
  if (!raw || typeof raw !== "object") return fallback;
  const value = raw as Partial<ProfessionalPageContent>;
  return { ...fallback, ...value, steps: Array.isArray(value.steps) && value.steps.length === 3 ? value.steps as ProfessionalPageContent["steps"] : fallback.steps, fieldLabels: { ...fallback.fieldLabels, ...(value.fieldLabels ?? {}) }, banner: { ...fallback.banner, ...(value.banner ?? {}) }, success: { ...fallback.success, ...(value.success ?? {}) }, catalog: { ...fallback.catalog, ...(value.catalog ?? {}) } };
}

export const professionalPageDefaults = defaults;

export function getProfessionalConnectedPageContent(locale: "fr-FR" | "en-GB", blocks?: Array<{ type?: unknown; content?: unknown }> | null): ProfessionalConnectedPageContent {
  const fallback = connectedDefaults[locale];
  const raw = blocks?.find((block) => block.type === "professionalConnectedPage")?.content;
  if (!raw || typeof raw !== "object") return fallback;
  const value = raw as Partial<ProfessionalConnectedPageContent>;
  return { ...fallback, ...value, steps: Array.isArray(value.steps) && value.steps.length === 3 ? value.steps as ProfessionalConnectedPageContent["steps"] : fallback.steps };
}
