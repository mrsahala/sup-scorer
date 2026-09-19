// Per-locale data tables - kept separate from i18n.ts's functions since
// this is what actually grows as more UI copy or locales get added; the
// functions that read it don't change nearly as often.
import type { Locale } from "./i18n";

export const LOCALE_NAME: Record<Locale, string> = { en: "English", nl: "Nederlands", de: "Deutsch" };
export const DATE_LOCALE: Record<Locale, string> = { en: "en-GB", nl: "nl-NL", de: "de-DE" };
// Compass point labels, indexed by round(bearingDeg / 45) % 8.
export const COMPASS: Record<Locale, [string, string, string, string, string, string, string, string]> = {
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
  useMyLocation: "📍 Use my location",
  myLocation: "My location",
  locationFailed: "Couldn't get your location - try search instead.",
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

// The set of translatable keys, and the shape every locale's dictionary
// must satisfy - this is what makes a missing/misspelled key in nl/de a
// compile-time error rather than a silent fallback to English.
export type StringKey = keyof typeof EN;
export type Dictionary = Record<StringKey, string>;

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
  useMyLocation: "📍 Gebruik mijn locatie",
  myLocation: "Mijn locatie",
  locationFailed: "Kon je locatie niet bepalen - probeer te zoeken.",
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
  useMyLocation: "📍 Meinen Standort verwenden",
  myLocation: "Mein Standort",
  locationFailed: "Standort konnte nicht ermittelt werden - versuche die Suche.",
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

export const STRINGS: Record<Locale, Dictionary> = { en: EN, nl: NL, de: DE };
