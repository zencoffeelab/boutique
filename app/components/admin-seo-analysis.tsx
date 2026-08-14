import { useEffect, useRef, useState } from "react";

type SeoLocale = "fr-FR" | "en-GB";

type AssessmentResult = {
  getIdentifier(): string;
  getScore(): number;
  getText(): string;
};

type YoastAssessor = {
  assess(paper: unknown): void;
  getValidResults(): AssessmentResult[];
  getScoreAggregator(): {
    aggregate(results: AssessmentResult[]): number;
    setLocale?(locale: string): void;
  };
};

type YoastRuntime = {
  Paper: new (text: string, attributes: Record<string, unknown>) => unknown;
  Researcher: new (paper: unknown) => unknown;
  SEOAssessor: new (researcher: unknown) => YoastAssessor;
  ContentAssessor: new (researcher: unknown) => YoastAssessor;
  measureTextWidth(text: string): number;
};

type AnalysisItem = {
  id: string;
  score: number;
  source: "seo" | "readability";
};

type AnalysisSnapshot = {
  seoScore: number | null;
  readabilityScore: number;
  problems: AnalysisItem[];
  passed: AnalysisItem[];
  title: string;
  description: string;
  slug: string;
  wordCount: number;
};

type AdminSeoAnalysisProps = {
  formId: string;
  locale: SeoLocale;
  focusKeyphraseName: string;
  defaultFocusKeyphrase?: string;
  titleFieldName: string;
  seoTitleFieldName: string;
  seoDescriptionFieldName: string;
  slugFieldName?: string;
  slugValue?: string;
  contentFieldNames: readonly string[];
  contentFieldPrefixes?: readonly string[];
  imageAltFieldNames?: readonly string[];
  imageAltFieldPrefixes?: readonly string[];
  disabled?: boolean;
};

const labelByIdentifier: Record<string, { fr: string; en: string }> = {
  introductionKeyword: { fr: "Phrase-clé dans l’introduction", en: "Keyphrase in the introduction" },
  keyphraseLength: { fr: "Longueur de la phrase-clé", en: "Keyphrase length" },
  keyphraseDensity: { fr: "Densité de la phrase-clé", en: "Keyphrase density" },
  metaDescriptionKeyword: { fr: "Phrase-clé dans la méta-description", en: "Keyphrase in the meta description" },
  metaDescriptionLength: { fr: "Longueur de la méta-description", en: "Meta description length" },
  subheadingsKeyword: { fr: "Phrase-clé dans les intertitres", en: "Keyphrase in subheadings" },
  textCompetingLinks: { fr: "Liens concurrents", en: "Competing links" },
  imageKeyphrase: { fr: "Phrase-clé dans les textes alternatifs", en: "Keyphrase in image alt text" },
  images: { fr: "Images dans le contenu", en: "Images in the content" },
  textLength: { fr: "Longueur du contenu", en: "Content length" },
  externalLinks: { fr: "Liens externes", en: "Outbound links" },
  keyphraseInSEOTitle: { fr: "Phrase-clé dans le titre SEO", en: "Keyphrase in the SEO title" },
  internalLinks: { fr: "Liens internes", en: "Internal links" },
  titleWidth: { fr: "Longueur du titre SEO", en: "SEO title length" },
  slugKeyword: { fr: "Phrase-clé dans le slug", en: "Keyphrase in the slug" },
  functionWordsInKeyphrase: { fr: "Mots significatifs de la phrase-clé", en: "Meaningful words in the keyphrase" },
  singleH1: { fr: "Titre principal unique", en: "Single main heading" },
  subheadingsTooLong: { fr: "Répartition des intertitres", en: "Subheading distribution" },
  textParagraphTooLong: { fr: "Longueur des paragraphes", en: "Paragraph length" },
  textSentenceLength: { fr: "Longueur des phrases", en: "Sentence length" },
  textTransitionWords: { fr: "Mots de transition", en: "Transition words" },
  passiveVoice: { fr: "Voix passive", en: "Passive voice" },
  sentenceBeginnings: { fr: "Débuts de phrases variés", en: "Varied sentence beginnings" },
  textPresence: { fr: "Présence de contenu", en: "Content presence" },
};

const keyphraseChecks = new Set([
  "introductionKeyword",
  "keyphraseLength",
  "keyphraseDensity",
  "metaDescriptionKeyword",
  "subheadingsKeyword",
  "textCompetingLinks",
  "imageKeyphrase",
  "keyphraseInSEOTitle",
  "slugKeyword",
  "functionWordsInKeyphrase",
]);

