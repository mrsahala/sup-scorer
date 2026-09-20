// i18n: EN/NL/DE now, more locales later - add a Locale union member here
// and a matching dictionary in i18n-strings.ts. URL scheme is always-prefix
// (/en/..., /nl/..., /de/...), never an unprefixed default: today's default
// is English, but the plan is to flip the default to Dutch once the .nl
// domain is live, and an unprefixed-default scheme would silently change
// what language every existing bookmarked/shared URL serves the day that
// happens. Always-prefix means every URL is permanent regardless of which
// locale is "default"; only the bare "/" redirect target changes.
//
// Place names are deliberately NOT translated - proper nouns, not UI copy.
export type Locale = "en" | "nl" | "de";
export const LOCALES: Locale[] = ["en", "nl", "de"];
export const DEFAULT_LOCALE: Locale = "en";

import { STRINGS, COMPASS, DATE_LOCALE, LOCALE_NAME, type StringKey } from "./i18n-strings";

// vars' values are inserted as-is (not escaped) - callers must escape any
// untrusted value (e.g. a place name) before passing it in here. This lets
// vars also carry pre-built trusted HTML (e.g. an <a> link fragment).
export function t(locale: Locale, key: StringKey, vars?: Record<string, string>): string {
  const dict = STRINGS[locale] ?? STRINGS[DEFAULT_LOCALE];
  let str = dict[key] ?? STRINGS[DEFAULT_LOCALE][key];
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      str = str.replaceAll(`{${k}}`, v);
    }
  }
  return str;
}

// Compass label (N, NO, O, ...) for a wind-from bearing, per locale.
export function compassLabel(locale: Locale, deg: number): string {
  const table = COMPASS[locale] ?? COMPASS[DEFAULT_LOCALE];
  return table[Math.round(deg / 45) % 8]!;
}

// BCP-47 tag for Date.toLocaleDateString(), per locale.
export function dateLocale(locale: Locale): string {
  return DATE_LOCALE[locale] ?? DATE_LOCALE[DEFAULT_LOCALE];
}

// Dates are already bucketed into Europe/Amsterdam days by weather.ts, so
// they parse and format as UTC midnight and never shift.
function parseDay(date: string): Date {
  return new Date(`${date}T00:00:00Z`);
}

function addDays(date: string, days: number): string {
  const d = parseDay(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// Weekday abbreviation ("Mon", "ma", "Mo", ...) for a "YYYY-MM-DD" date.
export function weekdayShort(locale: Locale, date: string): string {
  return new Intl.DateTimeFormat(dateLocale(locale), { weekday: "short", timeZone: "UTC" }).format(
    parseDay(date),
  );
}

// Today/Tomorrow/weekday label for a day card header, both "YYYY-MM-DD".
export function dayLabel(locale: Locale, date: string, today: string): string {
  if (date === today) return t(locale, "today");
  if (date === addDays(today, 1)) return t(locale, "tomorrow");
  return weekdayShort(locale, date);
}

// Display name for a locale, used by the language switcher.
export function localeName(locale: Locale): string {
  return LOCALE_NAME[locale] ?? locale;
}

function isLocale(value: string | undefined): value is Locale {
  return LOCALES.includes(value as Locale);
}

// Splits a "/<locale>/rest/of/path" pathname into { locale, path }, where
// path is always "/"-rooted with no trailing slash (except "/" itself).
// Returns null when the first segment isn't a recognized locale - the
// caller decides what that means (redirect, 404, fall through to assets).
export function parseLocalizedPath(pathname: string): { locale: Locale; path: string } | null {
  const parts = pathname.split("/");
  const maybeLocale = parts[1];
  if (!isLocale(maybeLocale)) return null;

  let rest = "/" + parts.slice(2).join("/");
  if (rest.length > 1 && rest.endsWith("/")) rest = rest.slice(0, -1);
  return { locale: maybeLocale, path: rest === "" ? "/" : rest };
}

// The same path under a different locale, for the language switcher -
// preserves the query string (a locale switch on /nl/search?q=... or
// /nl/conditions?lat=... must not drop the params).
export function localizedUrl(locale: Locale, path: string, search: string): string {
  const suffix = path === "/" ? "" : path;
  return `/${locale}${suffix}${search}`;
}
