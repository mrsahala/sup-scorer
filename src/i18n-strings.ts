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
  siteTitleAttribution: "supdawg — data & privacy",
  subtitleSpot: "SUP conditions for {location}",
  subtitleAttribution: "Where the data comes from, what the site stores, and what it can't promise",
  noForecast: "No forecast data available.",
  backHome: "← back",
  searchPlaceholder: "Search any place in the Netherlands",
  useMyLocation: "Use my location",
  myLocation: "My location",
  locationFailed: "Couldn't get your location",
  noSearchResults: "No matches",
  searchFailed: "Search failed",
  invalidLatLon: "Missing or invalid lat/lon",
  locating: "Locating…",
  saveSpot: "Save this spot",
  unsaveSpot: "Remove from saved spots",
  savedSpots: "Saved spots",
  today: "Today",
  tomorrow: "Tomorrow",
  tomorrowShort: "Tmrw",
  bestToday: "Best today {range} · {tier}",
  allDayToday: "{tier} all day today · {hours}h of daylight",
  noWindowToday: "No good window today · next {day} {hour}",
  noWindowAhead: "No good window in the next {days} days",
  pillAllDay: "{tier} all day",
  pillNone: "No window",
  metaLine: "wind {wind} km/h · {temp}°C · sunrise {sunrise} · sunset {sunset}",
  windowLabel: "{tier} {hours}h",
  unitKmh: "km/h",
  keyWind: "wind",
  keyGust: "gust",
  guideLabel: "{tier} ≤{kmh}",
  now: "now",
  detailFrom: "from {compass}",
  reasonGust: "gust-limited · gusts {gust} km/h",
  reasonCold: "too cold · {temp}°C",
  reasonSustained: "sustained {wind} km/h",
  glanceAllDay: "all day",
  glanceNone: "no window",
  switcherOpenHint: "Pick a spot to get started",
  windFrom: "wind from {compass}",
  showOnMap: "Show this spot on a map",
  mapHint: "Drag the pin or tap the map to pick the exact spot",
  useThisPoint: "Use this point",
  pickedPoint: "Picked point",
  dataAttribution: "Data & privacy",
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
    "The site's code is open source (MIT licensed) - see the {repoLink}.",
  attrTilesBody:
    "Map images are loaded by your browser directly from {pdokLink} (Kadaster), which therefore sees your IP address, as it would for any website's images.",
  privLocationHeading: "Your location",
  privLocationBody:
    "On your first visit the site uses the approximate location that comes with your internet connection to open on a nearby spot. It is used once to render that page and is not stored. The \"use my location\" button asks your browser for a precise position; that only happens when you press it.",
  privStorageHeading: "What this site stores in your browser",
  privStorageBody:
    "Nothing, until you press the star. Starring a spot saves it in a small cookie in your browser (<code>sd_spots</code>) so the chip row can show it again; once you have a saved spot the site also remembers the last spot you viewed (<code>sd_last</code>) so it opens there next time. Both stay in your browser for up to 90 days, are never sent anywhere except back to this site to render your page, and disappear when you unstar every spot or clear cookies. There are no analytics, no tracking, no accounts and no third-party scripts.",
  privAboutHeading: "About this site",
  privAboutBody:
    "supdawg is a free, non-commercial hobby project run by {owner}, reachable at {contact}. The source code is on {repoLink}.",
  privDisclaimerHeading: "No guarantee",
  privDisclaimerBody:
    "The verdicts on this site are computed from a public weather forecast using fixed thresholds. Forecasts are uncertain, conditions on open water can differ from the forecast at any moment, and this site cannot know your skill, your board or the water you are on. Use it as one input, not as a decision. You are responsible for your own safety; check official warnings from KNMI before going out.",
  footerDisclaimer: "Forecasts, not guarantees. Check conditions on the water yourself.",
  savedInBrowser: "Saved in this browser only.",
} as const;

// The set of translatable keys, and the shape every locale's dictionary
// must satisfy - this is what makes a missing/misspelled key in nl/de a
// compile-time error rather than a silent fallback to English.
export type StringKey = keyof typeof EN;
export type Dictionary = Record<StringKey, string>;

