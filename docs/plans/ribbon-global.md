# Ribbon UX, step 3: any-country support

Follow-on to `docs/plans/ribbon-ux.md` (step 1) and `docs/plans/ribbon-map.md`
(step 2). Start only after PR9 has merged; it touches the same geocoding
and tile code paths. Same rules and runbook as step 1, plus the repo's
rule that every merge leaves the deployed site working: expand, then
contract, and run `npm run smoke` after each merge.

## 1. What is Netherlands-only today, and why

| Function | Today | Limit |
| --- | --- | --- |
| Search suggestions | PDOK `/suggest` (`src/geocode.ts`) | Dutch government geocoder, NL data only |
| Reverse geocoding for GPS and pin names | PDOK `/reverse`, buurt then woonplaats | Same |
| Map tiles, thumbnail and panel | PDOK BRT achtergrondkaart WMTS (`src/tiles.ts`, `public/app.js`) | Blank outside NL |
| Forecast | Open-Meteo | Global already; timezone hardcoded to `Europe/Amsterdam` in `config.ts` and `index.ts` |
| Starting spot | Cloudflare IP geolocation | Global already; only `LOCATION`/`DEFAULT_SPOT` is Dutch |

## 2. Providers evaluated (September 2026)

Search, worldwide:

- **Nominatim** (OSM): out. Policy forbids search-as-you-type and caps at 1 request/s.
- **Photon** (komoot, OSM data, EU-hosted): built for autocomplete, has reverse, no key, `lang` parameter for en/de/fr/it else local name, "reasonable" use only, no availability guarantee. Chosen.
- **Open-Meteo Geocoding API**: keyless, prefix matching, `language` parameter, GeoNames-based so city/town level only, no reverse. Chosen as fallback for search.
- MapTiler (1,000 search sessions/month free), Geoapify, LocationIQ: keyed, tight quotas, no gain.

Tiles, worldwide:

