// The two server-rendered pages: the conditions page and the attribution page.
//
// The conditions page is complete HTML - header, title block with the spot
// switcher, saved-spot chips, one DayCard per day, and the #page-data blob the
// client script reads. Markup follows the DOM contract in
// docs/plans/ribbon-ux.md section 3, which public/style.css is written against.
//
// JSX auto-escapes every text child and attribute value, so dynamic values
// (spot names, PDOK results) need no manual escaping. There are two
// dangerouslySetInnerHTML exceptions, both with values that never come from a
// request: the attribution page's link-bearing sentences, and the #page-data
// blob, whose JSON is escaped by pageDataJson instead of by JSX.
import render from "preact-render-to-string";
import type { ComponentChildren, JSX } from "preact";
import {
  t,
  compassLabel,
  dayLabel,
  localeName,
  localizedUrl,
  LOCALES,
  type Locale,
} from "./i18n";
import type { ScoredHour } from "./scoring";
import { DayCard, defaultSel, interpolate } from "./ribbon";
import { daySummary, groupByDate, type GoodWindow } from "./windows";
import type { SdSpot } from "./cookies";
import { LOCATION, type Tier } from "./config";

// The spot the page is about; gps marks a position the visitor's device gave us.
export interface PageSpot {
  name: string;
  lat: number;
  lon: number;
  gps: boolean;
}

// ~10 m. Re-searching the same place rounds differently, so coordinates are
// compared with a tolerance rather than for equality.
const SPOT_EPSILON = 1e-4;

const sameSpot = (a: { lat: number; lon: number }, b: { lat: number; lon: number }): boolean =>
  Math.abs(a.lat - b.lat) < SPOT_EPSILON && Math.abs(a.lon - b.lon) < SPOT_EPSILON;

// PDOK names are "Street, City, Province"; the title and chips want the head of that.
const shortName = (name: string): string => name.split(",")[0]!.trim();

const pad2 = (v: number) => String(v).padStart(2, "0");
const fmtHour = (h: number) => `${pad2(h)}:00`;
const fmtRange = (w: GoodWindow) => `${fmtHour(w.startHour)}–${fmtHour(w.endHour)}`;

function conditionsUrl(locale: Locale, spot: { name: string; lat: number; lon: number }): string {
  return `/${locale}/conditions?lat=${spot.lat}&lon=${spot.lon}&name=${encodeURIComponent(spot.name)}`;
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

// The wall clock in the timezone weather.ts buckets hours into - the Worker
// itself runs in UTC, so "today" and the now marker can't come from the raw Date.
function localNow(now: Date, timeZone: string): { date: string; hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const part = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return {
    date: `${part("year")}-${part("month")}-${part("day")}`,
    hour: Number(part("hour")),
    minute: Number(part("minute")),
  };
}

// One day card's inputs, resolved once so data-sel and #page-data can't diverge.
interface DayView {
  date: string;
  hours: ScoredHour[];
  sel: number;
  nowIndex: number;
  isToday: boolean;
}

function buildDays(scoredHours: ScoredHour[], todayDate: string, nowHour: number): DayView[] {
  return groupByDate(scoredHours)
    .map((d) => ({ date: d.date, hours: d.hours.filter((h) => h.isDaylight) }))
    .filter((d) => d.hours.length > 0)
    .map((d) => {
      const isToday = d.date === todayDate;
      const nowIndex = isToday ? d.hours.findIndex((h) => h.hourNum === nowHour) : -1;
      return { ...d, isToday, nowIndex, sel: defaultSel(d.hours, nowIndex, isToday) };
    });
}

function ChevronIcon(): JSX.Element {
  return (
    <svg
      class="chev"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <path d="M5 8l5 5 5-5" />
    </svg>
  );
}

function StarIcon({ cls }: { cls?: string }): JSX.Element {
  return (
    <svg class={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round">
      <path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1.1 5.9L12 16.9l-5.3 2.8 1.1-5.9-4.3-4.1 5.9-.8z" />
    </svg>
  );
}

function GpsIcon(): JSX.Element {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
      <circle cx="10" cy="10" r="3" />
      <circle cx="10" cy="10" r="7" />
      <path d="M10 1v2M10 17v2M1 10h2M17 10h2" />
    </svg>
  );
}

function SearchIcon(): JSX.Element {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
      <circle cx="9" cy="9" r="6" />
      <path d="M14 14l4 4" />
    </svg>
  );
}

