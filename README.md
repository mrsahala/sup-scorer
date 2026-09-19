# sup-scorer

Web app that shows stand-up paddleboard conditions for any location.
Initial website (supdawg.nl) will only support Netherlands locations, but
this will expand.

Scores hourly wind/gust/temp forecasts from [Open-Meteo](https://open-meteo.com/)
(free, keyless) into a 5-tier verdict (great/good/marginal/poor/avoid), shown
as a per-day hourly grid with wind direction. Rendered with JSX/Preact.

The site is localized (English/Dutch/German for now, more later).

## Development

```
npm install
npm run dev        # wrangler dev - local server against the real Open-Meteo/PDOK APIs
npm test           # node:test (via tsx) - scoring/weather/config/i18n/render unit tests
npm run typecheck  # tsc --noEmit
npm run deploy     # wrangler deploy
```

## Layout

- `src/` - all application code. See [`src/README.md`](src/README.md).
- `public/` - static assets served via Cloudflare Workers Static Assets. See [`public/README.md`](public/README.md).
- `wrangler.jsonc` - Worker name, entry point, compatibility date, the `assets` binding.
- `tsconfig.json` - TypeScript compiler options.
- `package.json` - scripts and dependencies.
- `testSupport.ts` - shared test helpers, not itself a test file.
- `LICENSE` - MIT.
