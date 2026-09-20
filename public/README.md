# public/

Static assets, served directly by Cloudflare's Workers Static Assets
feature (configured in `wrangler.jsonc`'s `assets` block, bound as
`env.ASSETS`). Any request path that doesn't match one of `src/index.ts`'s
app routes falls through to `env.ASSETS.fetch(request)`, which serves a
matching file from here by path - e.g. `/style.css` has no app route, so it
resolves to `public/style.css`.

- `style.css` - the site's only stylesheet, everything included (no build step).
- `fonts/` - self-hosted Inter and JetBrains Mono, latin subset, woff2. Sourced
  from Google Fonts' CSS API (`fonts.googleapis.com/css2?family=...`) and
  pulled from the `fonts.gstatic.com` URLs it returns - fetched once at
  authoring time and committed here, so the site makes no font request to
  Google at runtime. Each family currently resolves to one variable-weight
  file covering all the weights `style.css` uses.

A favicon or other static file would also go here.
