import type { Locale } from "~/domain/types";

export function ComingSoonPage({ title, message, locale = "fr-FR" }: { title: string; message: string; locale?: Locale }) {
  return <main id="main-content" className="coming-soon-page">
    <div className="coming-soon-page__content">
      <img className="coming-soon-page__logo" src="/media/logo-black.svg" alt="Zen Coffee Lab" width="208" height="112" />
      <p className="eyebrow">{locale === "en-GB" ? "Micro-roastery" : "micro-torréfacteur"} · Tours</p>
      <h1>{title}</h1>
      <p className="coming-soon-page__message">{message}</p>
      <a href="mailto:contact@zencoffeelab.com">contact@zencoffeelab.com</a>
    </div>
  </main>;
}
