# Ribbon UX: implementation plan

**Shipped.** All PRs in this plan have merged.

Replaces the live site's landing-page-then-grid flow with the "Ribbon"
prototype: the site opens straight into conditions for the visitor's spot,
each day is a horizontal wind ribbon with tier tinting, an inline switcher
handles search / GPS / saved spots, and a fixed detail strip under each
chart shows the selected hour.

This document is written for an orchestrating agent (any model) that hands
each PR to an implementing agent. Every decision that needed a human or a
strong model has been made here; implementers should not re-open them. If
something in this plan turns out to be impossible, the implementer stops
and reports instead of improvising a different design.

## 1. Reference

The prototype is the design source of truth. It is static HTML against
live data and lives in the repo (landed by PR0 below):

| File | What it is |
| --- | --- |
| `prototypes/a-ribbon.html` | The page to replicate. Layout, copy, colors, spacing, motion, interaction. |
| `prototypes/core.js` | Window detection, day summaries, glance text, chip/cookie semantics. Port logic from here, don't reinvent. |
| `prototypes/tokens.css` | Color tokens, light and dark. Port verbatim. |
| `prototypes/README.md` | How to run it: `cd prototypes && python3 -m http.server 8787`, open `a-ribbon.html`. |

(`prototypes/` was deleted once this plan and `ribbon-map.md` shipped; these
files live on the `ribbon/map-proto` branch.)

"Exact" means: same information, same interaction model, same visual
system. It does not mean pixel identity with the prototype's SVG geometry;
section 3 deliberately changes how the ribbon is drawn so it works without
JavaScript. Ignore `b-stream.html` and `compare.html`; they were the
losing variation and the evaluation harness.

Live-site constraints that the prototype ignored and this plan honors:

- Server-rendered Preact (`preact-render-to-string`), no client framework, no build step beyond wrangler's bundling of the Worker. Static files under `public/` are served raw.
- Everything localized (en/nl/de) through `src/i18n-strings.ts`, typed so a missing key fails `npm run typecheck`.
- Cloudflare gives the server the visitor's IP-based lat/lon on `request.cf` for free, so the first page can be the right one with no permission prompt.
- Tests are `node:test` via tsx, no browser runner. Visual QA is manual, with Chrome screenshots.

## 2. Target architecture (decided)

**SSR first, progressive enhancement.** Every page is complete HTML from
the Worker. Switching spot is a normal navigation to
`/{locale}/conditions?lat=&lon=&name=`; there is no client-side
re-render of the forecast. What the prototype did with fetch + DOM swaps,
the live site does with URLs. Benefits: shareable spot URLs, works with JS
off, no duplicated renderer, matches the codebase's existing shape.

**One small client script**, `public/app.js`, plain ES2020 module, no
TypeScript, no bundling. It does exactly five things: scrub/select an hour
on a ribbon, run the switcher (search suggestions, keyboard), GPS button,
star button (cookie), and chip glance badges (fetch). It reads per-page
data from a `<script type="application/json" id="page-data">` blob that
the server renders (JSON with every `<` written as the six-character escape sequence backslash-u003c). It never builds
HTML from untrusted strings without `textContent`.

**Ribbon drawn to be responsive without JS.** HTML rows for everything
that has text (window strip, hour axis, arrows, threshold labels, detail
strip) and one `<svg preserveAspectRatio="none">` for the curves and
tints, with `vector-effect="non-scaling-stroke"` on stroked paths. Widths
are percentages. See section 3.

**Cookies carry the two pieces of client state the server needs at
render time.** `sd_last` (JSON `{name,lat,lon,gps}`, set by the server on
every `/conditions` response, 1 year) makes `/{locale}/` open on the
visitor's previous spot. `sd_spots` (JSON array of up to 8
`{name,lat,lon}`, set by `app.js` on star/unstar, 1 year) lets the server
render the chip row. Both are functional state the visitor explicitly
created, not tracking; no consent banner. Cookies are `SameSite=Lax;
Path=/; Secure` (omit Secure on localhost).

**Routes after this work:**

