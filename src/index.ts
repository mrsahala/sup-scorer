// The Worker's entry point: routing, spot resolution, and the JSON APIs.
//
// Every URL is locale-prefixed (/en/..., /nl/..., /de/...) - see i18n.ts.
//
// "/<locale>/" resolves the visitor's spot (sd_last cookie -> IP -> default)
// and renders it directly; there is no landing page. "/<locale>/conditions"
// renders any other point and remembers it as sd_last.
//
// "/api/*" are plain JSON, called by the client-side script.
import { fetchForecast } from "./weather";
import { scoreHour, type ScoredHour } from "./scoring";
import { LOCATION, type Tier } from "./config";
import { renderConditionsPage, renderAttributionPage } from "./render";
import { searchLocation, reverseGeocode } from "./geocode";
import { t, parseLocalizedPath, weekdayShort, DEFAULT_LOCALE, LOCALES, type Locale } from "./i18n";
import { groupByDate, glance } from "./windows";
import { parseSdLast, parseSdSpots, serializeSdLast, isLocalhost } from "./cookies";

// The Worker's bindings, matching wrangler.jsonc's `assets` block. ASSETS
// is what serves everything under public/ (see fetch()'s fallback below).
// Hand-written rather than generated via `wrangler types` since there's
// only the one binding - worth switching to generated types if more get added.
interface Env {
  ASSETS: Fetcher;
}

// Title shown when the visitor's location can't be determined.
const DEFAULT_SPOT_NAME = "Amsterdamse Bos";

const html = (body: string) => new Response(body, { headers: { "content-type": "text/html; charset=utf-8" } });

// The forecast's timezone travels with the hours: "today" and the now marker
// are computed in the spot's own zone, not the Worker's (UTC) or Amsterdam's.
async function computeScoredHours({
  lat,
  lon,
}: {
  lat: number;
  lon: number;
}): Promise<{ scoredHours: ScoredHour[]; timezone: string }> {
  const { hours, timezone } = await fetchForecast({ lat, lon });
  return { scoredHours: hours.map(scoreHour), timezone };
}