const NL: Dictionary = {
  siteTitleSpot: "supdawg — SUP-omstandigheden {location}",
  siteTitleAttribution: "supdawg — gegevens & privacy",
  subtitleSpot: "SUP-omstandigheden voor {location}",
  subtitleAttribution: "Waar de gegevens vandaan komen, wat de site bewaart en wat hij niet kan beloven",
  noForecast: "Geen voorspellingsgegevens beschikbaar.",
  backHome: "← terug",
  searchPlaceholder: "Zoek een plek in Nederland",
  useMyLocation: "Gebruik mijn locatie",
  myLocation: "Mijn locatie",
  locationFailed: "Kon je locatie niet bepalen",
  noSearchResults: "Geen resultaten",
  searchFailed: "Zoeken mislukt",
  invalidLatLon: "Ontbrekende of ongeldige lat/lon",
  locating: "Locatie bepalen…",
  saveSpot: "Deze plek opslaan",
  unsaveSpot: "Verwijderen uit opgeslagen plekken",
  savedSpots: "Opgeslagen plekken",
  today: "Vandaag",
  tomorrow: "Morgen",
  tomorrowShort: "Morgen",
  bestToday: "Beste tijd vandaag {range} · {tier}",
  allDayToday: "{tier} de hele dag vandaag · {hours}u daglicht",
  noWindowToday: "Geen goed moment vandaag · volgende op {day} {hour}",
  noWindowAhead: "Geen goed moment in de komende {days} dagen",
  pillAllDay: "{tier} de hele dag",
  pillNone: "Geen moment",
  metaLine: "wind {wind} km/u · {temp}°C · zonsopkomst {sunrise} · zonsondergang {sunset}",
  windowLabel: "{tier} {hours}u",
  unitKmh: "km/u",
  keyWind: "wind",
  keyGust: "windstoten",
  guideLabel: "{tier} ≤{kmh}",
  now: "nu",
  detailFrom: "uit het {compass}",
  reasonGust: "beperkt door windstoten · windstoten {gust} km/u",
  reasonCold: "te koud · {temp}°C",
  reasonSustained: "aanhoudend {wind} km/u",
  glanceAllDay: "hele dag",
  glanceNone: "geen moment",
  switcherOpenHint: "Kies een plek om te beginnen",
  windFrom: "wind uit het {compass}",
  showOnMap: "Toon deze plek op een kaart",
  mapHint: "Versleep de pin of tik op de kaart voor de precieze plek",
  useThisPoint: "Gebruik dit punt",
  pickedPoint: "Gekozen punt",
  dataAttribution: "Gegevens & privacy",
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
    "De code van deze site is open source (MIT-licentie) - zie de {repoLink}.",
  attrTilesBody:
    "Kaartbeelden laadt je browser rechtstreeks van {pdokLink} (Kadaster), dat daardoor je IP-adres ziet, net als bij de afbeeldingen van elke andere website.",
  privLocationHeading: "Je locatie",
  privLocationBody:
    "Bij je eerste bezoek gebruikt de site de globale locatie die bij je internetverbinding hoort om te openen op een plek in de buurt. Die wordt één keer gebruikt om die pagina te maken en niet bewaard. De knop \"mijn locatie\" vraagt je browser om een precieze positie; dat gebeurt alleen als je erop drukt.",
  privStorageHeading: "Wat deze site in je browser bewaart",
  privStorageBody:
    "Niets, totdat je op de ster drukt. Een plek opslaan zet hem in een klein cookie in je browser (<code>sd_spots</code>), zodat de rij met plekken hem opnieuw kan tonen; zodra je een opgeslagen plek hebt, onthoudt de site ook de laatst bekeken plek (<code>sd_last</code>) zodat hij daar de volgende keer op opent. Beide blijven maximaal 90 dagen in je browser, worden nergens anders heen gestuurd dan terug naar deze site om je pagina te maken, en verdwijnen als je alle plekken weer uit je lijst haalt of je cookies wist. Er is geen analytics, geen tracking, geen account en geen script van derden.",
  privAboutHeading: "Over deze site",
  privAboutBody:
    "supdawg is een gratis, niet-commercieel hobbyproject van {owner}, bereikbaar via {contact}. De broncode staat op {repoLink}.",
  privDisclaimerHeading: "Geen garantie",
  privDisclaimerBody:
    "De oordelen op deze site worden berekend uit een openbare weersverwachting met vaste drempels. Verwachtingen zijn onzeker, de omstandigheden op open water kunnen op elk moment afwijken, en deze site kent je ervaring, je board of het water waarop je vaart niet. Gebruik hem als één van je bronnen, niet als beslissing. Je bent zelf verantwoordelijk voor je veiligheid; check de officiële waarschuwingen van het KNMI voordat je het water op gaat.",
  footerDisclaimer: "Verwachtingen, geen garanties. Beoordeel de omstandigheden op het water zelf.",
  savedInBrowser: "Alleen in deze browser opgeslagen.",
};

