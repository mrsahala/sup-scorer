# public/

Static assets, served directly by Cloudflare's Workers Static Assets
feature (configured in `wrangler.jsonc`'s `assets` block, bound as
`env.ASSETS`). Any request path that doesn't match one of `src/index.ts`'s
app routes falls through to `env.ASSETS.fetch(request)`, which serves a
matching file from here by path - e.g. `/style.css` has no app route, so it
resolves to `public/style.css`.

- `app.js` - the one client-side script, progressively enhancing the server-rendered page: scrubbing a ribbon, the location switcher, the GPS button, saving a spot, chip glance badges, and the map preview's pinpoint panel. Plain ES module, no build step; the page works without it.
- `style.css` - the site's only stylesheet, everything included (no build step).
- `fonts/` - self-hosted woff2 subsets, so the site makes no runtime request to Google Fonts. The `OFL-*.txt` files are the fonts' licenses, which the OFL requires to travel with the files.
- `leaflet/` - Leaflet 1.9.4 (`leaflet.js`, `leaflet.css`, `images/`, BSD-2 `LICENSE`), self-hosted so opening the map panel sends no request to a third-party CDN. Loaded lazily by `app.js`.

A favicon or other static file would also go here.
