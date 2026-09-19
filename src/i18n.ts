// i18n: EN/NL/DE now, more locales later - just add a Locale union member
// and a STRINGS entry; TS enforces every locale defines every key (see
// StringKey below). URL scheme is always-prefix (/en/..., /nl/..., /de/...),
// never an unprefixed default: today's default is English, but the plan is
// to flip the default to Dutch once the .nl domain is live, and an
// unprefixed-default scheme would silently change what language every
// existing bookmarked/shared URL serves the day that happens. Always-prefix
// means every URL is permanent regardless of which locale is "default";
// only the bare "/" redirect target changes.
//
// Place names (spots.ts's Spot.name, PDOK search results) are deliberately
// NOT translated - they're proper nouns, not UI copy.
export type Locale = "en" | "nl" | "de";
export const LOCALES: Locale[] = ["en", "nl", "de"];
export const DEFAULT_LOCALE: Locale = "en";

const LOCALE_NAME: Record<Locale, string> = { en: "English", nl: "Nederlands", de: "Deutsch" };
const DATE_LOCALE: Record<Locale, string> = { en: "en-GB", nl: "nl-NL", de: "de-DE" };
const COMPASS: Record<Locale, [string, string, string, string, string, string, string, string]> = {
  en: ["N", "NE", "E", "SE", "S", "SW", "W", "NW"],
  nl: ["N", "NO", "O", "ZO", "Z", "ZW", "W", "NW"],
  de: ["N", "NO", "O", "SO", "S", "SW", "W", "NW"],
};

// English is the source of truth for which keys exist; nl/de are typed
// against it below, so a missing or misspelled key in either is a
// compile-time error, not a silent runtime fallback.
const EN = {
  siteTitleSpot: "supdawg — {location} SUP conditions",
  siteTitleLanding: "supdawg — SUP conditions in the Netherlands",
  siteTitleSearch: "supdawg — search: {query}",
  siteTitleAttribution: "supdawg — data attribution",
  subtitleSpot: "SUP conditions for {location}",
  subtitleLanding: "SUP conditions anywhere in the Netherlands",
  subtitleSearch: 'Results for "{query}"',
  subtitleAttribution: "Where the data comes from",
  legend:
    "daylight hours only · wind/gust in km/h · arrow = direction wind is blowing towards · * = gust-limited",
  noForecast: "No forecast data available.",
  backToSpots: "← back to all spots",
  searchPlaceholder: "Search any NL location…",
  searchButton: "Search",
  popularSpots: "Popular spots",
  noMatches: 'No matches for "{query}".',
  searchFailed: "Search failed - try again.",
  spotNotFound: "Spot not found",
  invalidLatLon: "Missing or invalid lat/lon",
  windFrom: "wind from {compass}",
  dataAttribution: "Data attribution",
  tierGreat: "Great",
  tierGood: "Good",
  tierMarginal: "OK",
  tierPoor: "Poor",
  tierAvoid: "Avoid",
  attrWeatherHeading: "Weather forecast",
  attrWeatherBody:
    "Hourly wind speed, gusts, temperature, and sunrise/sunset times come from {openMeteoLink}, used under {licenseLink}. supdawg computes a SUP-conditions score from this forecast; the underlying weather data itself isn't altered.",
  attrLocationHeading: "Location search",
  attrLocationBody:
    "Free-text Netherlands location search is powered by {pdokLink}, Dutch government open geodata.",
  attrScoringHeading: "Scoring logic",
  attrScoringBody:
    "The site's code is open source (MIT licensed) - see the {repoLink}. The exact wind/gust/temperature thresholds behind each tier are in {configLink} - no hidden logic.",
} as const;

type StringKey = keyof typeof EN;
type Dictionary = Record<StringKey, string>;

