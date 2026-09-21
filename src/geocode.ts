// Forward and reverse geocoding, worldwide: Photon (komoot, OpenStreetMap
// data) first, Open-Meteo's geocoder as the search fallback when Photon is
// down or throttling. Names are formatted by placename.ts.
import { t, type Locale } from "./i18n";
import { displayName, reverseName, type PlaceParts } from "./placename";

const PHOTON_SEARCH = "https://photon.komoot.io/api/";
const PHOTON_REVERSE = "https://photon.komoot.io/reverse";
const OPEN_METEO_SEARCH = "https://geocoding-api.open-meteo.com/v1/search";
// Both providers ask callers to identify themselves.
const USER_AGENT = "supdawg.nl (contact via /en/attribution)";
const TIMEOUT_MS = 2000;

// One searchLocation match. `name` is the full display string; `kind` is a
// small vocabulary (city, town, village, lake, beach, bay, or "") used for
// the localized `type` label the switcher shows next to the name.
export interface GeocodeResult {
  name: string;
  type: string;
  kind: string;
  lat: number;
  lon: number;
  country: string | null;
}

export interface GeocodeOptions {
  locale?: Locale;
  viewerCountry?: string | null;
}

// Photon only knows these; Dutch visitors get the local (usually Dutch) name.
const PHOTON_LANGS: Partial<Record<Locale, string>> = { en: "en", de: "de" };

interface PhotonFeature {
  geometry?: { coordinates?: [number, number] };
  properties?: {
    name?: string;
    street?: string;
    district?: string;
    city?: string;
    county?: string;
    state?: string;
    country?: string;
    countrycode?: string;
    osm_key?: string;
    osm_value?: string;
    type?: string;
  };
}

interface OpenMeteoPlace {
  name: string;
  admin1?: string;
  admin2?: string;
  country?: string;
  country_code?: string;
  latitude: number;
  longitude: number;
}

const KIND_KEYS = {
  city: "kindCity",
  town: "kindTown",
  village: "kindVillage",
  lake: "kindLake",
  beach: "kindBeach",
  bay: "kindBay",
} as const;
type Kind = keyof typeof KIND_KEYS;

function photonKind(p: NonNullable<PhotonFeature["properties"]>): Kind | "" {
  const v = p.osm_value ?? "";
  if (v === "city" || v === "town" || v === "village" || v === "lake" || v === "beach" || v === "bay") return v;
  if (v === "hamlet") return "village";
  if (p.osm_key === "natural" && v === "water") return "lake";
  if (p.type === "city") return "city";
  return "";
}

function kindLabel(locale: Locale, kind: Kind | ""): string {
  return kind ? t(locale, KIND_KEYS[kind]) : "";
}

function photonParts(p: NonNullable<PhotonFeature["properties"]>): PlaceParts {
  return {
    name: p.name,
    street: p.street,
    district: p.district,
    city: p.city,
    county: p.county,
    state: p.state,
    countryCode: p.countrycode,
    countryName: p.country,
  };
}

async function getJson(url: URL): Promise<unknown> {
  const resp = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!resp.ok) throw new Error(`${url.host} ${resp.status}`);
  return resp.json();
}

async function searchPhoton(query: string, limit: number, locale: Locale, viewerCountry: string | null): Promise<GeocodeResult[]> {
  const url = new URL(PHOTON_SEARCH);
  url.searchParams.set("q", query);
  url.searchParams.set("limit", String(limit));
  const lang = PHOTON_LANGS[locale];
  if (lang) url.searchParams.set("lang", lang);

  const data = (await getJson(url)) as { features?: PhotonFeature[] };
  const results: GeocodeResult[] = [];
  const seen = new Set<string>();
  for (const f of data.features ?? []) {
    const p = f.properties;
    const [lon, lat] = f.geometry?.coordinates ?? [];
    if (!p || !Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const name = displayName(photonParts(p), { locale, viewerCountry });
    if (!name) continue;
    const kind = photonKind(p);
    const type = kindLabel(locale, kind);
    // Two street segments or two lake polygons read as the same row; keep the first.
    if (seen.has(`${name}|${type}`)) continue;
    seen.add(`${name}|${type}`);
    results.push({ name, type, kind, lat: lat!, lon: lon!, country: p.countrycode ?? null });
  }
  return results;
}

// City/town level only, no reverse - enough to keep search working when Photon isn't.
async function searchOpenMeteo(query: string, limit: number, locale: Locale, viewerCountry: string | null): Promise<GeocodeResult[]> {
  const url = new URL(OPEN_METEO_SEARCH);
  url.searchParams.set("name", query);
  url.searchParams.set("count", String(limit));
  url.searchParams.set("language", locale);

  const data = (await getJson(url)) as { results?: OpenMeteoPlace[] };
  const results: GeocodeResult[] = [];
  for (const r of data.results ?? []) {
    const name = displayName(
      { name: r.name, state: r.admin1, county: r.admin2, countryCode: r.country_code, countryName: r.country },
      { locale, viewerCountry }
    );
    if (!name || !Number.isFinite(r.latitude) || !Number.isFinite(r.longitude)) continue;
    results.push({ name, type: "", kind: "", lat: r.latitude, lon: r.longitude, country: r.country_code ?? null });
  }
  return results;
}

// Search-as-you-type suggestions. Throws only when both providers fail.
export async function searchLocation(
  query: string,
  { limit = 5, locale = "en", viewerCountry = null }: GeocodeOptions & { limit?: number } = {}
): Promise<GeocodeResult[]> {
  try {
    return await searchPhoton(query, limit, locale, viewerCountry);
  } catch (photonErr) {
    try {
      return await searchOpenMeteo(query, limit, locale, viewerCountry);
    } catch (fallbackErr) {
      throw new Error(`geocode failed: ${String(photonErr)}; fallback: ${String(fallbackErr)}`);
    }
  }
}

// "What's this coordinate", for the GPS button and the map pin. Never
// throws - null means the caller shows a generic fallback instead.
export async function reverseGeocode(
  lat: number,
  lon: number,
  { locale = "en", viewerCountry = null }: GeocodeOptions = {}
): Promise<string | null> {
  const url = new URL(PHOTON_REVERSE);
  url.searchParams.set("lat", String(lat));
  url.searchParams.set("lon", String(lon));
  const lang = PHOTON_LANGS[locale];
  if (lang) url.searchParams.set("lang", lang);
  try {
    const data = (await getJson(url)) as { features?: PhotonFeature[] };
    const p = data.features?.[0]?.properties;
    return p ? reverseName(photonParts(p), { locale, viewerCountry }) : null;
  } catch {
    return null;
  }
}
