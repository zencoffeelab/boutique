const HTML_ENTITY = /&(?:#(x[0-9a-f]+|\d+)|([a-z][a-z0-9]+));/gi;

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&", apos: "'", quot: "\"", lt: "<", gt: ">", nbsp: " ",
  agrave: "à", acirc: "â", aelig: "æ", ccedil: "ç", eacute: "é", egrave: "è", ecirc: "ê", euml: "ë",
  icirc: "î", iuml: "ï", ocirc: "ô", oelig: "œ", ugrave: "ù", ucirc: "û", uuml: "ü", yuml: "ÿ",
  laquo: "«", raquo: "»", ndash: "–", mdash: "—", hellip: "…", rsquo: "’", lsquo: "‘", ldquo: "“", rdquo: "”",
};

/** Decodes the entity-encoded characters some mail clients put in their plain-text part. */
export function decodeEmailEntities(value: string | null | undefined) {
  if (!value) return value ?? "";
  return value.replace(HTML_ENTITY, (source, numeric: string | undefined, named: string | undefined) => {
    if (numeric) {
      const parsed = numeric[0]?.toLowerCase() === "x" ? Number.parseInt(numeric.slice(1), 16) : Number.parseInt(numeric, 10);
      if (Number.isInteger(parsed) && parsed >= 0 && parsed <= 0x10ffff && !(parsed >= 0xd800 && parsed <= 0xdfff)) return String.fromCodePoint(parsed);
      return source;
    }
    return named ? (NAMED_ENTITIES[named.toLowerCase()] ?? source) : source;
  });
}
