# Ribbon UX, step 2: map thumbnail and pinpoint panel

**Shipped.** PR9 below has merged.

Follow-on to `docs/plans/ribbon-ux.md`. Start only after PR6 of that plan
has merged; PR7 and PR8 may run alongside this. Same rules apply: the
orchestrator hands the PR below to an implementing agent, nothing merges
without the human's approval, and the DOM contract here is final.

## 1. What it adds, and why

The Ribbon design retired the map, which cost two things: seeing exactly
which point a forecast is for, and choosing a more precise point (a lake
rather than the town next to it). This step restores both without a
separate page or mode:

- A **map thumbnail** leads the title row on every conditions page: a
  static 56×56 tile mosaic centered on the forecast point with a pin.
  Always visible, no interaction, no JavaScript needed to display it.
- Tapping it expands a **pinpoint panel** in place, using the same
  grid-rows expand the switcher uses. Leaflet loads only then. Drag the
  pin or tap the map, the panel shows the reverse-geocoded name and a
  "Use this point" button, which navigates to the new conditions URL.
  Only one of the switcher and the panel is open at a time.

Reference: `prototypes/a-ribbon-map.html`, the Ribbon prototype plus this
feature, diffed against `prototypes/a-ribbon.html` to see exactly what
changed; everything else in that file is identical. `prototypes/` has since
been deleted (PR8) - the prototypes live on the `ribbon/map-proto` branch if
anyone needs them.

## 2. DOM contract additions

Inside `.title-row`, before `.spot-btn`:

```html
<button class="map-thumb" id="map-thumb" aria-expanded="false" aria-controls="map-panel" aria-label="…">
  <span class="tiles" style="left:-131px;top:-102px">
    <img alt="" src="https://service.pdok.nl/brt/achtergrondkaart/wmts/v2_0/standaard/EPSG:3857/12/2106/1347.png">
    …four tiles: (tx,ty) (tx+1,ty) (tx,ty+1) (tx+1,ty+1)…
  </span>
  <svg class="thumb-pin">…</svg>
</button>
```

Inside `.title-block`, after `.switcher`:

```html
<div class="map-panel" id="map-panel"><div>
  <div class="map-card">
    <div class="map" id="map"></div>
    <div class="map-foot">
      <span class="map-hint" id="map-hint">Drag the pin or tap the map to pick the exact spot</span>
      <span class="map-name" id="map-name"></span>
      <a class="map-go" id="map-go" hidden href="#">Use this point</a>
    </div>
  </div>
</div></div>
```

`.title-block` gains `data-map="true|false"`. On narrow screens the spot
name wraps to two lines at 23 px instead of truncating (the prototype's
`@media (max-width: 560px)` block).

## 3. Server side

**Tile math** (`src/tiles.ts`, new, pure, with tests). For zoom 12 and a
point `(lat, lon)`:

```
n = 2^12
x = (lon + 180) / 360 * n
y = (1 - ln(tan(latRad) + sec(latRad)) / π) / 2 * n
tx = floor(x - 0.5),  ty = floor(y - 0.5)          # point never within 128 px of the mosaic edge
px = (x - tx) * 256,  py = (y - ty) * 256
left = 28 - px,       top = 28 - py                 # 28 = half of the 56 px thumbnail
```

Exports `thumbTiles(lat, lon): { urls: string[4], left: number, top: number }`.
Tile URL template is the PDOK BRT achtergrondkaart standaard WMTS the old
map picker used (constant in `tiles.ts`, not `config.ts`).

The thumbnail is rendered by the conditions page component with those
inline `left`/`top` styles, so the picture is correct before any script
runs. Tiles are `<img>` without `loading="lazy"` (lazy images outside the
clipped box never load).

**No new routes.** The panel uses the existing `/api/reverse` for the
name, and "Use this point" is a link to
`/{locale}/conditions?lat&lon&name=` built client-side once a name
resolves (it works as a plain link, so it also works if script dies
mid-way).

## 4. Client side

`public/app.js` gains a sixth job, `mapPanel()`:

- Click on `#map-thumb` toggles `data-map`; opening closes the switcher and vice versa; Escape and outside-click close whichever is open.
- First open injects Leaflet 1.9.4 CSS and JS from unpkg (same as the retired picker did), then creates the map at zoom 14 on the current spot with a draggable marker using the pin SVG as a `divIcon`. Subsequent opens reuse the map and reset the view.
- `invalidateSize()` 240 ms after opening, because the container grows from zero during the expand animation.
- The GPS button opens the panel after its fix resolves, centered on the fix with the pin on it, so the visitor sees where the fix landed and can drag it before trusting the forecast. In the live site this is a navigation to `/conditions?…&src=gps`, so the server renders that page with `data-map="true"` and `app.js` initializes the panel on load when it sees it.
- Map click or marker `dragend` calls `propose(lat, lon)`: hides the hint, shows "…", fetches `/api/reverse`, fills `.map-name`, sets `#map-go`'s `href`, unhides it. A stale reverse response (point changed since) is ignored.
- Dark mode: `.map .leaflet-tile-pane` and `.map-thumb .tiles` get `filter: brightness(0.82) saturate(0.85)` via `prefers-color-scheme`.

## 5. Strings

| Key | EN |
| --- | --- |
| `showOnMap` | `Show this spot on a map` |
| `mapHint` | `Drag the pin or tap the map to pick the exact spot` |
| `useThisPoint` | `Use this point` |
| `pickedPoint` | `Picked point` (fallback name when reverse geocoding fails) |

## 6. PR9 — Map thumbnail and pinpoint panel

Branch `ribbon/map`. Files: new `src/tiles.ts` + `src/tiles.test.ts`;
`src/render.tsx` (thumbnail and panel markup in the conditions page);
`src/i18n-strings.ts` (section 5, en/nl/de); `public/style.css` (port the
`map thumbnail + panel` block and the narrow-screen title rules from the
prototype); `public/app.js` (section 4). Acceptance: `npm test` and
`npm run typecheck` pass; `tiles.test.ts` checks a known point against
hand-computed tile indices and that `px`/`py` land in `[128, 384)`;
render tests assert four tile `<img>`s with the PDOK host, the inline
offsets, and escaping of the spot name in `aria-label`; manual QA at 390
and 1100 px, light and dark: thumbnail shows the right place, opening the
panel closes the switcher, tapping the map yields a name and a working
link, the linked page's thumbnail shows the new point, the GPS button
lands on a page with the panel already open on the fix, Escape closes,
Leaflet is not requested until the first open (check the network panel).
Model: Sonnet. Size: M.

## 7. Decided, don't reopen

- Thumbnail zoom is 12 (about 1.2 km across the 56 px box). Zoom 14 showed a single-color blob; 12 shows shoreline and street pattern.
- Leaflet from unpkg, lazy. Self-hosting Leaflet is not worth 40 KB in `public/` for a panel most visits never open.
- The panel does not replace the switcher's search. Search finds the place, the panel refines the point.
- A picked point's name is whatever `/api/reverse` returns (buurt, then woonplaats), same as GPS today.
