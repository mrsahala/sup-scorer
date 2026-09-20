# prototypes/

Throwaway UX prototypes for evaluating a redesign of the site's interaction
flow. Static HTML, no build step, live data (Open-Meteo + PDOK both allow
cross-origin requests). Not wired into the Worker and not meant to ship.

```
cd prototypes && python3 -m http.server 8787
open http://127.0.0.1:8787/compare.html
```

- `compare.html` - the live site and both variations side by side in iframes, with a phone/tablet/desktop width switcher.
- `a-ribbon.html` - Variation A. Hours on the x axis, one ribbon per day stacked vertically; wind area chart with tier-threshold guide lines; scrub/tap lens for detail; inline location switcher under the title; saved spots as chips.
- `b-stream.html` - Variation B. One continuous vertical time axis across all days (night collapsed), every hour's data inline as horizontal wind bars; sticky day headers; spot rail (desktop) / chip strip (mobile) with live glance badges.
- `core.js` - shared module: the scoring model ported 1:1 from `src/`, forecast/geocode fetches, window detection, saved-spot store, day summaries.
- `tokens.css` - shared design tokens (light/dark).
- `smoke.mjs` - `node smoke.mjs` checks core.js against the live APIs.

Both variations open straight into conditions for the last-used spot, GPS, or a default (the production site would use Cloudflare's IP geolocation server-side instead, which needs no permission prompt).
