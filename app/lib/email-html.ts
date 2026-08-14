export type EmailHtmlAttachment = Readonly<{
  id: string;
  contentId: string | null;
}>;

type EmailHtmlDocumentOptions = Readonly<{
  html: string;
  messageId: string;
  attachments: readonly EmailHtmlAttachment[];
  allowRemoteContent: boolean;
}>;

const DOCUMENT_WRAPPERS = /<!doctype[^>]*>|<\/?(?:html|head|body)(?:\s[^>]*)?>/gi;
const ACTIVE_CONTENT = /<(script|iframe|object|embed|applet)\b[^>]*>[\s\S]*?<\/\1\s*>|<(?:script|iframe|object|embed|applet)\b[^>]*\/?>/gi;
const META_OR_BASE = /<(?:meta|base)\b[^>]*>/gi;
const REMOTE_RESOURCE = /<(?:img|source|video|audio)\b[^>]*(?:src|srcset|background|poster)\s*=\s*["']?\s*(?:https?:)?\/\/|<link\b[^>]*href\s*=\s*["']?\s*(?:https?:)?\/\/|(?:url\(|@import\s+)["'(\s]*\s*(?:https?:)?\/\//i;

function normalizedContentId(value: string) {
  let decoded = value;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    // Some senders use percent characters that are not valid URI escapes.
  }
  return decoded.trim().replace(/^<|>$/g, "").toLocaleLowerCase("en-US");
}

function safeEmailFragment(html: string) {
  return html
    .replace(ACTIVE_CONTENT, "")
    .replace(META_OR_BASE, "")
    .replace(DOCUMENT_WRAPPERS, "")
    .replace(/<a\b([^>]*)>/gi, (_tag, attributes: string) => {
      const withoutNavigationAttributes = attributes
        .replace(/\s+target\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "")
        .replace(/\s+rel\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "");
      return `<a${withoutNavigationAttributes} target="_blank" rel="noopener noreferrer">`;
    });
}

export function hasRemoteEmailContent(html: string) {
  return REMOTE_RESOURCE.test(html);
}

export function buildEmailHtmlDocument(options: EmailHtmlDocumentOptions) {
  const cidUrls = new Map(
    options.attachments.flatMap((attachment) => attachment.contentId
      ? [[normalizedContentId(attachment.contentId), `/admin/messagerie/${encodeURIComponent(options.messageId)}/pieces-jointes/${encodeURIComponent(attachment.id)}?inline=1`] as const]
      : []),
  );
  const fragment = safeEmailFragment(options.html).replace(/cid:([^"'\s)>]+)/gi, (source, contentId: string) => cidUrls.get(normalizedContentId(contentId)) ?? source);
  const resourcePolicy = options.allowRemoteContent
    ? "img-src 'self' data: blob: http: https:; style-src 'unsafe-inline' http: https:; font-src data: http: https:; media-src http: https:;"
    : "img-src 'self' data: blob:; style-src 'unsafe-inline'; font-src data:; media-src 'none';";
  const policy = `default-src 'none'; ${resourcePolicy} script-src 'none'; frame-src 'none'; object-src 'none'; connect-src 'none'; form-action 'none'; base-uri 'none'`;

  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="${policy}">
<style>
  html { color-scheme: light; background: #fff; }
  body { min-width: 0; margin: 0; padding: 16px; overflow-wrap: anywhere; }
  img { max-width: 100%; }
  table { max-width: 100%; }
</style>
</head>
<body>${fragment}</body>
</html>`;
}
