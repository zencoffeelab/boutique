import { splitQuotedMailHistory } from "~/lib/mail-threads";

export function MailThreadBody({ text, fallback }: { text: string | null | undefined; fallback: string }) {
  const { body, quotedHistory } = splitQuotedMailHistory(text);
  return <>
    <p>{body || fallback}</p>
    {quotedHistory ? <details className="mail-quoted-history">
      <summary aria-label="Afficher l’historique cité">...</summary>
      <p>{quotedHistory}</p>
    </details> : null}
  </>;
}
