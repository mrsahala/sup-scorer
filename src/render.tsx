// Renders per-hour scored forecast rows (scoring.ts's scoreHour output,
// grouped by day) and the search/landing/attribution pages, as HTML via
// Preact components rendered to a string. Every page is locale-aware (see
// i18n.ts) - shows every daylight hour (not just qualifying windows) so a
// visitor sees the whole day's shape, not just the good bits.
//
// JSX auto-escapes every text child and attribute value, so - unlike the
// hand-rolled-HTML version this replaced - dynamic values (location names,
// search queries, PDOK results) need no manual escaping here. The one
// deliberate exception is dangerouslySetInnerHTML on the attribution page,
// used only with developer-authored constants (never request/user data) -
// see the comment at its call site.
import render from "preact-render-to-string";
import type { ComponentChildren, JSX } from "preact";
import {
  t,
  compassLabel,
  dateLocale,
  localeName,
  localizedUrl,
  LOCALES,
  type Locale,
} from "./i18n";
import type { ScoredHour } from "./scoring";
import { groupByDate } from "./windows";
import { DEFAULT_START_LOCATION, type Tier } from "./config";

function formatDate(locale: Locale, dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!)).toLocaleDateString(dateLocale(locale), {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });
}

function tierLabel(locale: Locale, tier: Tier): string {
  switch (tier) {
    case "great":
      return t(locale, "tierGreat");
    case "good":
      return t(locale, "tierGood");
    case "marginal":
      return t(locale, "tierMarginal");
    case "poor":
      return t(locale, "tierPoor");
    case "avoid":
      return t(locale, "tierAvoid");
  }
}

// windDirDeg is the direction the wind blows FROM (meteorological
// convention). The arrow shown points where it's blowing TO - more
// intuitive as "which way you'd drift" - so it's rotated by deg + 180.
// CSS rotate() is clockwise from upright, matching compass bearings
// (0=N up, 90=E right, 180=S down, 270=W left), so no axis flip needed.
function WindArrow({ locale, deg }: { locale: Locale; deg: number }): JSX.Element | null {
  if (!Number.isFinite(deg)) return null;
  const toDeg = (deg + 180) % 360;
  const title = t(locale, "windFrom", { compass: compassLabel(locale, deg) });
  return (
    <span class="wind-arrow" style={{ transform: `rotate(${toDeg}deg)` }} title={title}>
      {"↑"}
    </span>
  );
}

function HourCell({ locale, h }: { locale: Locale; h: ScoredHour }): JSX.Element {
  return (
    <div class={`hour-cell tier-${h.tier}`}>
      <div class="hour-time">{h.hour}</div>
      <div class="hour-tier">
        {tierLabel(locale, h.tier)}
        {h.gustDowngraded ? "*" : ""}
      </div>
      <div class="hour-wind">
        <WindArrow locale={locale} deg={h.windDirDeg} />
        {h.windKmh}/{h.gustKmh} km/h
      </div>
      <div class="hour-temp">{h.tempC}°C</div>
    </div>
  );
}

function Day({ locale, date, hours }: { locale: Locale; date: string; hours: ScoredHour[] }): JSX.Element {
  return (
    <section class="day">
      <h2 class="day-heading">{formatDate(locale, date)}</h2>
      <div class="hours">
        {hours.map((h) => (
          <HourCell key={h.time} locale={locale} h={h} />
        ))}
      </div>
    </section>
  );
}

function LangSwitcher({
  locale,
  currentPath,
  search,
}: {
  locale: Locale;
  currentPath: string;
  search: string;
}): JSX.Element {
  return (
    <nav class="lang-switch">
      {LOCALES.flatMap((loc, i) => [
        i > 0 ? <span key={`${loc}-sep`}> · </span> : null,
        loc === locale ? (
          <strong key={`${loc}-item`}>{localeName(loc)}</strong>
        ) : (
          <a key={`${loc}-item`} href={localizedUrl(loc, currentPath, search)}>
            {localeName(loc)}
          </a>
        ),
      ])}
    </nav>
  );
}