| Route | Behavior |
| --- | --- |
| `/` | 302 to `/{DEFAULT_LOCALE}/` (unchanged) |
| `/{locale}/` | Conditions page for: `sd_last` cookie spot, else IP spot (`request.cf`), else `DEFAULT_SPOT` with the switcher rendered open. No redirect; the URL stays `/{locale}/`. |
| `/{locale}/conditions?lat&lon[&name][&src=gps]` | Conditions page for that point. Missing `name` is reverse-geocoded (unchanged). `src=gps` marks the GPS button as active. Sets `sd_last`. |
| `/{locale}/attribution` | Unchanged. |
| `/api/search?q=` | Unchanged. |
| `/api/reverse?lat&lon` | Unchanged. |
| `/api/glance?lat&lon&lang=` | New. `{ tier, text }` for the chip badge, see section 4. Response cached at the edge for 10 min, keyed on lat/lon rounded to 3 decimals. |

**Retired:** the Leaflet map picker, `DEFAULT_START_LOCATION`, the
"picked spot" panel, the `/{locale}/` landing page strings. Search
suggestions plus GPS cover the use cases the map served. A point on open
water is no longer selectable; this is an accepted loss for now and can
return later as a "fine-tune on map" row in the switcher.

**Fonts:** self-host Inter (400/500/600/700) and JetBrains Mono (400/500/600)
as latin-subset woff2 under `public/fonts/`, declared with `font-display:
swap` and the system stack as fallback. No Google Fonts request.

**Theme:** follows the OS via `prefers-color-scheme` only. No toggle, no
`data-theme` attribute.

**Open-Meteo caching:** the forecast fetch passes
`cf: { cacheTtl: 600, cacheEverything: true }` with lat/lon rounded to 3
decimals in the URL, so repeat and nearby requests are served from
Cloudflare's cache and chip badges are cheap.

## 3. DOM contract

Fixed so that the stylesheet, the ribbon component, and the client script
can be built in parallel and meet in the integration PR. Class names are
final. Attributes marked `data-*` are what `app.js` reads.

```html
<body>
<header class="hdr"><div class="hdr-in">
  <a class="wordmark" href="/en/"><i></i>supdawg</a>
  <nav class="lang-switch">…existing…</nav>
</div></header>

<main>
  <section class="title-block" id="title-block" data-open="false">
    <div class="title-row">
      <button class="spot-btn" id="spot-btn" aria-expanded="false" aria-controls="switcher">
        <span class="spot-name">Loosdrecht</span><svg class="chev">…</svg>
      </button>
      <button class="star" id="star" aria-pressed="false" aria-label="…">★svg</button>
      <button class="star gps" id="gps" aria-pressed="false" aria-label="…">◎svg</button>
    </div>
    <p class="sub tier-good"><i class="dot"></i><span>Best today <b class="mono">08:00–11:00</b> · <b>Good</b></span></p>
    <div class="switcher" id="switcher"><div><div class="switcher-card">
      <div class="search-wrap"><svg/><input class="search" id="search" type="search" placeholder="…" autocomplete="off"></div>
      <div class="list" id="results" role="listbox"></div>
      <div class="hint" id="hint" hidden></div>
      <div class="list-h" id="saved-h" hidden>Saved spots</div>
      <div class="list" id="saved"></div>
    </div></div></div>
  </section>

  <div class="chips" id="chips">
    <a class="chip active tier-good" href="/en/conditions?lat=…&lon=…&name=…" data-lat data-lon>
      <i></i><span>Loosdrecht</span><small>Today 08–11</small>
    </a>
  </div>

  <div class="days" id="days">
    <section class="card" data-date="2026-09-20">
      <div class="card-h"><div class="day-l">Today<small>20 Sept</small></div><span class="pill tier-good"><i></i>Good <span class="mono">08–11</span></span></div>
      <div class="meta">wind <span class="mono">14–26</span> km/h · <span class="mono">17–18</span>°C · daylight <span class="mono">08:00–19:00</span></div>

      <div class="ribbon" tabindex="0" role="img" aria-label="…" data-n="12" data-sel="3" data-now="3.35" style="--n:12">
        <div class="strip">
          <span class="seg win tier-good" style="--span:3"><b>Good 3h</b></span>
          <span class="seg tier-poor" style="--span:1"></span>
          …one seg per hour not inside a window, one per window…
        </div>
        <div class="chart">
          <svg class="curves" viewBox="0 0 1000 400" preserveAspectRatio="none" aria-hidden="true">
            <defs><clipPath id="area-2026-09-20"><path d="…wind area…"/></clipPath></defs>
            <g class="guides"><line y1="300" y2="300" x1="0" x2="1000"/>…at 10/15/20/25 km/h…</g>
            <g clip-path="url(#area-2026-09-20)"><rect class="tier-col tier-good" x="0" width="83.3" y="0" height="400"/>…</g>
            <path class="gust-band" d="…"/>
            <path class="gust-line" d="…" vector-effect="non-scaling-stroke"/>
            <path class="wind-line" d="…" vector-effect="non-scaling-stroke"/>
          </svg>
          <div class="guide-labels"><span class="tier-poor" style="--y:37.5%">poor ≤25</span>…</div>
          <div class="key"><span class="k-wind">wind</span><span class="k-gust">gust</span></div>
          <div class="now" style="--x:29.2%"><b>now</b></div>          <!-- today only -->
          <div class="col-hi" style="--x:25%;--w:8.33%"></div>
          <div class="cursor" style="--x:29.2%"><i style="--y:38%"></i></div>
        </div>
        <div class="axis"><span>08</span><span></span><span>10</span>…12 cells…</div>
        <div class="arrows"><span style="--rot:225deg"><svg/></span>…12 cells…</div>
      </div>
      <div class="detail tier-poor" aria-live="polite">
        <span class="tm">11:00</span><span class="vd">Poor</span>
        <span class="it"><span class="mono">24.8 → 43.9</span> km/h</span>
        <span class="it"><span class="mono">18°C</span></span>
        <span class="it">from WNW <svg class="ar" style="--rot:…"/></span>
        <span class="why">sustained 25 km/h</span>
      </div>
    </section>
  </div>
</main>
<footer class="site-footer">…attribution link (existing)…</footer>
<script type="application/json" id="page-data">{…section 4…}</script>
<script type="module" src="/app.js"></script>
```