// Today's verdict, in one of four states: a best window, a window all day, no
// window today but one later in the lookahead, or nothing ahead at all.
function Sub({ locale, days, todayDate }: { locale: Locale; days: DayView[]; todayDate: string }): JSX.Element {
  const todayIndex = days.findIndex((d) => d.isToday);
  const summary = todayIndex >= 0 ? daySummary(days[todayIndex]!.hours) : null;

  if (summary?.best) {
    const tier = tierLabel(locale, summary.best.modeTier);
    const allDay = summary.daylightHours > 0 && summary.qualifyingHours === summary.daylightHours;
    return (
      <p class={`sub tier-${summary.best.modeTier}`}>
        <i class="dot" />
        <span>
          {allDay
            ? interpolate(t(locale, "allDayToday"), {
                tier: <b>{tier}</b>,
                hours: String(summary.daylightHours),
              })
            : interpolate(t(locale, "bestToday"), {
                range: <b class="mono">{fmtRange(summary.best)}</b>,
                tier: <b>{tier}</b>,
              })}
        </span>
      </p>
    );
  }

  const next = days
    .slice(todayIndex + 1)
    .map((d) => ({ day: d, summary: daySummary(d.hours) }))
    .find((x) => x.summary.best);
  return (
    <p class="sub">
      <i class="dot" />
      <span>
        {next
          ? interpolate(t(locale, "noWindowToday"), {
              day: <b>{dayLabel(locale, next.day.date, todayDate)}</b>,
              hour: <b class="mono">{fmtHour(next.summary.best!.startHour)}</b>,
            })
          : interpolate(t(locale, "noWindowAhead"), { days: String(days.length) })}
      </span>
    </p>
  );
}