// "Use my location" - the only client-side JS on the site. The script body
// itself is a static, developer-authored string (dangerouslySetInnerHTML is
// safe here for the same reason as the attribution page's: nothing from a
// request is interpolated into it). The per-request value (locale) travels
// via a data-* attribute instead, which goes through normal JSX escaping.
// The display name isn't handled here at all - the server reverse-geocodes
// it from lat/lon once redirected (see index.ts's /conditions handler).
function GeoLocationButton({ locale }: { locale: Locale }): JSX.Element {
  return (
    <>
      <button
        type="button"
        id="use-location"
        class="use-location"
        data-locale={locale}
        data-error={t(locale, "locationFailed")}
      >
        {t(locale, "useMyLocation")}
      </button>
      <script
        dangerouslySetInnerHTML={{
          __html: `
document.getElementById("use-location")?.addEventListener("click", function () {
  var btn = this;
  if (!navigator.geolocation) { alert(btn.dataset.error); return; }
  btn.disabled = true;
  navigator.geolocation.getCurrentPosition(
    function (pos) {
      var lat = pos.coords.latitude, lon = pos.coords.longitude;
      // No "name" param here on purpose - the server reverse-geocodes a
      // label from lat/lon (see index.ts's /conditions handler).
      window.location.href = "/" + btn.dataset.locale + "/conditions?lat=" + lat + "&lon=" + lon;
    },
    function () { btn.disabled = false; alert(btn.dataset.error); }
  );
});
`,
        }}
      />
    </>
  );
}

// The map picker's pin marker, used as a Leaflet divIcon's html.
const PIN_ICON_SVG =
  '<svg width="26" height="26" viewBox="0 0 26 26" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M13 2C8.6 2 5 5.5 5 9.8c0 6 8 14 8 14s8-8 8-14C21 5.5 17.4 2 13 2z" fill="var(--pin)" stroke="var(--card)" stroke-width="1.5"/><circle cx="13" cy="9.8" r="3.2" fill="var(--card)"/></svg>';

