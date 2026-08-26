import type { Locale } from "~/domain/types";

export function displayTastingNote(note: string, locale: Locale) {
  if (locale !== "en-GB") return note;
  return note.replace(/^(\s*)(\p{L})/u, (_match, whitespace: string, firstLetter: string) => `${whitespace}${firstLetter.toLocaleUpperCase("en-GB")}`);
}