function TitleBlock({
  locale,
  spot,
  saved,
  savedSpots,
  switcherOpen,
  days,
  todayDate,
}: {
  locale: Locale;
  spot: PageSpot;
  saved: boolean;
  savedSpots: SdSpot[];
  switcherOpen: boolean;
  days: DayView[];
  todayDate: string;
}): JSX.Element {
  return (
    <section class="title-block" id="title-block" data-open={switcherOpen ? "true" : "false"}>
      <div class="title-row">
        <button class="spot-btn" id="spot-btn" aria-expanded={switcherOpen ? "true" : "false"} aria-controls="switcher">
          <span class="spot-name">{shortName(spot.name)}</span>
          <ChevronIcon />
        </button>
        <button
          class="star"
          id="star"
          aria-pressed={saved ? "true" : "false"}
          aria-label={t(locale, saved ? "unsaveSpot" : "saveSpot")}
        >
          <StarIcon />
        </button>
        <button
          class="star gps"
          id="gps"
          aria-pressed={spot.gps ? "true" : "false"}
          aria-label={t(locale, "useMyLocation")}
          title={t(locale, "useMyLocation")}
        >
          <GpsIcon />
        </button>
      </div>
      <Sub locale={locale} days={days} todayDate={todayDate} />
      <div class="switcher" id="switcher">
        <div>
          <div class="switcher-card">
            <div class="search-wrap">
              <SearchIcon />
              <input
                class="search"
                id="search"
                type="search"
                placeholder={t(locale, "searchPlaceholder")}
                autocomplete="off"
                spellcheck={false}
              />
            </div>
            <div class="list" id="results" role="listbox"></div>
            <div class="hint" id="hint" hidden={!switcherOpen}>
              {switcherOpen ? t(locale, "switcherOpenHint") : ""}
            </div>
            <div class="list-h" id="saved-h" hidden={savedSpots.length === 0}>
              {t(locale, "savedSpots")}
            </div>
            <div class="list" id="saved">
              {savedSpots.map((s) => (
                <a key={`${s.lat},${s.lon}`} class="row" href={conditionsUrl(locale, s)}>
                  <StarIcon cls="ic" />
                  <span class="nm">{s.name}</span>
                </a>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// One chip per saved spot. The tier class and the <small> badge text are
// filled in by app.js from /api/glance; without JS the chips are plain links.
function Chips({ locale, spot, savedSpots }: { locale: Locale; spot: PageSpot; savedSpots: SdSpot[] }): JSX.Element {
  return (
    <div class="chips" id="chips">
      {savedSpots.map((s) => (
        <a
          key={`${s.lat},${s.lon}`}
          class={sameSpot(s, spot) ? "chip active" : "chip"}
          href={conditionsUrl(locale, s)}
          data-lat={s.lat}
          data-lon={s.lon}
        >
          <i />
          <span>{shortName(s.name)}</span>
          <small />
        </a>
      ))}
    </div>
  );
}

// The client script rebuilds the detail strip as you scrub, so it needs the
// same numbers and copy the server rendered with. JSON in a
// <script type="application/json"> only has to escape "<" to be inert; JSX's
// own escaping would turn the quotes into entities and corrupt it.
function pageDataJson(locale: Locale, spot: PageSpot, saved: boolean, days: DayView[]): string {
  const data = {
    locale,
    spot: { name: spot.name, lat: spot.lat, lon: spot.lon, gps: spot.gps, saved },
    days: days.map((d) => ({
      date: d.date,
      sel: d.sel,
      hours: d.hours.map((h) => ({
        hour: h.hour,
        hourNum: h.hourNum,
        tier: h.tier,
        windKmh: h.windKmh,
        gustKmh: h.gustKmh,
        tempC: h.tempC,
        windDirDeg: h.windDirDeg,
        gustDowngraded: h.gustDowngraded,
        coldLimited: h.coldLimited,
      })),
    })),
    strings: {
      reasonGust: t(locale, "reasonGust"),
      reasonCold: t(locale, "reasonCold"),
      reasonSustained: t(locale, "reasonSustained"),
      detailFrom: t(locale, "detailFrom"),
      noMatches: t(locale, "noSearchResults"),
      searchFailed: t(locale, "searchFailed"),
      locating: t(locale, "locating"),
      locationFailed: t(locale, "locationFailed"),
      savedSpots: t(locale, "savedSpots"),
      saveSpot: t(locale, "saveSpot"),
      unsaveSpot: t(locale, "unsaveSpot"),
      tiers: {
        great: t(locale, "tierGreat"),
        good: t(locale, "tierGood"),
        marginal: t(locale, "tierMarginal"),
        poor: t(locale, "tierPoor"),
        avoid: t(locale, "tierAvoid"),
      },
      compass: [0, 1, 2, 3, 4, 5, 6, 7].map((i) => compassLabel(locale, i * 45)),
    },
  };
  return JSON.stringify(data).replaceAll("<", "\\u003c");
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

function Layout({
  title,
  locale,
  currentPath,
  search,
  pageData,
  children,
}: {
  title: string;
  locale: Locale;
  currentPath: string;
  search: string;
  pageData?: string;
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
        <header class="hdr">
          <div class="hdr-in">
            <a class="wordmark" href={localizedUrl(locale, "/", "")}>
              <i />
              supdawg
            </a>
            <LangSwitcher locale={locale} currentPath={currentPath} search={search} />
          </div>
        </header>
        <main>{children}</main>
        {/* Links to the attribution page, required by Open-Meteo/PDOK's license terms. */}
        <footer class="site-footer">
          <a href={localizedUrl(locale, "/attribution", "")}>{t(locale, "dataAttribution")}</a>
        </footer>
        {pageData === undefined ? null : (
          <script type="application/json" id="page-data" dangerouslySetInnerHTML={{ __html: pageData }} />
        )}
        <script type="module" src="/app.js" />
      </body>
    </html>
  );
}

// preact-render-to-string has no notion of a document-level doctype (it's
// not part of the VNode tree) - prepended by hand on every page below.
const DOCTYPE = "<!doctype html>\n";

// Renders one spot's conditions: the whole site, apart from /attribution.
export function renderConditionsPage({
  locale,
  spot,
  scoredHours,
  currentPath,
  search,
  switcherOpen = false,
  savedSpots = [],
  now = new Date(),
}: {
  locale: Locale;
  spot: PageSpot;
  scoredHours: ScoredHour[];
  currentPath: string;
  search: string;
  switcherOpen?: boolean;
  savedSpots?: SdSpot[];
  now?: Date;
}): string {
  const clock = localNow(now, LOCATION.timezone);
  const days = buildDays(scoredHours, clock.date, clock.hour);
  const saved = savedSpots.some((s) => sameSpot(s, spot));

  return (
    DOCTYPE +
    render(
      <Layout
        title={t(locale, "siteTitleSpot", { location: shortName(spot.name) })}
        locale={locale}
        currentPath={currentPath}
        search={search}
        pageData={pageDataJson(locale, spot, saved, days)}
      >
        <TitleBlock
          locale={locale}
          spot={spot}
          saved={saved}
          savedSpots={savedSpots}
          switcherOpen={switcherOpen}
          days={days}
          todayDate={clock.date}
        />
        <Chips locale={locale} spot={spot} savedSpots={savedSpots} />
        <div class="days" id="days">
          {days.length ? (
            days.map((d) => (
              <DayCard
                key={d.date}
                locale={locale}
                date={d.date}
                hours={d.hours}
                today={clock.date}
                sel={d.sel}
                nowIndex={d.nowIndex}
                nowFraction={clock.minute / 60}
              />
            ))
          ) : (
            <p class="empty">{t(locale, "noForecast")}</p>
          )}
        </div>
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
