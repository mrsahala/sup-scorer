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
import type { Tier } from "./config";
import type { Spot } from "./spots";
import type { GeocodeResult } from "./geocode";

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

function groupByDate(hours: ScoredHour[]): Map<string, ScoredHour[]> {
  const byDate = new Map<string, ScoredHour[]>();
  for (const h of hours) {
    if (!h.isDaylight) continue;
    if (!byDate.has(h.date)) byDate.set(h.date, []);
    byDate.get(h.date)!.push(h);
  }
  return byDate;
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

// Open-Meteo's free API is CC BY 4.0 - attribution is a license term, not
// just courtesy. PDOK requires "naamsvermelding" (name attribution) on most
// of its datasets too. A linked attribution page (rather than inline text
// on every page) satisfies both, as long as the link is present on every
// page and the target page properly credits source + license.
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
  const byDate = groupByDate(scoredHours);
  const days = [...byDate.entries()];
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
          days.map(([date, hours]) => <Day key={date} locale={locale} date={date} hours={hours} />)
        ) : (
          <p class="empty">{t(locale, "noForecast")}</p>
        )}
        <p class="back">
          <a href={localizedUrl(locale, "/", "")}>{t(locale, "backToSpots")}</a>
        </p>
      </Layout>
    )
  );
}

// Renders the homepage: search box + curated spot list.
export function renderLandingPage({
  locale,
  spots,
  currentPath,
  search,
}: {
  locale: Locale;
  spots: Spot[];
  currentPath: string;
  search: string;
}): string {
  return (
    DOCTYPE +
    render(
      <Layout title={t(locale, "siteTitleLanding")} locale={locale} currentPath={currentPath} search={search}>
        <p class="subtitle">{t(locale, "subtitleLanding")}</p>
        <form class="search" action={localizedUrl(locale, "/search", "")} method="get">
          <input type="text" name="q" placeholder={t(locale, "searchPlaceholder")} required />
          <button type="submit">{t(locale, "searchButton")}</button>
        </form>
        <GeoLocationButton locale={locale} />
        <h2>{t(locale, "popularSpots")}</h2>
        <ul class="spots">
          {spots.map((s) => (
            <li key={s.slug}>
              <a href={localizedUrl(locale, `/spots/${s.slug}`, "")}>{s.name}</a>
            </li>
          ))}
        </ul>
      </Layout>
    )
  );
}

// Renders PDOK search results for a free-text query.
export function renderSearchPage({
  locale,
  query,
  results,
  error,
  currentPath,
  search,
}: {
  locale: Locale;
  query: string;
  results: GeocodeResult[];
  error?: string;
  currentPath: string;
  search: string;
}): string {
  let resultsNode: JSX.Element;
  if (error) {
    resultsNode = <p class="empty">{error}</p>;
  } else if (!results.length) {
    resultsNode = <p class="empty">{t(locale, "noMatches", { query })}</p>;
  } else {
    resultsNode = (
      <ul class="spots">
        {results.map((r) => {
          const href = localizedUrl(
            locale,
            `/conditions?lat=${r.lat}&lon=${r.lon}&name=${encodeURIComponent(r.name)}`,
            ""
          );
          return (
            <li key={href}>
              <a href={href}>{r.name}</a>
            </li>
          );
        })}
      </ul>
    );
  }
  return (
    DOCTYPE +
    render(
      <Layout
        title={t(locale, "siteTitleSearch", { query })}
        locale={locale}
        currentPath={currentPath}
        search={search}
      >
        <p class="subtitle">{t(locale, "subtitleSearch", { query })}</p>
        {resultsNode}
        <p class="back">
          <a href={localizedUrl(locale, "/", "")}>{t(locale, "backToSpots")}</a>
        </p>
      </Layout>
    )
  );
}

// Each *Body string is a full translated sentence with one or two <a> links
// already embedded as raw HTML (built by i18n.ts's t() via plain
// placeholder substitution, not escaped). dangerouslySetInnerHTML is safe
// here specifically because every value substituted into those sentences
// (openMeteoLink/licenseLink/pdokLink/repoLink/configLink below) is a
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
  const configLink = `<a href="https://github.com/mrsahala/sup-scorer/blob/main/src/config.ts" rel="noopener">src/config.ts</a>`;

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
          bodyHtml={t(locale, "attrScoringBody", { repoLink, configLink })}
        />
        <p class="back">
          <a href={localizedUrl(locale, "/", "")}>{t(locale, "backToSpots")}</a>
        </p>
      </Layout>
    )
  );
}
