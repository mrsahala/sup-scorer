// Public multi-location SUP conditions site. URL scheme is always-prefix
// (/en/..., /nl/..., /de/...) - see i18n.ts for why. "/<locale>/" is the
// landing page (search-then-pinpoint map, see render.tsx's LocationPicker)
// and "/<locale>/conditions?lat=&lon=" renders the conditions view for
// whatever point was picked. "/api/search" and "/api/reverse" are plain
// JSON endpoints the picker's client-side script calls - not locale-
// prefixed, since they're fetch() targets, not pages anyone bookmarks.
import { fetchForecast } from "./weather";
import { scoreHour, type ScoredHour } from "./scoring";
import { LOCATION } from "./config";
import { renderSpotPage, renderLandingPage, renderAttributionPage } from "./render";
import { searchLocation, reverseGeocode } from "./geocode";
import { t, parseLocalizedPath, DEFAULT_LOCALE, type Locale } from "./i18n";

// The Worker's bindings, matching wrangler.jsonc's `assets` block. ASSETS
// is what serves everything under public/ (see fetch()'s fallback below).
// Hand-written rather than generated via `wrangler types` since there's
// only the one binding - worth switching to generated types if more get added.
interface Env {
  ASSETS: Fetcher;
}

const html = (body: string) => new Response(body, { headers: { "content-type": "text/html; charset=utf-8" } });

async function computeScoredHours({ lat, lon }: { lat: number; lon: number }): Promise<ScoredHour[]> {
  const { hours } = await fetchForecast({ lat, lon, timezone: LOCATION.timezone });
  return hours.map(scoreHour);
}

async function handleAppRoute(locale: Locale, path: string, url: URL): Promise<Response> {
  const currentPath = path;
  const search = url.search;

  if (path === "/") {
    return html(renderLandingPage({ locale, currentPath, search }));
  }

  if (path === "/conditions") {
    const lat = Number(url.searchParams.get("lat"));
    const lon = Number(url.searchParams.get("lon"));
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      return new Response(t(locale, "invalidLatLon"), { status: 400 });
    }
    // A "name" is only ever missing when the GPS button linked here directly
    // with raw coordinates (search results always pass one, already
    // resolved by PDOK's forward lookup) - reverse-geocode a label for that
    // case, alongside the forecast fetch rather than after it.
    const paramName = url.searchParams.get("name");
    const [scoredHours, resolvedName] = await Promise.all([
      computeScoredHours({ lat, lon }),
      paramName ? Promise.resolve(paramName) : reverseGeocode(lat, lon),
    ]);
    const name = resolvedName || t(locale, "myLocation");
    return html(renderSpotPage({ locale, locationName: name, scoredHours, currentPath, search }));
  }

  if (path === "/attribution") {
    return html(renderAttributionPage({ locale, currentPath, search }));
  }

  return new Response("Not found", { status: 404 });
}

// Plain JSON, no HTML - what the landing page's map picker script fetches.
async function handleApiRoute(path: string, url: URL): Promise<Response> {
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

  return new Response("Not found", { status: 404 });
}

// The Worker's entry point (wrangler.jsonc's "main").
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    if (path.startsWith("/api/")) {
      return handleApiRoute(path, url);
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
      return handleAppRoute(parsed.locale, parsed.path, url);
    }

    return env.ASSETS.fetch(request);
  },
};