Geometry rules for the ribbon (port from `renderRibbon` in the prototype,
adapted to percentages):

- `n` = daylight hours in the day. Every horizontal position is `(i + 0.5) / n * 100%` for a center, `i / n * 100%` for a column start, `100 / n %` for a column width. `n` is emitted twice on `.ribbon`: `data-n` for `app.js` and `--n` for CSS, which cannot read a data attribute and needs it for the alternating hour stripes.
- Y scale is fixed 0–40 km/h across all days (`Y_MAX = 40`); values above 40 clamp. In the SVG, `y = 400 - min(v, 40) / 40 * 400`. As a CSS percentage from the top, `(1 - min(v,40)/40) * 100%`.
- Threshold guides at 10, 15, 20, 25 km/h, colored by tier (great/good/marginal/poor). Labels sit outside the chart on the right at ≥ 560px, inside the chart at the left edge below 560px (CSS only).
- The wind and gust curves are Fritsch–Carlson monotone cubic paths through hour centers, extended flat to x=0 and x=1000. Copy `monotone()` from the prototype.
- Layers, bottom to top: alternating hour stripes (CSS on `.chart`), guides, tier-tinted columns clipped to the wind area, gust band (fill between curves), gust line (dashed), wind line, strip on top, then the HTML overlays.
- The strip: one `.seg` per hour outside any window and one `.seg.win` per contiguous qualifying window, each with `--span` = hours covered; `flex: var(--span)`. Window label is `{Tier} {n}h`, shown only when the segment is wide enough (CSS `container-query` or a min-width rule, not JS).
- `now` marker: today only, `--x` = `(nowIndex + minutes/60 + 0.5) / n`. Only when the current hour is inside daylight.
- Initial selection (`data-sel`): today → current hour if inside daylight, else 0; other days → first hour of the day's best window, else 0. The server renders the cursor, column highlight, and detail strip for that hour, so the page is complete before `app.js` runs.
- Motion on load: the SVG `<g>` holding curves and tints is wrapped in a clip rect animated with SMIL `<animate attributeName="width" from="0" to="1000" dur="0.55s">`, and `.days` gets a 260 ms fade/slide keyframe. Both are suppressed by `prefers-reduced-motion`.

## 4. Data contracts

