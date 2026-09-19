// Mainly verifies the safety property that motivated switching to JSX:
// dynamic values (location names, search queries, PDOK results) get
// auto-escaped, with no manual escapeHtml() call required at each call
// site. Also covers the one deliberate exception (dangerouslySetInnerHTML
// on the attribution page) still doing what it's supposed to.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { renderSpotPage, renderLandingPage, renderSearchPage, renderAttributionPage } from "./render";
import type { ScoredHour } from "./scoring";

const XSS = '<script>alert(1)</script>';

const baseArgs = { locale: "en" as const, currentPath: "/", search: "" };

// Checks for "&lt;script>", not "&lt;script&gt;" - Preact (like React) only
// entity-escapes "<", "&", and quotes, not ">". A lone ">" in text content
// can't open a tag, so leaving it literal is safe and standard - the check
// here is specifically that "<" never survives unescaped.
describe("XSS-shaped input is escaped, not executed", () => {
  test("a spot's location name", () => {
    const html = renderSpotPage({ ...baseArgs, locationName: XSS, scoredHours: [] });
    assert.ok(!html.includes("<script>alert(1)</script>"));
    assert.ok(html.includes("&lt;script>"));
  });

  test("a curated spot's name on the landing page", () => {
    const html = renderLandingPage({ ...baseArgs, spots: [{ slug: "x", name: XSS, lat: 0, lon: 0 }] });
    assert.ok(!html.includes("<script>alert(1)</script>"));
    assert.ok(html.includes("&lt;script>"));
  });

  test("a search query", () => {
    const html = renderSearchPage({ ...baseArgs, query: XSS, results: [] });
    assert.ok(!html.includes("<script>alert(1)</script>"));
    assert.ok(html.includes("&lt;script>"));
  });

  test("a PDOK search result's name", () => {
    const html = renderSearchPage({
      ...baseArgs,
      query: "irrelevant",
      results: [{ name: XSS, type: "woonplaats", lat: 52, lon: 5 }],
    });
    assert.ok(!html.includes("<script>alert(1)</script>"));
    assert.ok(html.includes("&lt;script>"));
  });
});

describe("renderSpotPage", () => {
  const hour: ScoredHour = {
    time: "2026-08-27T10:00",
    date: "2026-08-27",
    hour: "10:00",
    tempC: 18,
    windKmh: 10,
    gustKmh: 15,
    windDirDeg: 225,
    weatherCode: 0,
    isDaylight: true,
    qualifies: true,
    tier: "great",
    baseTier: "great",
    warm: true,
    gustDowngraded: false,
    gustDelta: 5,
    gustRatio: 1.5,
  };

  test("renders a doctype and the hour's tier label", () => {
    const html = renderSpotPage({ ...baseArgs, locationName: "Amsterdam", scoredHours: [hour] });
    assert.ok(html.startsWith("<!doctype html>"));
    assert.ok(html.includes("Great"));
    assert.ok(html.includes("10:00"));
  });

  test("a non-daylight hour is dropped from the grid", () => {
    const html = renderSpotPage({
      ...baseArgs,
      locationName: "Amsterdam",
      scoredHours: [{ ...hour, isDaylight: false }],
    });
    assert.ok(!html.includes("10:00"));
  });

  test("no qualifying hours shows the empty state", () => {
    const html = renderSpotPage({ ...baseArgs, locationName: "Amsterdam", scoredHours: [] });
    assert.ok(html.includes("No forecast data available."));
  });
});

describe("renderAttributionPage", () => {
  test("still renders its trusted links as real anchor tags, not escaped text", () => {
    const html = renderAttributionPage(baseArgs);
    assert.ok(html.includes('<a href="https://open-meteo.com/"'));
    assert.ok(!html.includes("&lt;a href"));
  });
});

describe("renderLandingPage - use my location button", () => {
  test("carries the locale and translated strings as data attributes, per locale", () => {
    const en = renderLandingPage({ ...baseArgs, spots: [] });
    assert.ok(en.includes('id="use-location"'));
    assert.ok(en.includes('data-locale="en"'));
    assert.ok(en.includes("Use my location"));

    const nl = renderLandingPage({ locale: "nl", currentPath: "/", search: "", spots: [] });
    assert.ok(nl.includes('data-locale="nl"'));
    assert.ok(nl.includes("Gebruik mijn locatie"));
  });

  test("the geolocation script is present and untouched by escaping", () => {
    const html = renderLandingPage({ ...baseArgs, spots: [] });
    assert.ok(html.includes("navigator.geolocation"));
    assert.ok(html.includes("getCurrentPosition"));
  });
});
