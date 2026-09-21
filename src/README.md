# src/

All application code - fully TypeScript, plus JSX (`.tsx`) for HTML
rendering.

- `config.ts` - wind/gust/temp tier thresholds, default location, lookahead days. Edit here first for any scoring tweak; nothing else should hardcode a threshold.
- `weather.ts` - Open-Meteo hourly forecast fetch, mapped into the shape `scoring.ts` expects.
- `scoring.ts` - the 5-tier wind/gust/temp scoring model (`scoreHour`).
- `windows.ts` - finds contiguous qualifying-hour windows and day/lookahead summaries (`findWindows`, `daySummary`, `glance`), plus `groupByDate` (moved here from `render.tsx`).
- `geocode.ts` - PDOK forward (free-text) and reverse (lat/lon -> place name) NL geocoding, used by the switcher's search and the GPS button (via `/api/search` and `/api/reverse`) and by the map preview's picked point.
- `tiles.ts` - tile math for the small map preview: which four map tiles to show and how to center them on a point (`thumbTiles`).
- `cookies.ts` - reads/writes the two cookies that carry spot state across visits: `sd_spots` (saved spots, written by `app.js` when a spot is starred) and `sd_last` (last-viewed spot, set by the server only for visitors who already have a saved spot; 90 days).
- `i18n.ts` - locale functions (`t()`, always-prefix locale-URL parsing/building, day/weekday labels) - the stable, rarely-changing half of i18n. Add a locale here (one `Locale` union member).
- `i18n-strings.ts` - the EN/NL/DE translation dictionaries - the data half of i18n, kept separate since it's what actually grows as more UI copy or locales get added. Add a locale's dictionary here to match.
- `ribbon.tsx` - the day-card component: one wind ribbon per day (SVG curves plus HTML strip, axis, and detail overlays), following the DOM contract in `docs/plans/ribbon-ux.md`.
- `render.tsx` - Preact components for the conditions page (title row with the map preview and switcher, one day card per day, the saved-spot chips) and the data-attribution page, all locale-aware, rendered to an HTML string via `preact-render-to-string`. JSX auto-escapes dynamic values - see its top-of-file comment for the deliberate exceptions.
- `index.ts` - the Worker's routes: locale-prefix parsing, the bare-`/` redirect to the default locale, `/{locale}/` and `/{locale}/conditions` (resolve and render a spot: `sd_last` cookie -> IP -> default), `/api/search`, `/api/reverse`, `/api/glance` (chip badge text, not locale-prefixed - what the switcher and chip badges call), and dispatch to `render.tsx`.
- `*.test.ts` / `*.test.tsx` next to each file above - unit tests (`npm test` runs all of them).
