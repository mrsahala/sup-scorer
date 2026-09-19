// Curated NL SUP spots for the landing page (ticket 2.2).
//
// DRAFT SEED LIST - best-effort placeholder coordinates picked without
// local knowledge, not verified against real launch points, parking, or
// wind exposure. Needs a real pass before this is trustworthy - see the
// design doc's Phase 2.2. Amsterdam's entry reuses config.ts's precise,
// already-verified LOCATION; the rest are approximate.
import { LOCATION } from "./config";

// One curated location: slug is the URL segment (`/spots/:slug`), name is
// what's shown to visitors (currently English-only - place names aren't
// translated, see i18n.ts's own comment on that).
export interface Spot {
  slug: string;
  name: string;
  lat: number;
  lon: number;
}

export const SPOTS: Spot[] = [
  {
    slug: "amsterdam-churchill-laan",
    name: "Amsterdam – Churchill-laan (Amstel)",
    lat: LOCATION.lat,
    lon: LOCATION.lon,
  },
  { slug: "amsterdam-sloterplas", name: "Amsterdam – Sloterplas", lat: 52.3667, lon: 4.8167 },
  { slug: "rotterdam-kralingse-plas", name: "Rotterdam – Kralingse Plas", lat: 51.935, lon: 4.517 },
  { slug: "aalsmeer-westeinderplassen", name: "Aalsmeer – Westeinderplassen", lat: 52.25, lon: 4.75 },
  { slug: "loosdrecht-plassen", name: "Loosdrecht – Loosdrechtse Plassen", lat: 52.193, lon: 5.07 },
  { slug: "zandvoort-aan-zee", name: "Zandvoort aan Zee", lat: 52.373, lon: 4.533 },
  { slug: "scheveningen", name: "Scheveningen Beach", lat: 52.108, lon: 4.28 },
];

// Looks up a curated spot by its URL slug.
export function findSpot(slug: string): Spot | undefined {
  return SPOTS.find((s) => s.slug === slug);
}