// Search-then-pinpoint location picker: the search box flies a Leaflet map
// (PDOK tiles) to a result, then the visitor drags/taps the pin to the
// exact spot before confirming. When ipLocation is set (see index.ts's
// ipLocationFrom), the map opens centered there with the pin already
// dropped, instead of the whole country.
function LocationPicker({
  locale,
  ipLocation = null,
}: {
  locale: Locale;
  ipLocation?: { lat: number; lon: number; name: string | null } | null;
}): JSX.Element {
  return (
    <div class="picker">
      <div class="search-wrap">
        <form id="picker-search-form" class="search">
          <input
            type="text"
            id="picker-search-input"
            placeholder={t(locale, "searchPlaceholder")}
            autocomplete="off"
          />
          <button type="submit">{t(locale, "searchButton")}</button>
        </form>
        <div class="autocomplete" id="picker-autocomplete" hidden></div>
      </div>
      <div
        id="picker-map"
        class="picker-map"
        data-locale={locale}
        data-no-matches={t(locale, "noSearchResults")}
        data-search-failed={t(locale, "searchFailed")}
        data-ip-lat={ipLocation ? String(ipLocation.lat) : undefined}
        data-ip-lon={ipLocation ? String(ipLocation.lon) : undefined}
        data-ip-name={ipLocation?.name ?? undefined}
      ></div>
      <div class="picker-panel" id="picker-panel" hidden>
        <div class="label">{t(locale, "pickedSpot")}</div>
        <div class="picker-name" id="picker-name"></div>
        <a class="picker-go" id="picker-go" href="#">
          {t(locale, "getConditionsHere")}
        </a>
      </div>
      <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
      <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
      <script
        dangerouslySetInnerHTML={{
          __html: `
(function () {
  var mapEl = document.getElementById("picker-map");
  var locale = mapEl.dataset.locale;
  var ipLat = mapEl.dataset.ipLat ? Number(mapEl.dataset.ipLat) : null;
  var ipLon = mapEl.dataset.ipLon ? Number(mapEl.dataset.ipLon) : null;
  var hasIpLocation = ipLat !== null && ipLon !== null;

  var map = L.map(mapEl).setView(
    hasIpLocation ? [ipLat, ipLon] : ${JSON.stringify(DEFAULT_START_LOCATION)},
    hasIpLocation ? 12 : 7
  );
  L.tileLayer("https://service.pdok.nl/brt/achtergrondkaart/wmts/v2_0/standaard/EPSG:3857/{z}/{x}/{y}.png", {
    attribution: "&copy; PDOK / Kadaster",
    maxZoom: 19
  }).addTo(map);

  var pinIcon = L.divIcon({
    className: "picker-pin",
    html: ${JSON.stringify(PIN_ICON_SVG)},
    iconSize: [26, 26],
    iconAnchor: [13, 24]
  });
  var marker = null;

  var panel = document.getElementById("picker-panel");
  var nameEl = document.getElementById("picker-name");
  var goEl = document.getElementById("picker-go");

  function selectPoint(lat, lon, knownName) {
    if (!marker) marker = L.marker([lat, lon], { icon: pinIcon, draggable: true }).addTo(map).on("dragend", function () {
      var pos = marker.getLatLng();
      selectPoint(pos.lat, pos.lng, null);
    });
    else marker.setLatLng([lat, lon]);

    panel.hidden = false;
    goEl.href = "/" + locale + "/conditions?lat=" + lat + "&lon=" + lon + (knownName ? "&name=" + encodeURIComponent(knownName) : "");

    if (knownName) { nameEl.textContent = knownName; return; }
    nameEl.textContent = "…";
    fetch("/api/reverse?lat=" + lat + "&lon=" + lon)
      .then(function (r) { return r.json(); })
      .then(function (data) { nameEl.textContent = data.name || nameEl.textContent; })
      .catch(function () {});
  }

  map.on("click", function (e) { selectPoint(e.latlng.lat, e.latlng.lng, null); });

  // Pre-select the IP-guessed spot so the panel/link are ready immediately.
  if (hasIpLocation) selectPoint(ipLat, ipLon, mapEl.dataset.ipName || null);

  var form = document.getElementById("picker-search-form");
  var input = document.getElementById("picker-search-input");
  var dropdown = document.getElementById("picker-autocomplete");
  var results = [];
  var activeIndex = -1;
  var debounceTimer = null;

  function goToResult(r) {
    map.flyTo([r.lat, r.lon], 15);
    selectPoint(r.lat, r.lon, r.name);
    mapEl.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function closeDropdown() {
    dropdown.hidden = true;
    dropdown.innerHTML = "";
    activeIndex = -1;
  }

  function showMessage(text) {
    dropdown.innerHTML = "";
    var p = document.createElement("p");
    p.className = "empty";
    p.textContent = text || "";
    dropdown.appendChild(p);
    dropdown.hidden = false;
  }

  function pick(r) {
    input.value = r.name;
    goToResult(r);
    closeDropdown();
  }

  function renderDropdown() {
    dropdown.innerHTML = "";
    results.forEach(function (r, i) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = r.name;
      if (i === activeIndex) btn.className = "active";
      // mousedown (fires before the input's blur) + preventDefault, so
      // tapping a suggestion doesn't lose the selection to blur closing
      // the dropdown first.
      btn.addEventListener("mousedown", function (e) {
        e.preventDefault();
        pick(r);
      });
      dropdown.appendChild(btn);
    });
    dropdown.hidden = false;
  }

  // Live suggestions as you type - like a search engine's autocomplete,
  // not a results page. Debounced so every keystroke doesn't hit the API.
  input.addEventListener("input", function () {
    var q = input.value.trim();
    clearTimeout(debounceTimer);
    if (!q) { closeDropdown(); return; }
    debounceTimer = setTimeout(function () {
      fetch("/api/search?q=" + encodeURIComponent(q))
        .then(function (r) { return r.json(); })
        .then(function (data) {
          results = data;
          activeIndex = -1;
          if (!results.length) { showMessage(mapEl.dataset.noMatches); return; }
          renderDropdown();
        })
        .catch(function () { results = []; showMessage(mapEl.dataset.searchFailed); });
    }, 250);
  });

  input.addEventListener("keydown", function (e) {
    if (!results.length) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      activeIndex = (activeIndex + 1) % results.length;
      renderDropdown();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      activeIndex = (activeIndex - 1 + results.length) % results.length;
      renderDropdown();
    } else if (e.key === "Escape") {
      closeDropdown();
    }
  });

  // Delayed so a suggestion's mousedown (above) still gets to run first.
  input.addEventListener("blur", function () { setTimeout(closeDropdown, 150); });

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    clearTimeout(debounceTimer);
    // Whatever type the top (or keyboard-highlighted) match is - city,
    // address, POI, no further filtering - go straight there.
    var chosen = results[activeIndex >= 0 ? activeIndex : 0];
    if (chosen) pick(chosen);
  });
})();
`,
        }}
      />
    </div>
  );
}

// Links to the attribution page (required by Open-Meteo/PDOK's license terms).
function Footer({ locale }: { locale: Locale }): JSX.Element {
  return (
    <footer class="site-footer">
      <a href={localizedUrl(locale, "/attribution", "")}>{t(locale, "dataAttribution")}</a>
    </footer>
  );
}

function Layout({
  title,
  locale,
  currentPath,
  search,
  children,
}: {
  title: string;
  locale: Locale;
  currentPath: string;
  search: string;
  children: ComponentChildren;
}): JSX.Element {
  return (
    <html lang={locale}>
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{title}</title>
        <link rel="stylesheet" href="/style.css" />
      </head>
      <body>
        <main>
          <div class="top-bar">
            <h1>
              <a href={localizedUrl(locale, "/", "")}>supdawg</a>
            </h1>
            <LangSwitcher locale={locale} currentPath={currentPath} search={search} />
          </div>
          {children}
          <Footer locale={locale} />
        </main>
      </body>
    </html>
  );
}

