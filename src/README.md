# src/

All application code - fully TypeScript, plus JSX (`.tsx`) for HTML
rendering.

- `config.ts` - wind/gust/temp tier thresholds, default location, lookahead days. Edit here first for any scoring tweak; nothing else should hardcode a threshold.
- `weather.ts` - Open-Meteo hourly forecast fetch, mapped into the shape `scoring.ts` expects.
- `scoring.ts` - the 5-tier wind/gust/temp scoring model (`scoreHour`).
- `spots.ts` - curated NL spot list (**draft** - placeholder coordinates, needs a real local-knowledge pass, see its own comment).
- `geocode.ts` - PDOK free-text NL location search, backing the site's search box.
- `i18n.ts` - locale functions (`t()`, always-prefix locale-URL parsing/building) - the stable, rarely-changing half of i18n. Add a locale here (one `Locale` union member).
- `i18n-strings.ts` - the EN/NL/DE translation dictionaries - the data half of i18n, kept separate since it's what actually grows as more UI copy or locales get added. Add a locale's dictionary here to match.
- `render.tsx` - Preact components for every page (landing, search results, per-spot conditions, data-attribution), all locale-aware, rendered to an HTML string via `preact-render-to-string`. JSX auto-escapes dynamic values - see its top-of-file comment for the one deliberate exception (`dangerouslySetInnerHTML` on the attribution page).
- `index.ts` - the Worker's routes: locale-prefix parsing, the bare-`/` redirect to the default locale, and dispatch to `render.tsx`.
- `*.test.ts` / `*.test.tsx` next to each file above - unit tests (`npm test` runs all of them).