**Scoring additions** (`src/scoring.ts`, `src/weather.ts`): `HourRow`
gains `hourNum: number` (0–23). `ScoredHour` gains `tierIndex: number`
and `coldLimited: boolean` (daylight, tier ≤ marginal, but `tempC <=
TEMP_MIN_C`). Existing fields unchanged.

**`src/windows.ts`** (new, pure):

```ts
export interface GoodWindow { date: string; startHour: number; endHour: number /* exclusive */; hours: ScoredHour[]; bestTier: Tier; worstTier: Tier; modeTier: Tier; }
export function findWindows(hours: ScoredHour[]): GoodWindow[];           // contiguous qualifying runs, per day
export interface DaySummary { best: GoodWindow | null; windows: GoodWindow[]; minWind: number | null; maxWind: number | null; qualifyingHours: number; daylightHours: number; }
export function daySummary(dayHours: ScoredHour[]): DaySummary;       // best = longest, then best tier
export interface Glance { dayIndex: number | null; allDay: boolean; startHour: number; endHour: number; tier: Tier | null; }
export function glance(days: ScoredHour[][]): Glance;                 // first day with a window
export function groupByDate(hours: ScoredHour[]): { date: string; hours: ScoredHour[] }[]; // move from render.tsx, keep night hours
```

`modeTier` is the rounded mean tier index of the window's hours; it is
what the pill, the subtitle, the chip badge and the window label show.
Semantics are exactly `findWindows`/`daySummary` in `prototypes/core.js`.

**`/api/glance` response:** `{ "tier": "good" | … | null, "text": "Today 08–11" }`, text localized by `lang`. Text rules (from `glance()` in core.js): day 0 → `Today`, day 1 → `Tmrw`, else the weekday's 3-letter abbreviation in the locale; then `all day` when every daylight hour qualifies, else `HH–HH`; no window in the lookahead → `no window` with `tier: null`.

**`#page-data` blob:**

```json
{
  "locale": "en",
  "spot": { "name": "Loosdrecht", "lat": 52.2, "lon": 5.08, "gps": false, "saved": true },
  "days": [
    { "date": "2026-09-20", "sel": 3, "hours": [
      { "hour": "08:00", "hourNum": 8, "tier": "good", "windKmh": 14.2, "gustKmh": 26.1, "tempC": 17.9, "windDirDeg": 270, "gustDowngraded": false, "coldLimited": false }
    ] }
  ],
  "strings": { "reasonGust": "…", "reasonCold": "…", "reasonSustained": "…", "noMatches": "…", "searchFailed": "…", "locating": "…", "locationFailed": "…", "savedSpots": "…", "saveSpot": "…", "unsaveSpot": "…" }
}
```

The detail strip's reason text (`why`) is built client-side from `strings`
and the hour, identically to `reason()` in the prototype; the server
renders the same for the initial selection.

**Cookies:** `sd_last` = `{"name":"…","lat":52.2,"lon":5.08,"gps":true}`; `sd_spots` = `[{"name":"…","lat":…,"lon":…}, …]` max 8, newest first. Server parses defensively: invalid JSON or out-of-range numbers means "no cookie".

## 5. i18n keys to add

All three locales. English values are the prototype's copy; NL/DE need a
fluent translation, not a literal one. Keys marked (rm) are removed.

| Key | EN |
| --- | --- |
| `siteTitleLanding` (rm), `subtitleLanding` (rm), `legend` (rm), `pickedSpot` (rm), `getConditionsHere` (rm), `searchButton` (rm), `backHome` (rm) | The conditions page reuses `siteTitleSpot` / `subtitleSpot`. |
| `searchPlaceholder` | `Search any place in the Netherlands` |
| `useMyLocation` | `Use my location` (no emoji) |
| `locating` | `Locating…` |
| `locationFailed` | `Couldn't get your location` |
| `saveSpot` / `unsaveSpot` | `Save this spot` / `Remove from saved spots` |
| `savedSpots` | `Saved spots` |
| `noSearchResults` | `No matches` |
| `searchFailed` | `Search failed` |
| `today` / `tomorrow` / `tomorrowShort` | `Today` / `Tomorrow` / `Tmrw` |
| `bestToday` | `Best today {range} · {tier}` |
| `allDayToday` | `{tier} all day today · {hours}h of daylight` |
| `noWindowToday` | `No good window today · next {day} {hour}` |
| `noWindowAhead` | `No good window in the next {days} days` |
| `pillAllDay` | `{tier} all day` |
| `pillNone` | `No window` |
| `metaLine` | `wind {wind} km/h · {temp}°C · daylight {daylight}` |
| `windowLabel` | `{tier} {hours}h` |
| `keyWind` / `keyGust` | `wind` / `gust` |
| `guideLabel` | `{tier} ≤{kmh}` (tier lowercased) |
| `now` | `now` |
| `detailFrom` | `from {compass}` |
| `reasonGust` | `gust-limited · gusts {gust} km/h` |
| `reasonCold` | `too cold · {temp}°C` |
| `reasonSustained` | `sustained {wind} km/h` |
| `glanceAllDay` / `glanceNone` | `all day` / `no window` |
| `switcherOpenHint` | `Pick a spot to get started` (shown in the switcher when `/{locale}/` had no cookie and no IP guess) |

