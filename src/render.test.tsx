// Covers the conditions page's assembled parts: the four subtitle states, the
// switcher-open state, chips rendered from the sd_spots cookie, and the
// #page-data blob's escaping. The ribbon itself is ribbon.test.tsx's.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { renderConditionsPage, renderAttributionPage } from "./render";
import { scoreHour, type ScoredHour } from "./scoring";
import type { HourRow } from "./weather";

const XSS = '<script>alert(1)</script>';
const TODAY = "2026-09-20";
const TOMORROW = "2026-09-21";
// 09:35 Amsterdam on TODAY, so "today" and the now marker are deterministic.
const NOW = new Date("2026-09-20T09:35:00+02:00");

const baseArgs = {
  locale: "en" as const,
  spot: { name: "Loosdrecht", lat: 52.2, lon: 5.08, gps: false },
  currentPath: "/",
  search: "",
  now: NOW,
};

function row(date: string, hourNum: number, windKmh: number): HourRow {
  return {
    time: `${date}T${String(hourNum).padStart(2, "0")}:00`,
    date,
    hour: `${String(hourNum).padStart(2, "0")}:00`,
    hourNum,
    tempC: 18,
    windKmh,
    gustKmh: windKmh,
    windDirDeg: 225,
    weatherCode: 0,
    isDaylight: true,
    sunrise: "07:23",
    sunset: "19:40",
  };
}

// winds pick the tier: 8 great, 13 good, 18 marginal, 23 poor.
const day = (date: string, winds: number[], startHour = 8): ScoredHour[] =>
  winds.map((w, i) => scoreHour(row(date, startHour + i, w)));

// The JSON the client script reads, unwrapped from its <script> element.
function pageData(html: string): string {
  const open = '<script type="application/json" id="page-data">';
  const start = html.indexOf(open);
  assert.notEqual(start, -1);
  return html.slice(start + open.length, html.indexOf("</script>", start));
}

describe("subtitle", () => {
  test("a best window today shows its full range and tier", () => {
    const html = renderConditionsPage({ ...baseArgs, scoredHours: day(TODAY, [23, 23, 23, 13, 13, 13, 23, 23]) });
    assert.ok(html.includes('class="sub tier-good"'));
    assert.ok(html.includes("Best today"));
    assert.ok(html.includes('<b class="mono">11:00–14:00</b>'));
  });

  test("every daylight hour qualifying shows the all-day wording", () => {
    const html = renderConditionsPage({ ...baseArgs, scoredHours: day(TODAY, [13, 13, 13, 13, 13, 13]) });
    assert.ok(html.includes('class="sub tier-good"'));
    assert.ok(html.includes("all day today"));
    assert.ok(html.includes("6h of daylight"));
  });

  test("no window today points at the next day that has one", () => {
    const html = renderConditionsPage({
      ...baseArgs,
      scoredHours: [...day(TODAY, [23, 23, 23]), ...day(TOMORROW, [23, 13, 13])],
    });
    assert.ok(html.includes('class="sub"'));
    assert.ok(html.includes("No good window today"));
    assert.ok(html.includes("<b>Tomorrow</b>"));
    assert.ok(html.includes('<b class="mono">09:00</b>'));
  });

  test("no window anywhere in the lookahead counts the days", () => {
    const html = renderConditionsPage({
      ...baseArgs,
      scoredHours: [...day(TODAY, [23, 23, 23]), ...day(TOMORROW, [23, 23, 23])],
    });
    assert.ok(html.includes("No good window in the next 2 days"));
  });
});

describe("switcher", () => {
  const scoredHours = day(TODAY, [13, 13, 13]);

  test("is closed by default", () => {
    const html = renderConditionsPage({ ...baseArgs, scoredHours });
    assert.ok(html.includes('data-open="false"'));
    assert.ok(html.includes('aria-expanded="false"'));
    assert.ok(!html.includes("Pick a spot to get started"));
  });

  test("switcherOpen renders it open, with the hint", () => {
    const html = renderConditionsPage({ ...baseArgs, scoredHours, switcherOpen: true });
    assert.ok(html.includes('data-open="true"'));
    assert.ok(html.includes('aria-expanded="true"'));
    assert.ok(html.includes("Pick a spot to get started"));
  });
});

