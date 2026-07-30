import { Eye, Save } from "lucide-react";
import { useState } from "react";
import { Form } from "react-router";
import type { Locale } from "~/domain/types";
import type { ComingSoonSettings } from "~/lib/coming-soon";

export function AdminComingSoonEditor({ initialSettings, demo }: { initialSettings: ComingSoonSettings; demo: boolean }) {
  const [active, setActive] = useState(initialSettings.active);
  const [previewLocale, setPreviewLocale] = useState<Locale>("fr-FR");
  const [titleFr, setTitleFr] = useState(initialSettings.translations["fr-FR"].title);
  const [messageFr, setMessageFr] = useState(initialSettings.translations["fr-FR"].message);
  const [titleEn, setTitleEn] = useState(initialSettings.translations["en-GB"].title);
  const [messageEn, setMessageEn] = useState(initialSettings.translations["en-GB"].message);
  const preview = previewLocale === "fr-FR"
    ? { title: titleFr, message: messageFr }
    : { title: titleEn, message: messageEn };

  return <Form method="post" className="admin-coming-soon-editor">
    <input type="hidden" name="intent" value="save_coming_soon" />
    <input type="hidden" name="active" value="false" />
    <section className="ui-card admin-coming-soon-editor__settings" aria-labelledby="coming-soon-settings-title">
      <div className="admin-coming-soon-editor__heading">
        <div>
          <p className="eyebrow">Visibilité du site</p>
          <h2 id="coming-soon-settings-title">Site en construction</h2>
          <p>Une fois activé, cet écran remplace toutes les pages publiques. Le back-office reste accessible.</p>
        </div>
        <label className="admin-coming-soon-switch">
          <input
            type="checkbox"
            name="active"
            value="true"
            checked={active}
            disabled={demo}
            onChange={(event) => setActive(event.currentTarget.checked)}
          />
          <span aria-hidden="true" />
          <strong>{active ? "Activé" : "Désactivé"}</strong>
        </label>
      </div>
      <div className="admin-content-columns admin-coming-soon-editor__translations">
        <fieldset>
          <legend>Français</legend>
          <div className="field"><label>Titre<input name="titleFr" value={titleFr} maxLength={140} required disabled={demo} onChange={(event) => setTitleFr(event.currentTarget.value)} /></label></div>
          <div className="field"><label>Message<textarea name="messageFr" value={messageFr} maxLength={500} rows={4} required disabled={demo} onChange={(event) => setMessageFr(event.currentTarget.value)} /></label></div>
        </fieldset>
        <fieldset>
          <legend>English</legend>
          <div className="field"><label>Title<input name="titleEn" value={titleEn} maxLength={140} required disabled={demo} onChange={(event) => setTitleEn(event.currentTarget.value)} /></label></div>
          <div className="field"><label>Message<textarea name="messageEn" value={messageEn} maxLength={500} rows={4} required disabled={demo} onChange={(event) => setMessageEn(event.currentTarget.value)} /></label></div>
        </fieldset>
      </div>
    </section>

    <section className="ui-card admin-coming-soon-preview" aria-labelledby="coming-soon-preview-title">
      <div className="admin-coming-soon-preview__toolbar">
        <div><p className="eyebrow"><Eye aria-hidden="true" /> Aperçu</p><h2 id="coming-soon-preview-title">Écran public</h2></div>
        <div className="admin-coming-soon-preview__languages" aria-label="Langue de l’aperçu">
          <button type="button" className={previewLocale === "fr-FR" ? "is-active" : undefined} aria-pressed={previewLocale === "fr-FR"} onClick={() => setPreviewLocale("fr-FR")}>FR</button>
          <button type="button" className={previewLocale === "en-GB" ? "is-active" : undefined} aria-pressed={previewLocale === "en-GB"} onClick={() => setPreviewLocale("en-GB")}>EN</button>
        </div>
      </div>
      <div className="admin-coming-soon-preview__screen">
        <img src="/media/logo-black.svg" alt="Zen Coffee Lab" width="156" height="84" />
        <p className="eyebrow">Micro-roastery · Tours</p>
        <h3>{preview.title || "—"}</h3>
        <p>{preview.message || "—"}</p>
        <span>contact@zencoffeelab.com</span>
      </div>
    </section>

    <div className="admin-navigation-organizer__actions">
      <button className="ui-button ui-button--default" type="submit" disabled={demo}><Save aria-hidden="true" /> Enregistrer le mode construction</button>
    </div>
  </Form>;
}