const runtimePromises = new Map<SeoLocale, Promise<YoastRuntime>>();

function unwrapDefault<T>(value: T | { default: T }): T {
  if (value && typeof value === "object" && "default" in value) return (value as { default: T }).default;
  return value as T;
}

function loadYoast(locale: SeoLocale): Promise<YoastRuntime> {
  const existing = runtimePromises.get(locale);
  if (existing) return existing;
  const promise = Promise.all([
    import("yoastseo"),
    locale === "fr-FR"
      ? import("yoastseo/build/languageProcessing/languages/fr/Researcher.js")
      : import("yoastseo/build/languageProcessing/languages/en/Researcher.js"),
  ]).then(([yoastModule, researcherModule]) => {
    const yoast = yoastModule as typeof yoastModule & { default?: typeof yoastModule };
    const fallback = yoast.default ?? yoast;
    const Paper = yoast.Paper ?? fallback.Paper;
    const ContentAssessor = yoast.ContentAssessor ?? fallback.ContentAssessor;
    const SEOAssessor = yoast.assessors?.SEOAssessor;
    const measureTextWidth = yoast.helpers?.measureTextWidth;
    const Researcher = unwrapDefault(unwrapDefault(researcherModule as never));
    if (!Paper || !ContentAssessor || !SEOAssessor || !measureTextWidth || !Researcher) {
      throw new Error("Le moteur d’analyse Yoast n’a pas pu être initialisé.");
    }
    return { Paper, Researcher, SEOAssessor, ContentAssessor, measureTextWidth } as unknown as YoastRuntime;
  });
  runtimePromises.set(locale, promise);
  return promise;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function parseNestedJson(value: string): unknown {
  let parsed: unknown = value;
  for (let depth = 0; depth < 4 && typeof parsed === "string" && /^[\s]*[{[]/.test(parsed); depth += 1) {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      return value;
    }
  }
  return parsed;
}

function richNodeToHtml(value: unknown): string {
  if (!value || typeof value !== "object") return "";
  const node = value as { type?: unknown; text?: unknown; attrs?: Record<string, unknown>; content?: unknown[]; marks?: Array<{ type?: unknown; attrs?: Record<string, unknown> }> };
  if (node.type === "text") {
    let text = escapeHtml(typeof node.text === "string" ? node.text : "");
    for (const mark of node.marks ?? []) {
      if (mark.type === "link" && typeof mark.attrs?.href === "string") text = `<a href="${escapeHtml(mark.attrs.href)}">${text}</a>`;
      else if (mark.type === "strong" || mark.type === "bold") text = `<strong>${text}</strong>`;
      else if (mark.type === "em" || mark.type === "italic") text = `<em>${text}</em>`;
    }
    return text;
  }
  if (node.type === "hardBreak") return "<br>";
  if (node.type === "contentAccordion") {
    return `<h3>${escapeHtml(String(node.attrs?.title ?? ""))}</h3><p>${escapeHtml(String(node.attrs?.body ?? ""))}</p>`;
  }
  if (node.type === "contentTable") {
    const rows = Array.isArray(node.attrs?.rows) ? node.attrs.rows : [];
    return `<table>${rows.map((row) => `<tr>${(Array.isArray(row) ? row : []).map((cell) => `<td>${escapeHtml(String(cell ?? ""))}</td>`).join("")}</tr>`).join("")}</table>`;
  }
  const children = (node.content ?? []).map(richNodeToHtml).join("");
  if (node.type === "doc") return children;
  if (node.type === "heading") {
    const level = node.attrs?.level === 3 ? 3 : 2;
    return `<h${level}>${children}</h${level}>`;
  }
  const tagByType: Record<string, string> = {
    paragraph: "p",
    blockquote: "blockquote",
    bulletList: "ul",
    orderedList: "ol",
    listItem: "li",
    codeBlock: "pre",
  };
  const tag = typeof node.type === "string" ? tagByType[node.type] : undefined;
  return tag ? `<${tag}>${children}</${tag}>` : children;
}

function fieldValueToHtml(value: string) {
  const parsed = parseNestedJson(value);
  if (parsed && typeof parsed === "object" && (parsed as { type?: unknown }).type === "doc") return richNodeToHtml(parsed);
  return value
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${escapeHtml(paragraph.trim())}</p>`)
    .join("");
}

function valuesForName(form: HTMLFormElement, name: string) {
  return Array.from(form.elements)
    .filter((element): element is HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement =>
      element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement)
    .filter((element) => element.name === name)
    .map((element) => element.value);
}

function lastFieldValue(form: HTMLFormElement, name: string) {
  const values = valuesForName(form, name);
  for (let index = values.length - 1; index >= 0; index -= 1) {
    if (values[index]?.trim()) return values[index];
  }
  return values.at(-1) ?? "";
}

function valuesForPrefixes(form: HTMLFormElement, prefixes: readonly string[]) {
  const names = new Set(Array.from(form.elements)
    .filter((element): element is HTMLInputElement | HTMLTextAreaElement =>
      element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement)
    .filter((element) => prefixes.some((prefix) => element.name.startsWith(prefix)))
    .map((element) => element.name));
  return Array.from(names, (name) => lastFieldValue(form, name)).filter(Boolean);
}

function scoreTone(score: number | null) {
  if (score === null) return "pending";
  if (score >= 70) return "good";
  if (score >= 50) return "ok";
  return "bad";
}

function itemLabel(id: string, locale: SeoLocale) {
  const label = labelByIdentifier[id];
  return label ? (locale === "fr-FR" ? label.fr : label.en) : id;
}

function improvementText(item: AnalysisItem, locale: SeoLocale, wordCount: number) {
  const french = locale === "fr-FR";
  const suggestions: Record<string, readonly [string, string]> = {
    introductionKeyword: ["Placez la phrase-clé naturellement dès l’introduction.", "Use the keyphrase naturally in the introduction."],
    keyphraseLength: ["Choisissez une phrase-clé précise de deux à six mots.", "Choose a precise keyphrase of two to six words."],
    keyphraseDensity: ["Répartissez la phrase-clé naturellement dans le contenu, sans répétition forcée.", "Use the keyphrase naturally throughout the content without stuffing it."],
    metaDescriptionKeyword: ["Ajoutez la phrase-clé à la méta-description.", "Add the keyphrase to the meta description."],
    metaDescriptionLength: ["Visez une méta-description claire de 120 à 156 caractères.", "Aim for a clear meta description between 120 and 156 characters."],
    subheadingsKeyword: ["Utilisez la phrase-clé ou une variante dans au moins un intertitre pertinent.", "Use the keyphrase or a variation in a relevant subheading."],
    textCompetingLinks: ["Évitez d’utiliser la phrase-clé exacte comme ancre vers une autre page.", "Avoid using the exact keyphrase as link text to another page."],
    imageKeyphrase: ["Décrivez au moins une image avec un texte alternatif pertinent contenant la phrase-clé.", "Give a relevant image an alt text that includes the keyphrase."],
    images: ["Ajoutez au moins une image utile et renseignez son texte alternatif.", "Add at least one useful image and provide its alt text."],
    textLength: [`Le contenu analysé contient ${wordCount} mots. Développez-le si le sujet le justifie.`, `The analysed content contains ${wordCount} words. Expand it when the topic warrants it.`],
    externalLinks: ["Ajoutez un lien externe fiable lorsque cela apporte une source utile.", "Add a trustworthy outbound link when it provides a useful source."],
    keyphraseInSEOTitle: ["Placez la phrase-clé au début du titre SEO.", "Place the keyphrase near the start of the SEO title."],
    internalLinks: ["Ajoutez un lien vers une autre page pertinente du site.", "Add a link to another relevant page on the site."],
    titleWidth: ["Visez un titre SEO lisible d’environ 50 à 60 caractères.", "Aim for a readable SEO title of roughly 50 to 60 characters."],
    slugKeyword: ["Intégrez la phrase-clé principale dans le slug.", "Include the main keyphrase in the slug."],
    singleH1: ["Conservez un seul titre principal H1 dans la page.", "Keep a single H1 main heading on the page."],
    subheadingsTooLong: ["Découpez les longues sections avec des intertitres descriptifs.", "Break long sections up with descriptive subheadings."],
    textParagraphTooLong: ["Raccourcissez les paragraphes les plus longs.", "Shorten the longest paragraphs."],
    textSentenceLength: ["Raccourcissez les phrases difficiles à parcourir.", "Shorten sentences that are difficult to scan."],
    textTransitionWords: ["Ajoutez des mots de liaison pour fluidifier la lecture.", "Add transition words to improve the flow."],
    passiveVoice: ["Privilégiez davantage la voix active.", "Use the active voice more often."],
    sentenceBeginnings: ["Variez les débuts de phrases successives.", "Vary the beginnings of consecutive sentences."],
    textPresence: ["Ajoutez du contenu éditorial avant de lancer l’analyse.", "Add editorial content before running the analysis."],
  };
  const suggestion = suggestions[item.id];
  return suggestion ? suggestion[french ? 0 : 1] : (french ? "Ce point mérite une amélioration." : "This check needs improvement.");
}

function ResultsList({ items, locale, wordCount }: { items: readonly AnalysisItem[]; locale: SeoLocale; wordCount: number }) {
  return <ul className="admin-seo-analysis__results">
    {items.map((item) => <li className={`is-${item.score >= 8 ? "good" : item.score >= 5 ? "ok" : "bad"}`} key={`${item.source}-${item.id}`}>
      <span className="admin-seo-analysis__dot" aria-hidden="true" />
      <div><strong>{itemLabel(item.id, locale)}</strong>{item.score < 8 ? <small>{improvementText(item, locale, wordCount)}</small> : null}</div>
    </li>)}
  </ul>;
}

export function AdminSeoAnalysis({
  formId,
  locale,
  focusKeyphraseName,
  defaultFocusKeyphrase = "",
  titleFieldName,
  seoTitleFieldName,
  seoDescriptionFieldName,
  slugFieldName,
  slugValue = "",
  contentFieldNames,
  contentFieldPrefixes = [],
  imageAltFieldNames = [],
  imageAltFieldPrefixes = [],
  disabled = false,
}: AdminSeoAnalysisProps) {
  const containerRef = useRef<HTMLElement>(null);
  const [active, setActive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [snapshot, setSnapshot] = useState<AnalysisSnapshot | null>(null);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    if (!("IntersectionObserver" in window)) {
      setActive(true);
      return;
    }
    const observer = new IntersectionObserver(([entry]) => {
      if (entry?.isIntersecting) setActive(true);
    }, { rootMargin: "300px" });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!active) return;
    const form = document.getElementById(formId);
    if (!(form instanceof HTMLFormElement)) return;
    let timer = 0;
    let cancelled = false;
    const analyze = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(async () => {
        setLoading(true);
        try {
          const runtime = await loadYoast(locale);
          if (cancelled) return;
          const title = lastFieldValue(form, seoTitleFieldName).trim();
          const description = lastFieldValue(form, seoDescriptionFieldName).trim();
          const textTitle = lastFieldValue(form, titleFieldName).trim();
          const keyphrase = lastFieldValue(form, focusKeyphraseName).trim();
          const slug = (slugFieldName ? lastFieldValue(form, slugFieldName) : slugValue).trim();
          const contentValues = [
            ...contentFieldNames.map((name) => lastFieldValue(form, name)),
            ...valuesForPrefixes(form, contentFieldPrefixes),
          ].filter(Boolean);
          const altValues = [
            ...imageAltFieldNames.map((name) => lastFieldValue(form, name)),
            ...valuesForPrefixes(form, imageAltFieldPrefixes),
          ].filter(Boolean);
          const contentHtml = [
            `<h1>${escapeHtml(textTitle)}</h1>`,
            ...contentValues.map(fieldValueToHtml),
            ...altValues.map((alt) => `<img src="seo-analysis-placeholder.jpg" alt="${escapeHtml(alt)}">`),
          ].join("");
          const textContent = new DOMParser().parseFromString(contentHtml, "text/html").body.textContent ?? "";
          const wordCount = textContent.trim() ? textContent.trim().split(/\s+/u).length : 0;
          const paper = new runtime.Paper(contentHtml, {
            keyword: keyphrase,
            description,
            title,
            titleWidth: title ? runtime.measureTextWidth(title) : 0,
            slug,
            permalink: `${window.location.origin}/${slug.replace(/^\/+/, "")}`,
            locale: locale.replace("-", "_"),
            textTitle,
          });
          const researcher = new runtime.Researcher(paper);
          const seo = new runtime.SEOAssessor(researcher);
          const readability = new runtime.ContentAssessor(researcher);
          seo.assess(paper);
          readability.assess(paper);
          const seoResults = seo.getValidResults();
          const readabilityResults = readability.getValidResults();
          readability.getScoreAggregator().setLocale?.(locale.replace("-", "_"));
          const items: AnalysisItem[] = [
            ...seoResults.map((result) => ({ id: result.getIdentifier(), score: result.getScore(), source: "seo" as const })),
            ...readabilityResults.map((result) => ({ id: result.getIdentifier(), score: result.getScore(), source: "readability" as const })),
          ].filter((item) => keyphrase || !keyphraseChecks.has(item.id));
          setSnapshot({
            seoScore: keyphrase ? seo.getScoreAggregator().aggregate(seoResults) : null,
            readabilityScore: readability.getScoreAggregator().aggregate(readabilityResults),
            problems: items.filter((item) => item.score < 8),
            passed: items.filter((item) => item.score >= 8),
            title,
            description,
            slug,
            wordCount,
          });
          setError("");
        } catch (caught) {
          if (!cancelled) setError(caught instanceof Error ? caught.message : "L’analyse Yoast est indisponible.");
        } finally {
          if (!cancelled) setLoading(false);
        }
      }, 220);
    };
    analyze();
    form.addEventListener("input", analyze);
    form.addEventListener("change", analyze);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      form.removeEventListener("input", analyze);
      form.removeEventListener("change", analyze);
    };
  }, [active, contentFieldNames, contentFieldPrefixes, focusKeyphraseName, formId, imageAltFieldNames, imageAltFieldPrefixes, locale, seoDescriptionFieldName, seoTitleFieldName, slugFieldName, slugValue, titleFieldName]);

  const french = locale === "fr-FR";
  return <section ref={containerRef} className="admin-seo-analysis" aria-label={french ? "Analyse Yoast SEO" : "Yoast SEO analysis"}>
    <div className="admin-seo-analysis__heading">
      <div><strong>Yoast SEO</strong><small>{french ? "Analyse locale en temps réel" : "Live local analysis"}</small></div>
      <a href="https://www.npmjs.com/package/yoastseo" target="_blank" rel="noreferrer">YoastSEO.js</a>
    </div>
    <div className="field admin-seo-analysis__keyphrase">
      <label>{french ? "Phrase-clé cible" : "Focus keyphrase"}
        <input name={focusKeyphraseName} defaultValue={defaultFocusKeyphrase} maxLength={160} disabled={disabled} placeholder={french ? "ex. café de spécialité Tours" : "e.g. specialty coffee Tours"} />
      </label>
      <small>{french ? "Choisissez la requête principale recherchée par votre audience." : "Choose the main search query used by your audience."}</small>
    </div>
    {!active || (loading && !snapshot) ? <p className="admin-seo-analysis__status">{french ? "Chargement de l’analyse…" : "Loading analysis…"}</p> : null}
    {error ? <p className="form-error" role="alert">{error}</p> : null}
    {snapshot ? <>
      <div className="admin-seo-analysis__preview" aria-label={french ? "Aperçu du résultat Google" : "Google result preview"}>
        <span>{window.location.origin.replace(/^https?:\/\//, "")}/{snapshot.slug}</span>
        <strong>{snapshot.title || (french ? "Titre SEO à compléter" : "SEO title to complete")}</strong>
        <p>{snapshot.description || (french ? "Description SEO à compléter." : "SEO description to complete.")}</p>
        <small>{snapshot.title.length} {french ? "caractères dans le titre" : "title characters"} · {snapshot.description.length} {french ? "dans la description" : "description characters"}</small>
      </div>
      <div className="admin-seo-analysis__scores" aria-live="polite">
        <div className={`is-${scoreTone(snapshot.seoScore)}`}><span>{french ? "SEO" : "SEO"}</span><strong>{snapshot.seoScore === null ? "—" : `${snapshot.seoScore}/100`}</strong></div>
        <div className={`is-${scoreTone(snapshot.readabilityScore)}`}><span>{french ? "Lisibilité" : "Readability"}</span><strong>{snapshot.readabilityScore}/100</strong></div>
      </div>
      {snapshot.seoScore === null ? <p className="admin-seo-analysis__notice">{french ? "Renseignez la phrase-clé cible pour obtenir le score SEO complet." : "Enter a focus keyphrase to get the complete SEO score."}</p> : null}
      {snapshot.problems.length ? <div className="admin-seo-analysis__checks"><h5>{french ? "À améliorer" : "Needs improvement"}</h5><ResultsList items={snapshot.problems} locale={locale} wordCount={snapshot.wordCount} /></div> : <p className="admin-seo-analysis__success">{french ? "Tous les contrôles applicables sont validés." : "All applicable checks are passed."}</p>}
      {snapshot.passed.length ? <details className="admin-seo-analysis__passed"><summary>{french ? `${snapshot.passed.length} contrôles validés` : `${snapshot.passed.length} passed checks`}</summary><ResultsList items={snapshot.passed} locale={locale} wordCount={snapshot.wordCount} /></details> : null}
    </> : null}
    <small className="admin-seo-analysis__privacy">{french ? "Le contenu reste dans votre navigateur : aucune donnée n’est envoyée à Yoast." : "Content stays in your browser: no data is sent to Yoast."}</small>
  </section>;
}