const NL: Dictionary = {
  siteTitleSpot: "supdawg — SUP-omstandigheden {location}",
  siteTitleLanding: "supdawg — SUP-omstandigheden in heel Nederland",
  siteTitleSearch: "supdawg — zoeken: {query}",
  siteTitleAttribution: "supdawg — gegevensbronnen",
  subtitleSpot: "SUP-omstandigheden voor {location}",
  subtitleLanding: "SUP-omstandigheden voor elke locatie in Nederland",
  subtitleSearch: 'Resultaten voor "{query}"',
  subtitleAttribution: "Waar de gegevens vandaan komen",
  legend:
    "alleen daguren · wind/windstoten in km/u · pijl = richting waar de wind naartoe waait · * = beperkt door windstoten",
  noForecast: "Geen voorspellingsgegevens beschikbaar.",
  backToSpots: "← terug naar alle locaties",
  searchPlaceholder: "Zoek een locatie in Nederland…",
  searchButton: "Zoeken",
  popularSpots: "Populaire locaties",
  noMatches: 'Geen resultaten voor "{query}".',
  searchFailed: "Zoeken mislukt - probeer het opnieuw.",
  spotNotFound: "Locatie niet gevonden",
  invalidLatLon: "Ontbrekende of ongeldige lat/lon",
  windFrom: "wind uit het {compass}",
  dataAttribution: "Gegevensbronnen",
  tierGreat: "Geweldig",
  tierGood: "Goed",
  tierMarginal: "Matig",
  tierPoor: "Slecht",
  tierAvoid: "Vermijden",
  attrWeatherHeading: "Weersvoorspelling",
  attrWeatherBody:
    "Uurlijkse windsnelheid, windstoten, temperatuur en zonsopgang/-ondergang komen van {openMeteoLink}, gebruikt onder {licenseLink}. supdawg berekent een SUP-score op basis van deze voorspelling; de onderliggende weergegevens zelf worden niet aangepast.",
  attrLocationHeading: "Locatie zoeken",
  attrLocationBody:
    "Vrije tekst zoeken naar locaties in Nederland wordt mogelijk gemaakt door {pdokLink}, open geodata van de Nederlandse overheid.",
  attrScoringHeading: "Scorelogica",
  attrScoringBody:
    "De code van deze site is open source (MIT-licentie) - zie de {repoLink}. De exacte wind/windstoot/temperatuur-drempels achter elke score staan in {configLink} - geen verborgen logica.",
};

const DE: Dictionary = {
  siteTitleSpot: "supdawg — SUP-Bedingungen {location}",
  siteTitleLanding: "supdawg — SUP-Bedingungen in den Niederlanden",
  siteTitleSearch: "supdawg — Suche: {query}",
  siteTitleAttribution: "supdawg — Datenquellen",
  subtitleSpot: "SUP-Bedingungen für {location}",
  subtitleLanding: "SUP-Bedingungen für jeden Ort in den Niederlanden",
  subtitleSearch: 'Ergebnisse für "{query}"',
  subtitleAttribution: "Woher die Daten stammen",
  legend:
    "nur Tagesstunden · Wind/Böen in km/h · Pfeil = Richtung, in die der Wind weht · * = durch Böen begrenzt",
  noForecast: "Keine Vorhersagedaten verfügbar.",
  backToSpots: "← zurück zu allen Spots",
  searchPlaceholder: "Beliebigen Ort in den Niederlanden suchen…",
  searchButton: "Suchen",
  popularSpots: "Beliebte Spots",
  noMatches: 'Keine Treffer für "{query}".',
  searchFailed: "Suche fehlgeschlagen - bitte erneut versuchen.",
  spotNotFound: "Spot nicht gefunden",
  invalidLatLon: "Fehlende oder ungültige lat/lon",
  windFrom: "Wind aus {compass}",
  dataAttribution: "Datenquellen",
  tierGreat: "Spitze",
  tierGood: "Gut",
  tierMarginal: "Mäßig",
  tierPoor: "Schlecht",
  tierAvoid: "Meiden",
  attrWeatherHeading: "Wettervorhersage",
  attrWeatherBody:
    "Stündliche Windgeschwindigkeit, Böen, Temperatur sowie Sonnenauf-/-untergang stammen von {openMeteoLink}, genutzt unter {licenseLink}. supdawg berechnet daraus eine SUP-Bewertung; die zugrunde liegenden Wetterdaten selbst werden nicht verändert.",
  attrLocationHeading: "Ortssuche",
  attrLocationBody:
    "Die Freitext-Ortssuche für die Niederlande wird von {pdokLink} bereitgestellt, offenen Geodaten der niederländischen Regierung.",
  attrScoringHeading: "Bewertungslogik",
  attrScoringBody:
    "Der Code dieser Seite ist Open Source (MIT-Lizenz) - siehe das {repoLink}. Die genauen Wind-/Böen-/Temperaturschwellen hinter jeder Stufe stehen in {configLink} - keine versteckte Logik.",
};

const STRINGS: Record<Locale, Dictionary> = { en: EN, nl: NL, de: DE };

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
