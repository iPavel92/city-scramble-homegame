// Supported languages, shared by client (UI + OSM requests) and server
// (challenge pool + OSM name localization).
export type Lang = "en" | "de" | "es" | "fr" | "ru";

export const LANGS: { code: Lang; label: string }[] = [
  { code: "en", label: "English" },
  { code: "de", label: "Deutsch" },
  { code: "es", label: "Español" },
  { code: "fr", label: "Français" },
  { code: "ru", label: "Русский" },
];

export const DEFAULT_LANG: Lang = "en";

export function isLang(x: string): x is Lang {
  return LANGS.some((l) => l.code === x);
}

/** Normalize a locale string (e.g. "de-AT") to a supported Lang, or default. */
export function normalizeLang(x: string | null | undefined): Lang {
  if (!x) return DEFAULT_LANG;
  const base = x.toLowerCase().split(/[-_]/)[0];
  return isLang(base) ? base : DEFAULT_LANG;
}
