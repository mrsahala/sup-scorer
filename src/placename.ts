// Turns a geocoder's structured place fields into the one display string the
// site shows: "name, region" plus the country only when it isn't the
// visitor's own. Pure, so both geocoding paths and the reverse lookup share
// the same rule (docs/plans/ribbon-global.md section 3).
import type { Locale } from "./i18n";

export interface PlaceParts {
  name?: string | null;
  street?: string | null;
  district?: string | null;
  city?: string | null;
  county?: string | null;
  state?: string | null;
  countryCode?: string | null;
  // The geocoder's own country string, used when Intl can't name the code.
  countryName?: string | null;
}

export interface NameOptions {
  locale: Locale;
  // ISO 3166-1 alpha-2 of the visitor (Cloudflare's request.cf.country); null appends every country.
  viewerCountry?: string | null;
}

// "Germany" / "Duitsland" / "Deutschland" for "DE", per UI locale.
export function countryName(locale: Locale, code: string, fallback?: string | null): string {
  try {
    const name = new Intl.DisplayNames([locale], { type: "region", fallback: "none" }).of(code.toUpperCase());
    if (name) return name;
  } catch {
    // unknown code or no ICU data: fall through
  }
  return fallback || code.toUpperCase();
}

const clean = (v: string | null | undefined): string | null => (v && v.trim() ? v.trim() : null);
const same = (a: string | null, b: string | null): boolean => !!a && !!b && a.toLowerCase() === b.toLowerCase();

function countrySuffix(parts: PlaceParts, opts: NameOptions): string | null {
  const code = clean(parts.countryCode)?.toUpperCase() ?? null;
  if (!code) return null;
  if (opts.viewerCountry && code === opts.viewerCountry.toUpperCase()) return null;
  return countryName(opts.locale, code, parts.countryName);
}

// Search-result name: the place, one region that isn't the place itself
// (city first, then state, then county), and the country when foreign.
export function displayName(parts: PlaceParts, opts: NameOptions): string | null {
  const name = clean(parts.name);
  if (!name) return null;
  const region = [clean(parts.city), clean(parts.state), clean(parts.county)].find((r) => r && !same(r, name)) ?? null;
  return [name, region, countrySuffix(parts, opts)].filter(Boolean).join(", ");
}

// Reverse-lookup name for a GPS fix or a dropped pin: a named feature (a
// lake, a park), else the neighbourhood, else the town; then the town when
// it adds something; then the country when foreign.
export function reverseName(parts: PlaceParts, opts: NameOptions): string | null {
  const primary = clean(parts.name) ?? clean(parts.district) ?? clean(parts.city) ?? clean(parts.state);
  if (!primary) return null;
  const city = clean(parts.city);
  const town = city && !same(city, primary) ? city : null;
  return [primary, town, countrySuffix(parts, opts)].filter(Boolean).join(", ");
}