const DE: Dictionary = {
  siteTitleSpot: "supdawg — SUP-Bedingungen {location}",
  siteTitleAttribution: "supdawg — Daten & Datenschutz",
  subtitleSpot: "SUP-Bedingungen für {location}",
  subtitleAttribution: "Woher die Daten stammen, was die Seite speichert und was sie nicht versprechen kann",
  noForecast: "Keine Vorhersagedaten verfügbar.",
  backHome: "← zurück",
  searchPlaceholder: "Beliebigen Ort in den Niederlanden suchen",
  useMyLocation: "Meinen Standort verwenden",
  myLocation: "Mein Standort",
  locationFailed: "Standort konnte nicht ermittelt werden",
  noSearchResults: "Keine Treffer",
  searchFailed: "Suche fehlgeschlagen",
  invalidLatLon: "Fehlende oder ungültige lat/lon",
  locating: "Standort wird ermittelt…",
  saveSpot: "Diesen Ort speichern",
  unsaveSpot: "Aus gespeicherten Orten entfernen",
  savedSpots: "Gespeicherte Orte",
  today: "Heute",
  tomorrow: "Morgen",
  tomorrowShort: "Morgen",
  bestToday: "Beste Zeit heute {range} · {tier}",
  allDayToday: "{tier} den ganzen Tag heute · {hours}Std. Tageslicht",
  noWindowToday: "Heute kein gutes Fenster · nächstes am {day} {hour}",
  noWindowAhead: "Kein gutes Fenster in den nächsten {days} Tagen",
  pillAllDay: "{tier} den ganzen Tag",
  pillNone: "Kein Fenster",
  metaLine: "Wind {wind} km/h · {temp}°C · Sonnenaufgang {sunrise} · Sonnenuntergang {sunset}",
  windowLabel: "{tier} {hours}h",
  unitKmh: "km/h",
  keyWind: "Wind",
  keyGust: "Böen",
  guideLabel: "{tier} ≤{kmh}",
  now: "jetzt",
  detailFrom: "aus {compass}",
  reasonGust: "durch Böen begrenzt · Böen {gust} km/h",
  reasonCold: "zu kalt · {temp}°C",
  reasonSustained: "anhaltend {wind} km/h",
  glanceAllDay: "ganzer Tag",
  glanceNone: "kein Fenster",
  switcherOpenHint: "Wähle einen Ort, um zu starten",
  windFrom: "Wind aus {compass}",
  showOnMap: "Diesen Ort auf einer Karte zeigen",
  mapHint: "Ziehe die Nadel oder tippe auf die Karte für den genauen Ort",
  useThisPoint: "Diesen Punkt verwenden",
  pickedPoint: "Gewählter Punkt",
  dataAttribution: "Daten & Datenschutz",
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
    "Der Code dieser Seite ist Open Source (MIT-Lizenz) - siehe das {repoLink}.",
  attrTilesBody:
    "Kartenbilder lädt dein Browser direkt von {pdokLink} (Kadaster), das dadurch deine IP-Adresse sieht, wie bei den Bildern jeder anderen Website auch.",
  privLocationHeading: "Dein Standort",
  privLocationBody:
    "Beim ersten Besuch nutzt die Seite den ungefähren Standort, der zu deiner Internetverbindung gehört, um einen Ort in der Nähe zu öffnen. Er wird einmal zum Aufbau dieser Seite verwendet und nicht gespeichert. Der Knopf \"meinen Standort verwenden\" fragt deinen Browser nach einer genauen Position; das passiert nur, wenn du ihn drückst.",
  privStorageHeading: "Was diese Seite in deinem Browser speichert",
  privStorageBody:
    "Nichts, bis du auf den Stern drückst. Einen Ort zu speichern legt ihn in einem kleinen Cookie in deinem Browser ab (<code>sd_spots</code>), damit die Ortsleiste ihn wieder anzeigen kann; sobald du einen gespeicherten Ort hast, merkt sich die Seite auch den zuletzt angesehenen Ort (<code>sd_last</code>), um beim nächsten Mal dort zu öffnen. Beide bleiben höchstens 90 Tage in deinem Browser, werden nirgendwohin gesendet außer zurück an diese Seite zum Aufbau deiner Seite, und verschwinden, wenn du alle Orte wieder entfernst oder deine Cookies löschst. Es gibt keine Analyse, kein Tracking, keine Konten und keine Skripte Dritter.",
  privAboutHeading: "Über diese Seite",
  privAboutBody:
    "supdawg ist ein kostenloses, nicht-kommerzielles Hobbyprojekt von {owner}, erreichbar unter {contact}. Der Quellcode liegt auf {repoLink}.",
  privDisclaimerHeading: "Keine Garantie",
  privDisclaimerBody:
    "Die Bewertungen auf dieser Seite werden aus einer öffentlichen Wettervorhersage mit festen Schwellenwerten berechnet. Vorhersagen sind unsicher, die Bedingungen auf offenem Wasser können jederzeit davon abweichen, und diese Seite kennt weder dein Können noch dein Board oder das Gewässer. Nutze sie als einen Anhaltspunkt, nicht als Entscheidung. Du bist selbst für deine Sicherheit verantwortlich; prüfe vor dem Rausfahren die amtlichen Warnungen (in den Niederlanden: KNMI).",
  footerDisclaimer: "Vorhersagen, keine Garantien. Beurteile die Bedingungen auf dem Wasser selbst.",
  savedInBrowser: "Nur in diesem Browser gespeichert.",
};

export const STRINGS: Record<Locale, Dictionary> = { en: EN, nl: NL, de: DE };