describe("saved spots", () => {
  const scoredHours = day(TODAY, [13, 13, 13]);
  const savedSpots = [
    { name: "Loosdrecht", lat: 52.2, lon: 5.08 },
    { name: "Kralingse Plas, Rotterdam", lat: 51.94, lon: 4.51 },
  ];

  test("render as chips, the current spot marked active, badges left to app.js", () => {
    const html = renderConditionsPage({ ...baseArgs, scoredHours, savedSpots });
    assert.ok(html.includes('<a class="chip active" href="/en/conditions?lat=52.2&amp;lon=5.08&amp;name=Loosdrecht"'));
    assert.ok(html.includes('data-lat="51.94" data-lon="4.51"'));
    assert.ok(html.includes("<span>Kralingse Plas</span><small></small>"));
  });

  test("also fill the switcher's saved list, and the star reads as pressed", () => {
    const html = renderConditionsPage({ ...baseArgs, scoredHours, savedSpots });
    assert.ok(html.includes('aria-pressed="true" aria-label="Remove from saved spots"'));
    assert.ok(html.includes('<span class="nm">Kralingse Plas, Rotterdam</span>'));
    assert.ok(!html.includes('id="saved-h" hidden'));
  });

  test("no cookie means no chips and an unpressed star", () => {
    const html = renderConditionsPage({ ...baseArgs, scoredHours });
    assert.ok(html.includes('<div class="chips" id="chips"></div>'));
    assert.ok(html.includes('aria-pressed="false" aria-label="Save this spot"'));
  });
});

describe("#page-data", () => {
  const scoredHours = day(TODAY, [23, 13, 13]);

  test("carries the spot, the selection, and the strings app.js needs", () => {
    const html = renderConditionsPage({ ...baseArgs, scoredHours });
    const data = JSON.parse(pageData(html));
    assert.equal(data.locale, "en");
    assert.deepEqual(data.spot, { name: "Loosdrecht", lat: 52.2, lon: 5.08, gps: false, saved: false });
    assert.equal(data.days.length, 1);
    assert.equal(data.days[0].date, TODAY);
    assert.equal(data.days[0].hours.length, 3);
    assert.equal(data.strings.tiers.great, "Great");
    assert.equal(data.strings.compass[0], "N");
  });

  test("the rendered selection matches the blob's", () => {
    const html = renderConditionsPage({ ...baseArgs, scoredHours });
    const data = JSON.parse(pageData(html));
    assert.ok(html.includes(`data-sel="${data.days[0].sel}"`));
  });

  test("a locale change translates the strings", () => {
    const html = renderConditionsPage({ ...baseArgs, locale: "nl", scoredHours });
    assert.equal(JSON.parse(pageData(html)).strings.tiers.great, "Geweldig");
  });
});

// Preact only entity-escapes "<", "&" and quotes, not ">" - a lone ">" in text
// can't open a tag. The check is that "<" never survives unescaped anywhere,
// including inside the JSON blob, which JSX does not escape for us.
describe("XSS-shaped input is escaped, not executed", () => {
  const scoredHours = day(TODAY, [13, 13, 13]);
  const spot = { name: XSS, lat: 52.2, lon: 5.08, gps: false };

  test("a spot name in the page body", () => {
    const html = renderConditionsPage({ ...baseArgs, spot, scoredHours });
    assert.ok(!html.includes("<script>alert(1)</script>"));
    assert.ok(html.includes("&lt;script>"));
  });

  test("a spot name in the page-data blob", () => {
    const html = renderConditionsPage({ ...baseArgs, spot, scoredHours });
    const blob = pageData(html);
    assert.ok(!blob.includes("<"));
    assert.ok(blob.includes("\\u003cscript>"));
    assert.equal(JSON.parse(blob).spot.name, XSS);
  });

  test("a saved spot's name in the page-data blob", () => {
    const html = renderConditionsPage({
      ...baseArgs,
      scoredHours,
      savedSpots: [{ name: XSS, lat: 51.9, lon: 4.5 }],
    });
    const blob = pageData(html);
    assert.ok(!blob.includes("<"));
    assert.ok(!html.includes("<script>alert(1)</script>"));
  });
});

describe("map thumbnail", () => {
  const scoredHours = day(TODAY, [13, 13, 13]);

  test("renders four PDOK tile imgs with inline mosaic offsets", () => {
    const html = renderConditionsPage({ ...baseArgs, scoredHours });
    const matches = [...html.matchAll(/<img alt src="(https:\/\/service\.pdok\.nl\/[^"]+)"\/>/g)];
    assert.equal(matches.length, 4);
    for (const [, src] of matches) {
      assert.ok(src!.startsWith("https://service.pdok.nl/brt/achtergrondkaart/wmts/v2_0/standaard/EPSG:3857/12/"));
    }
    assert.ok(/<span class="tiles" style="left:-?[\d.]+px;top:-?[\d.]+px;?">/.test(html));
  });

  test("is closed by default, opens only for a fresh GPS navigation", () => {
    const closed = renderConditionsPage({ ...baseArgs, scoredHours });
    assert.ok(closed.includes('data-map="false"'));

    const open = renderConditionsPage({ ...baseArgs, scoredHours, mapOpen: true });
    assert.ok(open.includes('data-map="true"'));
  });

  test("escapes an XSS-shaped spot name in the thumbnail's aria-label", () => {
    const html = renderConditionsPage({
      ...baseArgs,
      scoredHours,
      spot: { name: XSS, lat: 52.2, lon: 5.08, gps: false },
    });
    const thumb = html.slice(html.indexOf('id="map-thumb"'));
    const label = /aria-label="([^"]*)"/.exec(thumb);
    assert.ok(label, "map-thumb has an aria-label");
    assert.ok(!label![1]!.includes("<script>"));
    assert.ok(label![1]!.includes("&lt;script>alert(1)&lt;/script>"));
  });
});