// Cloudflare resolves each request's approximate lat/lon (and city) from the client IP on request.cf - free, no extra request needed.
function ipLocationFrom(request: Request): { lat: number; lon: number; name: string | null } | null {
  const cf = request.cf as IncomingRequestCfProperties | undefined;
  const lat = Number(cf?.latitude);
  const lon = Number(cf?.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return { lat, lon, name: cf?.city ?? null };
}

interface StartingSpot {
  lat: number;
  lon: number;
  name: string | null;
  gps: boolean;
  switcherOpen: boolean;
}

// "/{locale}/" order: sd_last cookie -> IP guess -> LOCATION, switcher open only on the last branch.
function resolveStartingSpot(
  cookieHeader: string | null,
  ipLocation: { lat: number; lon: number; name: string | null } | null
): StartingSpot {
  const last = parseSdLast(cookieHeader);
  if (last) return { lat: last.lat, lon: last.lon, name: last.name, gps: last.gps, switcherOpen: false };
  if (ipLocation) {
    return { lat: ipLocation.lat, lon: ipLocation.lon, name: ipLocation.name, gps: false, switcherOpen: false };
  }
  return { lat: LOCATION.lat, lon: LOCATION.lon, name: DEFAULT_SPOT_NAME, gps: false, switcherOpen: true };
}

// Not itself an entrypoint - called from fetch() below (the Worker's actual entrypoint) for every localized route.
async function handleAppRoute(
  locale: Locale,
  path: string,
  url: URL,
  request: Request,
  ipLocation: { lat: number; lon: number; name: string | null } | null
): Promise<Response> {
  const currentPath = path;
  const search = url.search;
  const cookieHeader = request.headers.get("Cookie");
  const savedSpots = parseSdSpots(cookieHeader);

  if (path === "/") {
    const spot = resolveStartingSpot(cookieHeader, ipLocation);
    const [{ scoredHours, timezone }, resolvedName] = await Promise.all([
      computeScoredHours({ lat: spot.lat, lon: spot.lon }),
      spot.name ? Promise.resolve(spot.name) : reverseGeocode(spot.lat, spot.lon),
    ]);
    const name = resolvedName || t(locale, "myLocation");
    return html(
      renderConditionsPage({
        locale,
        spot: { name, lat: spot.lat, lon: spot.lon, gps: spot.gps },
        scoredHours,
        timezone,
        currentPath,
        search,
        switcherOpen: spot.switcherOpen,
        savedSpots,
      })
    );
  }

  if (path === "/conditions") {
    const lat = Number(url.searchParams.get("lat"));
    const lon = Number(url.searchParams.get("lon"));
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      return new Response(t(locale, "invalidLatLon"), { status: 400 });
    }
    const gps = url.searchParams.get("src") === "gps";
    // A "name" is only ever missing when the GPS button linked here directly
    // with raw coordinates (search results always pass one, already
    // resolved by PDOK's forward lookup) - reverse-geocode a label for that
    // case, alongside the forecast fetch rather than after it.
    const paramName = url.searchParams.get("name");
    const [{ scoredHours, timezone }, resolvedName] = await Promise.all([
      computeScoredHours({ lat, lon }),
      paramName ? Promise.resolve(paramName) : reverseGeocode(lat, lon),
    ]);
    const name = resolvedName || t(locale, "myLocation");
    const response = html(
      renderConditionsPage({
        locale,
        spot: { name, lat, lon, gps },
        scoredHours,
        timezone,
        currentPath,
        search,
        // Open the panel only for this fresh GPS navigation, not whenever a
        // persisted gps-derived spot happens to be reloaded later.
        mapOpen: gps,
        savedSpots,
      })
    );
    // Remember the spot only for visitors who have starred one: that press is
    // the explicit opt-in that lets a persistent preference cookie skip consent.
    if (savedSpots.length > 0) {
      response.headers.append("Set-Cookie", serializeSdLast({ name, lat, lon, gps }, { secure: !isLocalhost(url) }));
    }
    return response;
  }

  if (path === "/attribution") {
    return html(renderAttributionPage({ locale, currentPath, search }));
  }

  return new Response("Not found", { status: 404 });
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

// Rounds to 3 decimals, matching weather.ts's Open-Meteo rounding.
function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

function isLocale(value: string | null): value is Locale {
  return (LOCALES as readonly string[]).includes(value ?? "");
}

// Chip badge text - see docs/plans/ribbon-ux.md section 4 / prototype's glance() for the text rules.
async function buildGlance(lat: number, lon: number, locale: Locale): Promise<{ tier: Tier | null; text: string }> {
  const { scoredHours } = await computeScoredHours({ lat, lon });
  const days = groupByDate(scoredHours);
  const g = glance(days.map((d) => d.hours));
  if (g.dayIndex === null) {
    return { tier: null, text: t(locale, "glanceNone") };
  }
  const date = days[g.dayIndex]!.date;
  const when =
    g.dayIndex === 0 ? t(locale, "today") : g.dayIndex === 1 ? t(locale, "tomorrowShort") : weekdayShort(locale, date);
  const span = g.allDay ? t(locale, "glanceAllDay") : `${pad2(g.startHour)}–${pad2(g.endHour)}`;
  return { tier: g.tier, text: `${when} ${span}` };
}

// Chip badges show a coarse "Today 08-11" summary, so they can lag the
// forecast by a few minutes. 10 min keeps repeat chip loads off Open-Meteo.
const GLANCE_CACHE_TTL_SECONDS = 600;

// Untyped via globalThis: lib.dom's CacheStorage (pulled in via Node's fetch typings) shadows
// workers-types' and lacks `.default`. Undefined outside the Workers runtime (e.g. tests).
interface EdgeCache {
  match(request: Request): Promise<Response | undefined>;
  put(request: Request, response: Response): Promise<void>;
}

function edgeCache(): EdgeCache | undefined {
  return (globalThis as unknown as { caches?: { default?: EdgeCache } }).caches?.default;
}

// Edge-cached 10 min, keyed on rounded lat/lon, not the raw query string.
async function handleGlanceRoute(url: URL, ctx: ExecutionContext): Promise<Response> {
  const rawLat = Number(url.searchParams.get("lat"));
  const rawLon = Number(url.searchParams.get("lon"));
  if (!Number.isFinite(rawLat) || !Number.isFinite(rawLon)) {
    return Response.json({ tier: null, text: "" }, { status: 400 });
  }
  const lat = round3(rawLat);
  const lon = round3(rawLon);
  const langParam = url.searchParams.get("lang");
  const locale: Locale = isLocale(langParam) ? langParam : DEFAULT_LOCALE;

  const cache = edgeCache();
  const cacheKey = cache ? new Request(`https://glance.internal/?lat=${lat}&lon=${lon}&lang=${locale}`) : undefined;
  if (cache && cacheKey) {
    const cached = await cache.match(cacheKey);
    if (cached) return cached;
  }

  const body = await buildGlance(lat, lon, locale);
  const response = Response.json(body, {
    headers: { "Cache-Control": `public, max-age=${GLANCE_CACHE_TTL_SECONDS}` },
  });
  if (cache && cacheKey) ctx.waitUntil(cache.put(cacheKey, response.clone()));
  return response;
}

// JSON APIs used by the switcher's client-side script and the chip glance badges.
async function handleApiRoute(path: string, url: URL, ctx: ExecutionContext): Promise<Response> {
  if (path === "/api/search") {
    const query = (url.searchParams.get("q") || "").trim();
    if (!query) return Response.json([]);
    try {
      return Response.json(await searchLocation(query));
    } catch {
      return Response.json([], { status: 502 });
    }
  }

  if (path === "/api/reverse") {
    const lat = Number(url.searchParams.get("lat"));
    const lon = Number(url.searchParams.get("lon"));
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      return Response.json({ name: null }, { status: 400 });
    }
    return Response.json({ name: await reverseGeocode(lat, lon) });
  }

  if (path === "/api/glance") {
    return handleGlanceRoute(url, ctx);
  }

  return new Response("Not found", { status: 404 });
}

// The Worker's entry point (wrangler.jsonc's "main").
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    if (path.startsWith("/api/")) {
      return handleApiRoute(path, url, ctx);
    }

    // Bare root has no canonical locale - redirect (never serve content
    // here directly) so no URL's meaning silently changes the day the
    // default locale flips from en to nl. 302, not 301: a 301 gets cached
    // hard by browsers, which would fight that future flip.
    if (path === "/") {
      return Response.redirect(`${url.origin}/${DEFAULT_LOCALE}${url.search}`, 302);
    }

    const parsed = parseLocalizedPath(path);
    if (parsed) {
      return handleAppRoute(parsed.locale, parsed.path, url, request, ipLocationFrom(request));
    }

    return env.ASSETS.fetch(request);
  },
};
