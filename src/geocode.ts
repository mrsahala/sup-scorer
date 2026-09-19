// Free-text NL location search (ticket 2.3), backing the "or search any
// location" escape hatch from the design doc's Location UX section.
//
// PDOK's Locatieserver - Dutch government geocoding, free/keyless - chosen
// over Nominatim's shared demo server: it's built specifically for NL
// addresses/place names and doesn't carry Nominatim's strict shared-server
// rate limits.
const ENDPOINT = "https://api.pdok.nl/bzk/locatieserver/search/v3_1/free";

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