describe("map panel", () => {
  test("renders the DOM contract's map card, hint, name and go-link", () => {
    const html = renderConditionsPage({ ...baseArgs, scoredHours: day(TODAY, [13, 13, 13]) });
    assert.ok(html.includes('<div class="map-panel" id="map-panel">'));
    assert.ok(html.includes('<div class="map" id="map">'));
    assert.ok(html.includes('Drag the pin or tap the map to pick the exact spot'));
    assert.ok(html.includes('<a class="map-go" id="map-go" hidden href="#">Use this point</a>'));
  });
});

describe("renderConditionsPage", () => {
  test("renders a doctype and the ribbon contract's markup", () => {
    const html = renderConditionsPage({ ...baseArgs, scoredHours: day(TODAY, [13, 13, 13]) });
    assert.ok(html.startsWith("<!doctype html>"));
    assert.ok(html.includes('<div class="ribbon"'));
    assert.ok(html.includes('data-n="3"'));
  });

  test("the now marker renders on today only", () => {
    const html = renderConditionsPage({
      ...baseArgs,
      scoredHours: [...day(TODAY, [13, 13, 13]), ...day(TOMORROW, [13, 13, 13])],
    });
    assert.equal(html.match(/class="now"/g)?.length, 1);
    assert.ok(html.includes('data-now="1.58"'));
  });

  test("no daylight hours shows the empty state", () => {
    const html = renderConditionsPage({ ...baseArgs, scoredHours: [] });
    assert.ok(html.includes("No forecast data available."));
  });
});

describe("renderAttributionPage", () => {
  test("still renders its trusted links as real anchor tags, not escaped text", () => {
    const html = renderAttributionPage({ locale: "en", currentPath: "/attribution", search: "" });
    assert.ok(html.includes('<a href="https://open-meteo.com/"'));
    assert.ok(!html.includes("&lt;a href"));
  });

  test("carries no page-data blob", () => {
    const html = renderAttributionPage({ locale: "en", currentPath: "/attribution", search: "" });
    assert.ok(!html.includes("page-data"));
  });

  test("has the privacy, about and no-guarantee sections in every locale", () => {
    const expected = {
      en: ["Your location", "What this site stores in your browser", "About this site", "No guarantee"],
      nl: ["Je locatie", "Wat deze site in je browser bewaart", "Over deze site", "Geen garantie"],
      de: ["Dein Standort", "Was diese Seite in deinem Browser speichert", "Über diese Seite", "Keine Garantie"],
    } as const;
    for (const [locale, headings] of Object.entries(expected)) {
      const html = renderAttributionPage({ locale: locale as "en" | "nl" | "de", currentPath: "/attribution", search: "" });
      for (const h of headings) assert.ok(html.includes(`<h2>${h}</h2>`), `${locale}: ${h}`);
      assert.ok(html.includes("<code>sd_spots</code>"), `${locale}: cookie named`);
    }
  });
});

describe("footer disclaimer", () => {
  test("appears on the conditions page and the attribution page", () => {
    const conditions = renderConditionsPage({ ...baseArgs, scoredHours: day(TODAY, [8, 8]) });
    const attribution = renderAttributionPage({ locale: "en", currentPath: "/attribution", search: "" });
    for (const html of [conditions, attribution]) {
      assert.ok(html.includes('<p class="disclaimer">Forecasts, not guarantees. Check conditions on the water yourself.</p>'));
      assert.ok(html.includes(">Data &amp; privacy</a>"));
    }
  });

  test("the saved-spots heading says the list lives in this browser", () => {
    const html = renderConditionsPage({
      ...baseArgs,
      scoredHours: day(TODAY, [8, 8]),
      savedSpots: [{ name: "Zandvoort", lat: 52.37, lon: 4.53 }],
    });
    assert.ok(html.includes('<span class="saved-hint">Saved in this browser only.</span>'));
  });
});