- **OSM standard raster tiles** (`tile.openstreetmap.org`): allowed for "normal interactive viewing" with clear attribution, HTTPS, a named User-Agent or Referer, and honoring cache headers; the OSMF states their servers are not free for everyone and may block usage that degrades service. Labels in each place's local script. Chosen for phase 1.
- **CARTO** raster: now requires an API key, 5 M tiles/month free. Backup if OSM ever blocks.
- **MapTiler** raster/vector: key, 5,000 map sessions/month free, logo required, non-commercial only.
- **OpenFreeMap** vector: no key, no registration, no limits, donation-funded, needs MapLibre (~800 KB vs Leaflet's 40 KB), labels available per language (`name:en`, `name:de`, `name:nl`), no raster so no image-only thumbnail. Phase 2 candidate for the panel.
- **Protomaps** PMTiles on Cloudflare R2: self-hosted vector, planet is ~120 GB, country extracts are feasible, vector-only. Phase 2 candidate if independence from third parties matters.

## 3. Decisions

- **Phase 1 (this plan):** Photon for search and reverse everywhere, Open-Meteo geocoding as search fallback when Photon errors or throttles (HTTP 429/5xx or timeout > 2 s). OSM raster tiles for both the thumbnail and the Leaflet panel. Open-Meteo `timezone=auto`. No API keys, no new dependencies, no cost.
- **PDOK is retired**, not kept as an NL special case. Two geocoders with routing logic is more code than the quality difference is worth for a site that looks up towns and lakes. Keep `geocode.ts`'s public function signatures so callers don't change.
- **Display name rule** (built server-side, `src/placename.ts`): `name`, then the most specific of `state`/`county` that differs from `name`, then the country only when it differs from the visitor's country (`request.cf.country`). Examples for a Dutch visitor: `Loosdrecht, Noord-Holland`; `Tegernsee, Bayern, Germany`. Names come from the geocoder in the UI locale where supported (`lang=en|de`; Dutch is not supported by Photon, so `nl` gets the local name), otherwise local. Country names are localized with `Intl.DisplayNames(locale, { type: "region" })`.
- **Reverse names**: Photon's nearest feature, which includes named water bodies, so a pin on a lake may return the lake. Format: feature name, else street, then city, with the same country rule. Fallback string is the existing `pickedPoint`/`myLocation` copy.
- **Timezone**: every forecast carries Open-Meteo's `timezone` and `utc_offset_seconds`. The now marker, day labels ("Today"/"Tomorrow") and the past-hour logic are computed in the location's zone from `Date.now()` plus that offset, never from the Worker's clock (UTC) or the browser's. Sunrise/sunset already come per location.
- **Units** stay km/h and °C. Imperial units are out of scope.
- **Starting spot** stays: cookie, then IP, then `DEFAULT_SPOT` (unchanged, Dutch). No country restriction on the IP guess.
- **Copy**: "Search any place in the Netherlands" becomes "Search any place"; "anywhere in the Netherlands" is dropped from titles; the attribution page's PDOK paragraph becomes an OpenStreetMap contributors paragraph (ODbL) with Photon and OSMF tile credits, the Leaflet map keeps the attribution control text `© OpenStreetMap contributors`.
- **User-Agent**: server-side Photon and Open-Meteo requests send `User-Agent: supdawg.nl (contact in /attribution)`. Browser-side tile requests carry the Referer automatically; nothing to add.
- **Not in phase 1**: localized map labels, vector tiles, MapLibre, self-hosted tiles, imperial units, additional UI locales.

## 4. Contracts

`src/geocode.ts` keeps `searchLocation(query, { limit })` and `reverseGeocode(lat, lon)` signatures. New optional params: `searchLocation(query, { limit, lang, viewerCountry })`, `reverseGeocode(lat, lon, { lang, viewerCountry })`. `GeocodeResult` gains `country: string | null` (ISO 3166-1 alpha-2) and `kind: string` (Photon `osm_value`, e.g. `city`, `village`, `water`).

Photon endpoints: `https://photon.komoot.io/api/?q=&limit=&lang=` and `https://photon.komoot.io/reverse?lat=&lon=&lang=`. Result mapping: `properties.name`, `properties.city`, `properties.state`, `properties.county`, `properties.countrycode`, `properties.osm_value`, `geometry.coordinates` as `[lon, lat]`.

Open-Meteo geocoding fallback: `https://geocoding-api.open-meteo.com/v1/search?name=&count=&language=`; map `name`, `admin1`, `country_code`, `latitude`, `longitude`; `kind` is `"place"`.

Tile URL template (both `src/tiles.ts` and the panel): `https://tile.openstreetmap.org/{z}/{x}/{y}.png`, `maxZoom` 19, attribution `© OpenStreetMap contributors`. Thumbnail zoom stays 12.

`src/weather.ts`: request `timezone=auto`; `ForecastResult` gains `timezone: string` and `utcOffsetSeconds: number`. A helper `localNow(utcOffsetSeconds): { date: "YYYY-MM-DD", hour: number, minute: number }` in `src/windows.ts` replaces every use of the Worker's local clock.

## 5. Strings

| Key | EN |
| --- | --- |
| `searchPlaceholder` | `Search any place` |
| `siteTitleLanding` / `subtitleLanding` if still present | drop "in the Netherlands" |
| `attrLocationHeading` | `Location search and maps` |
| `attrLocationBody` | `Place search and names use {photonLink} on {osmLink} data. Map images come from {osmLink}, © OpenStreetMap contributors, ODbL.` |

`kind`-based hints in search rows (optional): reuse the existing `.ty` cell with the localized `kind` words `city`, `town`, `village`, `lake`, `beach`, `bay` only; other kinds show nothing.

## 6. PRs

### PR11 — Timezone-correct "now" and day labels

Branch `ribbon/timezone`. Files: `src/weather.ts`, `src/windows.ts`, `src/render.tsx`, `src/ribbon.tsx`, tests. `timezone=auto`, carry `timezone`/`utcOffsetSeconds`, compute now/today/tomorrow from the location's offset. Acceptance: a fixture with `utc_offset_seconds: 32400` (Tokyo) and the Worker clock pinned to 23:30 UTC labels the 08:30 local day as "Today" and places the now marker at hour 8; NL fixtures unchanged. Site usable after merge: yes, NL output identical. Model: Sonnet. Size: S. Can run before PR9.

### PR12 — Global geocoding

Branch `ribbon/geocode-global`. Files: `src/geocode.ts` and tests, new `src/placename.ts` and tests, `src/index.ts` (pass `lang` and viewer country from `request.cf.country`, set the User-Agent), `src/i18n-strings.ts` (section 5, en/nl/de), `src/render.tsx` (attribution copy). Expand-then-contract: add the Photon and Open-Meteo clients and the name formatter with tests first; switch `searchLocation` and `reverseGeocode` to them and delete the PDOK code in the same PR. Acceptance: `mockFetch` tests for Photon success, Photon 429 falling back to Open-Meteo, reverse returning a `water` feature, the country rule for same and different countries in all three locales; `npm run smoke` after deploy shows search suggestions for "Loosdrecht" and "Tegernsee". Model: Sonnet. Size: M.

### PR13 — Global tiles

Branch `ribbon/tiles-global`. Files: `src/tiles.ts` and tests, `public/app.js`, `public/style.css` if the tile brightness filter needs retuning for OSM's palette, attribution page. Swap the URL template and attribution in both places in one PR. Acceptance: `tiles.test.ts` asserts the OSM host; manual check of the thumbnail and panel for a Dutch, a German and a Japanese spot in light and dark; attribution visible on the panel. Model: Sonnet. Size: S. Depends on PR9.

Dependency: PR11 independent; PR12 after PR9 (shares `app.js` search rows only lightly, but keep it sequential); PR13 after PR9.

## 7. Phase 2, when warranted

- Localized map labels: OpenFreeMap vector tiles with MapLibre in the panel, `name:{locale}` label expressions; thumbnail stays raster.
- Independence from third-party goodwill: Protomaps country extracts on R2 served through the Worker, MapLibre in the panel.
- Imperial units for `en` visitors outside metric countries.
- Trigger for either: Photon or OSMF throttling, or monthly page views past the low tens of thousands.

## 8. Sources consulted

- Open-Meteo Geocoding API docs: https://open-meteo.com/en/docs/geocoding-api
- OSMF tile usage policy: https://operations.osmfoundation.org/policies/tiles/
- Nominatim usage policy: https://operations.osmfoundation.org/policies/nominatim/
- Photon: https://github.com/komoot/photon
- OpenFreeMap: https://openfreemap.org/
- Protomaps basemap downloads: https://docs.protomaps.com/basemaps/downloads
- MapTiler Cloud pricing: https://www.maptiler.com/cloud/pricing/
- CARTO basemaps: https://carto.com/basemaps
