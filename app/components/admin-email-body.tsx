import { useMemo, useState } from "react";
import { buildEmailHtmlDocument, hasRemoteEmailContent } from "~/lib/email-html";

type AdminEmailBodyProps = Readonly<{
  messageId: string;
  html: string | null;
  text: string | null;
  attachments: readonly { id: string; content_id: string | null }[];
}>;

export function AdminEmailBody({ messageId, html, text, attachments }: AdminEmailBodyProps) {
  const hasHtml = Boolean(html?.trim());
  const hasText = Boolean(text?.trim());
  const [view, setView] = useState<"html" | "text">(hasHtml ? "html" : "text");
  const [allowRemoteContent, setAllowRemoteContent] = useState(false);
  const includesRemoteContent = hasHtml && hasRemoteEmailContent(html ?? "");
  const emailDocument = useMemo(() => hasHtml ? buildEmailHtmlDocument({
    html: html ?? "",
    messageId,
    attachments: attachments.map((attachment) => ({ id: attachment.id, contentId: attachment.content_id })),
    allowRemoteContent,
  }) : "", [allowRemoteContent, attachments, hasHtml, html, messageId]);

  return <section className="admin-email-body" aria-label="Contenu du message">
    {hasHtml && hasText ? <div className="admin-email-body__toolbar" aria-label="Format d’affichage">
      <div role="group" aria-label="Version du message">
        <button type="button" className={view === "html" ? "is-active" : undefined} aria-pressed={view === "html"} onClick={() => setView("html")}>Message mis en page</button>
        <button type="button" className={view === "text" ? "is-active" : undefined} aria-pressed={view === "text"} onClick={() => setView("text")}>Texte brut</button>
      </div>
      {view === "html" && includesRemoteContent ? <button type="button" className={allowRemoteContent ? "is-active" : undefined} aria-pressed={allowRemoteContent} onClick={() => setAllowRemoteContent((current) => !current)}>{allowRemoteContent ? "Masquer les images distantes" : "Afficher les images distantes"}</button> : null}
    </div> : hasHtml && includesRemoteContent ? <div className="admin-email-body__toolbar admin-email-body__toolbar--end"><button type="button" className={allowRemoteContent ? "is-active" : undefined} aria-pressed={allowRemoteContent} onClick={() => setAllowRemoteContent((current) => !current)}>{allowRemoteContent ? "Masquer les images distantes" : "Afficher les images distantes"}</button></div> : null}
    {view === "html" && hasHtml ? <>
      {includesRemoteContent && !allowRemoteContent ? <p className="admin-email-body__privacy">Les images hébergées par l’expéditeur sont bloquées pour éviter de confirmer automatiquement l’ouverture du mail.</p> : null}
      <iframe
        className="admin-email-body__frame"
        title="Message mis en page"
        srcDoc={emailDocument}
        sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
        referrerPolicy="no-referrer"
      />
    </> : <pre className="admin-email-body__text">{text || "Ce message ne contient pas de version consultable."}</pre>}
  </section>;
}