Weekday abbreviations come from `Intl.DateTimeFormat(dateLocale(locale), { weekday: "short" })`, not from strings.

## 6. PR plan

Branch names are given. Every PR branches from `main` unless it says
otherwise, is opened by the bot identity, requests the repo owner as
reviewer, and is merged only after human approval (see section 7). PRs are sized
to be reviewable in one sitting.

### Wave 0

**PR0 — Design reference and plan.** Branch `worktree-ux-prototypes`
(this branch). Contents: `prototypes/`, `docs/plans/ribbon-ux.md`. No
code changes. Purpose: give every later branch the reference and this
plan. Reviewer only checks nothing under `src/` or `public/` changed.
Model: none needed; the orchestrator opens it.

### Wave 1 (parallel, independent files)

**PR1 — Windows, summaries, scoring fields.** Branch `ribbon/windows`.
Files: new `src/windows.ts` + `src/windows.test.ts`; edit
`src/weather.ts` (`hourNum`), `src/scoring.ts` (`tierIndex`,
`coldLimited`), `src/scoring.test.ts`, fixture in `testSupport.ts`.
Move `groupByDate` out of `render.tsx` into `windows.ts` and re-import it
there so render output is unchanged. Acceptance: `npm test` and `npm run
typecheck` pass; `findWindows` and `daySummary` produce the same result as
`prototypes/core.js` on the fixture in `core.js`'s `smoke.mjs` (write a
test that hand-codes three days: one with a 3h window and a 1h window,
one all-day, one with none). Model: Sonnet. Size: S.

**PR2 — Strings.** Branch `ribbon/strings`. Files: `src/i18n-strings.ts`,
`src/i18n.ts` (add `weekdayShort(locale, date)` and `dayLabel(locale,
date, today)` returning Today/Tomorrow/weekday), `src/i18n.test.ts`.
Add every key in section 5 for en/nl/de; do not remove the (rm) keys yet
(render.tsx still uses them; PR6 removes them). Acceptance: typecheck
passes, a test asserts every EN key exists in NL and DE with a non-empty
value, `dayLabel` tested around midnight and year end. Model: Sonnet
(translation quality matters; Haiku is not enough for NL/DE idiom).
Size: S.

**PR3 — Stylesheet and fonts.** Branch `ribbon/css`. Files:
`public/style.css` (rewrite), `public/fonts/*.woff2`, `public/README.md`.
Port `prototypes/tokens.css` and every rule in `a-ribbon.html`'s
`<style>` onto the DOM contract in section 3. Ribbon rules must lay out
from the `--span`, `--x`, `--w`, `--y`, `--rot` custom properties and
percentages; there is no JS measuring. Keep the existing `.lang-switch`,
`.site-footer`, `.credit`, `.back` rules (attribution page still uses
them). Remove all `.hour-cell`, `.picker-*`, `.autocomplete`, `.search`
(old), `.use-location` rules. Also create `docs/plans/ribbon-fixture.html`: a hand-written static page
using the exact contract markup with two days of fake numbers and no JS,
linking `/style.css` relatively. Acceptance: the fixture renders correctly
at 390px and 1100px in light and dark, screenshots attached to the PR. Model: Sonnet. Size: M.

### Wave 2 (after all of Wave 1 merges; PR4 and PR5 in parallel)