// preact-render-to-string has no notion of a document-level doctype (it's
// not part of the VNode tree) - prepended by hand on every page below.
const DOCTYPE = "<!doctype html>\n";

// Renders one location's hourly conditions page.
export function renderSpotPage({
  locale,
  locationName,
  scoredHours,
  currentPath,
  search,
}: {
  locale: Locale;
  locationName: string;
  scoredHours: ScoredHour[];
  currentPath: string;
  search: string;
}): string {
  // groupByDate keeps night hours now; this page still shows daylight only.
  const days = groupByDate(scoredHours)
    .map((d) => ({ date: d.date, hours: d.hours.filter((h) => h.isDaylight) }))
    .filter((d) => d.hours.length > 0);
  return (
    DOCTYPE +
    render(
      <Layout
        title={t(locale, "siteTitleSpot", { location: locationName })}
        locale={locale}
        currentPath={currentPath}
        search={search}
      >
        <p class="subtitle">{t(locale, "subtitleSpot", { location: locationName })}</p>
        <p class="legend">{t(locale, "legend")}</p>
        {days.length ? (
          days.map((d) => <Day key={d.date} locale={locale} date={d.date} hours={d.hours} />)
        ) : (
          <p class="empty">{t(locale, "noForecast")}</p>
        )}
        <p class="back">
          <a href={localizedUrl(locale, "/", "")}>{t(locale, "backHome")}</a>
        </p>
      </Layout>
    )
  );
}

// Renders the homepage: search-then-pinpoint location picker (see
// LocationPicker) - no curated list, any point in the Netherlands works.
export function renderLandingPage({
  locale,
  currentPath,
  search,
  ipLocation = null,
}: {
  locale: Locale;
  currentPath: string;
  search: string;
  ipLocation?: { lat: number; lon: number; name: string | null } | null;
}): string {
  return (
    DOCTYPE +
    render(
      <Layout title={t(locale, "siteTitleLanding")} locale={locale} currentPath={currentPath} search={search}>
        <p class="subtitle">{t(locale, "subtitleLanding")}</p>
        <GeoLocationButton locale={locale} />
        <LocationPicker locale={locale} ipLocation={ipLocation} />
      </Layout>
    )
  );
}

// Each *Body string is a full translated sentence with one or two <a> links
// already embedded as raw HTML (built by i18n.ts's t() via plain
// placeholder substitution, not escaped). dangerouslySetInnerHTML is safe
// here specifically because every value substituted into those sentences
// (openMeteoLink/licenseLink/pdokLink/repoLink below) is a
// hardcoded constant in this file, never anything from a request - unlike
// every other dynamic value on this page, which flows through normal JSX
// children and gets auto-escaped.
function AttributionSection({ heading, bodyHtml }: { heading: string; bodyHtml: string }): JSX.Element {
  return (
    <section class="credit">
      <h2>{heading}</h2>
      <p dangerouslySetInnerHTML={{ __html: bodyHtml }} />
    </section>
  );
}

// Renders the /attribution page (data-source credits).
export function renderAttributionPage({
  locale,
  currentPath,
  search,
}: {
  locale: Locale;
  currentPath: string;
  search: string;
}): string {
  const openMeteoLink = `<a href="https://open-meteo.com/" rel="noopener">Open-Meteo</a>`;
  const licenseLink = `<a href="https://creativecommons.org/licenses/by/4.0/" rel="noopener">CC BY 4.0</a>`;
  const pdokLink = `<a href="https://www.pdok.nl/" rel="noopener">PDOK</a>`;
  const repoLink = `<a href="https://github.com/mrsahala/sup-scorer" rel="noopener">GitHub repository</a>`;

  return (
    DOCTYPE +
    render(
      <Layout title={t(locale, "siteTitleAttribution")} locale={locale} currentPath={currentPath} search={search}>
        <p class="subtitle">{t(locale, "subtitleAttribution")}</p>
        <AttributionSection
          heading={t(locale, "attrWeatherHeading")}
          bodyHtml={t(locale, "attrWeatherBody", { openMeteoLink, licenseLink })}
        />
        <AttributionSection
          heading={t(locale, "attrLocationHeading")}
          bodyHtml={t(locale, "attrLocationBody", { pdokLink })}
        />
        <AttributionSection
          heading={t(locale, "attrScoringHeading")}
          bodyHtml={t(locale, "attrScoringBody", { repoLink })}
        />
        <p class="back">
          <a href={localizedUrl(locale, "/", "")}>{t(locale, "backHome")}</a>
        </p>
      </Layout>
    )
  );
}
