# public/

Static assets, served directly by Cloudflare's Workers Static Assets
feature (configured in `wrangler.jsonc`'s `assets` block, bound as
`env.ASSETS`). Any request path that doesn't match one of `src/index.ts`'s
app routes falls through to `env.ASSETS.fetch(request)`, which serves a
matching file from here by path - e.g. `/style.css` has no app route, so it
resolves to `public/style.css`.

- `style.css` - the site's only stylesheet, everything included (no build step).

A favicon or other static file would also go here.