**PR4 — Ribbon component.** Branch `ribbon/component`. Files: new
`src/ribbon.tsx` + `src/ribbon.test.tsx`. Exports `Ribbon({ locale, day,
hours, sel, nowIndex, nowFraction })` and `DetailStrip({ locale, hour
})` and `DayCard({ … })` producing exactly the section 3 markup. Includes
`monotone()` and the y/x helpers. Uses `windows.ts` (PR1) and the strings
from PR2. Acceptance:
tests assert the number of `.seg` elements equals hours-minus-window-
hours-plus-windows, `--span` sums to `n`, the clip path id is unique per
date, no `NaN` anywhere in the output, the selected hour's detail matches
the hour's numbers, `now` renders only for today and only inside
daylight, and everything dynamic is escaped (reuse the XSS test pattern
from `render.test.tsx`). Model: Opus (geometry and edge cases). Size: M.

**PR5 — Routes, cookies, glance API, caching.** Branch `ribbon/routes`.
Files: `src/index.ts`, new `src/cookies.ts` + test, `src/weather.ts`
(cache options and 3-decimal rounding), `src/index.test.ts` if present
else new. Changes: `/{locale}/` resolves the spot in the order cookie →
IP → default and renders the conditions page (call the existing
`renderSpotPage` for now with a `switcherOpen` flag it ignores; PR6
replaces the renderer); `/conditions` sets `sd_last` and accepts
`src=gps`; add `/api/glance`; remove the map-picker-only code paths in
`index.ts`. Do not touch `render.tsx` beyond passing new props.
Acceptance: tests with `mockFetch` cover all three resolution orders, the
cookie round-trip, `glance` output for a fixture with and without a
window, and that the Open-Meteo URL has rounded coordinates. Model:
Sonnet. Size: M.

### Wave 3 (after PR2, PR3, PR4, PR5 merge)

**PR6 — Page assembly and client script.** Branch `ribbon/page`. Files:
`src/render.tsx` (rewrite the landing and spot pages into one
`renderConditionsPage`; keep the attribution page), `src/render.test.tsx`,
new `public/app.js`, `src/index.ts` (call the new renderer), remove the
(rm) strings from `src/i18n-strings.ts`, remove Leaflet, remove
`DEFAULT_START_LOCATION` from `config.ts`. `app.js` implements, in this
order and each independently testable by hand: (1) ribbon scrub: pointer
down/move/up with `setPointerCapture`, hover preview for mouse only,
revert to selection on leave, arrow/Home/End keys when focused, exactly
the model in `wireRibbon`/`showHour`/`select` of the prototype; (2)
switcher open/close with the 220 ms grid-rows animation, outside-click and
Escape to close, search debounce 200 ms against `/api/search`, arrow-key
navigation, Enter picks the highlighted row, rows are links so they work
without JS once rendered; (3) GPS button: busy spin, geolocation with 8 s
timeout, navigate to `/{locale}/conditions?lat&lon&src=gps`; (4) star:
toggle `sd_spots`, update `aria-pressed` and the chip row in place with
the pop animation; (5) chips: fetch `/api/glance` for each chip, fill
`<small>` and add the `tier-*` class. Acceptance: `npm test` passes;
render tests cover the subtitle in all four states (best today, all day,
no window today with next, none ahead), the switcher-open state, chips
from a cookie, and XSS escaping of spot names in the page-data blob
(`<` must not appear raw); manual QA checklist in section 7 completed
with screenshots at 390 and 1100 in light and dark. Model: Opus. Size: L.
If it grows past ~600 changed lines in `render.tsx` + `app.js`, split
into PR6a (page, no script) and PR6b (script) on the same branch base.

### Step 2 (after PR6; parallel with Wave 4)

**PR9 — Map thumbnail and pinpoint panel.** Specified in full in
`docs/plans/ribbon-map.md`, with its own prototype
`prototypes/a-ribbon-map.html`. Restores the map as a thumbnail in the
title row plus an expand-in-place pinpoint panel. Same rules and runbook
as this plan.

### Step 3 (after PR9)

**PR11–PR13 — Any-country support.** Specified in
`docs/plans/ribbon-global.md`: timezone-correct "now" (PR11, can run any
time), global geocoding via Photon with Open-Meteo fallback (PR12), and
OpenStreetMap raster tiles (PR13). PDOK is retired there.

### Wave 4 (after PR6; parallel)

