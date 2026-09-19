// Forward (free-text search) and reverse (lat/lon -> place name) NL
// geocoding via PDOK's Locatieserver - Dutch government, free/keyless,
// chosen over Nominatim's shared demo server for NL-specific coverage and
// looser rate limits.
const ENDPOINT = "https://api.pdok.nl/bzk/locatieserver/search/v3_1/free";
const REVERSE_ENDPOINT = "https://api.pdok.nl/bzk/locatieserver/search/v3_1/reverse";

// One searchLocation match: a display name, PDOK's place-type ("gemeente",
// "woonplaats", etc. - shown nowhere in the UI today, kept for later use),
// and its coordinates.
export interface GeocodeResult {
  name: string;
  type: string;
  lat: number;
  lon: number;
}

// The shape of PDOK's free-text search response (only the fields
// requested via the `fl` query param above).
interface PdokResponse {
  response?: {
    docs?: { weergavenaam: string; type: string; centroide_ll?: string }[];
  };
}

export async function searchLocation(query: string, { limit = 5 }: { limit?: number } = {}): Promise<GeocodeResult[]> {
  const url = new URL(ENDPOINT);
  url.searchParams.set("q", query);
  url.searchParams.set("fl", "weergavenaam,centroide_ll,type");
  url.searchParams.set("rows", String(limit));

  const resp = await fetch(url);
  if (!resp.ok) {
    throw new Error(`PDOK geocode failed: ${resp.status} ${await resp.text()}`);
  }
  const data = (await resp.json()) as PdokResponse;

  const results: GeocodeResult[] = [];
  for (const doc of data.response?.docs ?? []) {
    // centroide_ll comes back as a WKT point string: "POINT(lon lat)".
    const match = /POINT\(([-\d.]+) ([-\d.]+)\)/.exec(doc.centroide_ll ?? "");
    if (!match) continue;
    results.push({ name: doc.weergavenaam, type: doc.type, lon: Number(match[1]), lat: Number(match[2]) });
  }
  return results;
}

interface PdokReverseResponse {
  response?: {
    docs?: { weergavenaam: string }[];
  };
}

async function reverseGeocodeByType(lat: number, lon: number, type: string): Promise<string | null> {
  const url = new URL(REVERSE_ENDPOINT);
  url.searchParams.set("lat", String(lat));
  url.searchParams.set("lon", String(lon));
  url.searchParams.set("type", type);
  url.searchParams.set("fl", "weergavenaam");
  url.searchParams.set("rows", "1");

  try {
    const resp = await fetch(url);
    if (!resp.ok) return null;
    const data = (await resp.json()) as PdokReverseResponse;
    const name = data.response?.docs?.[0]?.weergavenaam;
    // woonplaats' weergavenaam repeats the name across place/municipality/
    // province ("Utrecht, Utrecht, Utrecht") - only buurt's format doesn't
    // have a comma to begin with, so this is a no-op there.
    return name ? name.split(",")[0]!.trim() : null;
  } catch {
    return null;
  }
}

// Best-effort "what's this coordinate near" lookup, backing the GPS "use my
// location" button's display name. Tries buurt (neighborhood) level first -
// "Diamantbuurt Amsterdam" reads better than just "Amsterdam" - falling
// back to woonplaats (town/city) for a spot with no neighborhood
// classification (verified buurt still resolves fine right up to the
// water's edge for typical SUP spots, but a fallback costs nothing and
// covers anything more remote). Returns null (never throws) if both fail -
// this is a nice-to-have label, not worth failing the whole conditions
// page over.
export async function reverseGeocode(lat: number, lon: number): Promise<string | null> {
  return (await reverseGeocodeByType(lat, lon, "buurt")) ?? (await reverseGeocodeByType(lat, lon, "woonplaats"));
}