**PR7 — Motion and polish.** Branch `ribbon/polish`. SMIL wipe-in on the
curves, `.days` entry keyframe, `@view-transition { navigation: auto }`
with `view-transition-name` on `.hdr` and `.title-block` so spot switches
crossfade only the days, `prefers-reduced-motion` guards, focus-visible
styling on ribbons and buttons, the compact-mode guide-label halo. No
functional changes. Model: Sonnet. Size: S.

**PR8 — Docs and cleanup.** Branch `ribbon/docs`. Update `README.md`,
`src/README.md`, `public/README.md` for the new files and removed map
picker; delete `prototypes/` and `docs/plans/ribbon-fixture.html`; keep
this plan file with a one-line "shipped" note at the top. Model: Haiku.
Size: S.

Dependency graph:

```
PR0 ─┬─ PR1 ─┬─ PR4 ─┐
     ├─ PR2 ─┤       ├─ PR6 ─┬─ PR7
     ├─ PR3 ─┘       │       └─ PR8
     └───────── PR5 ─┘
```

## 7. Orchestrator runbook

**Per PR, in order:**

1. Spawn one implementing agent with: this file's path, the PR's section above copied verbatim, the model suggested, and `isolation: "worktree"` (the `Agent` tool creates the worktree; never edit the primary checkout).
2. The agent must run `npm test` and `npm run typecheck` before pushing, and for PR3/PR6/PR7 attach screenshots. `npm run dev` starts wrangler on http://localhost:8787 for manual checks.
3. Before the agent runs `gh pr create`, it confirms it is authenticated as the project's bot account rather than as a maintainer, following the credential setup documented in the local workspace instructions. If that check fails, the agent stops and reports; it does not create the PR another way.
4. PR description: first one or two sentences of prose are the summary (no "## Summary" header), then `## Test plan`, then the attribution footer line required by the repo's instructions. Request the repo owner as reviewer.
5. Wait for the human's approval. Never merge on your own judgment. After merge, rebase the next wave's branches on `main` before spawning.

**Escalate to the human (stop the wave) when:** an implementer reports the
plan is impossible as written; two consecutive attempts at the same PR
fail tests; a PR would touch files owned by another in-flight PR of the
same wave; the identity check fails.

**Do not:** let an implementer widen scope ("while I was here"), change
the DOM contract, add a build step, add a dependency, or bring back a
theme toggle or the map. Any of these is a plan change and goes to the
human first.

**Manual QA checklist (PR6, PR7, and final):**

- `/en/` with no cookies from an NL IP opens on the IP spot with a ribbon, no landing page.
- `/en/` after visiting a spot opens on that spot.
- Search "vinkeveen", Enter: page navigates, title updates, chip row unchanged, `sd_last` updated.
- Star: chip appears with a badge within a second; unstar removes it; reload keeps state.
- Drag across today's ribbon on a touch device: detail strip follows, selection stays where the finger lifts, page does not scroll horizontally.
- Mouse hover previews, leaving reverts to the selection.
- Keyboard: Tab to a ribbon, arrows move the selection.
- GPS button: spins, then navigates, and shows accent color on the new page.
- 390 px: threshold labels inside the chart, detail strip wraps to at most three lines, chips scroll horizontally without a scrollbar.
- Light and dark by flipping the OS setting; no stored override.
- JS disabled: page is complete and readable, chips and switcher links navigate, only scrub/search-as-you-type are missing.
- `nl` and `de` render without English leaking, including the glance badges.

## 8. Out of scope, and questions already answered

- Map "fine-tune" picker: not in this plan. It is step 2, `docs/plans/ribbon-map.md` (PR9), which starts after PR6 merges.
- Locations outside the Netherlands: not in this plan. It is step 3, `docs/plans/ribbon-global.md` (PR11–PR13), after PR9.
- Client-side spot switching without navigation: out. Cross-document view transitions cover the feel.
- Accounts or server-side saved spots: out. Cookies only.
- Chip badges for more than 8 spots: out; the store caps at 8.
- "Should the pill show the best hour's tier or the window's mode tier?" Mode tier, as in the prototype.
- "Should today's past hours be faded?" No; the prototype doesn't, and the now marker is enough.
- "Google Fonts?" No. Self-hosted subsets.
