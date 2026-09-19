import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { t, parseLocalizedPath, localizedUrl, type Locale } from "./i18n";

describe("parseLocalizedPath", () => {
  test("bare root has no locale prefix", () => {
    assert.equal(parseLocalizedPath("/"), null);
  });

  test("an unrecognized first segment is not a locale prefix", () => {
    assert.equal(parseLocalizedPath("/spots/nl"), null);
  });

  test("an unknown locale code is not recognized", () => {
    assert.equal(parseLocalizedPath("/fr/spots/x"), null);
  });

  test("a bare locale with nothing after it maps to root", () => {
    assert.deepEqual(parseLocalizedPath("/nl"), { locale: "nl", path: "/" });
  });

  test("a locale with a trailing slash and nothing else maps to root", () => {
    assert.deepEqual(parseLocalizedPath("/nl/"), { locale: "nl", path: "/" });
  });

  test("strips exactly one trailing slash from a deeper path", () => {
    assert.deepEqual(parseLocalizedPath("/nl/spots/scheveningen/"), {
      locale: "nl",
      path: "/spots/scheveningen",
    });
  });

  test("a deeper path with no trailing slash is unchanged", () => {
    assert.deepEqual(parseLocalizedPath("/de/spots/scheveningen"), {
      locale: "de",
      path: "/spots/scheveningen",
    });
  });

  test("the default locale still requires its own prefix (always-prefix scheme)", () => {
    assert.deepEqual(parseLocalizedPath("/en/attribution"), { locale: "en", path: "/attribution" });
  });
});

describe("t", () => {
  test("interpolates {vars} into the string", () => {
    assert.equal(t("en", "subtitleSpot", { location: "Scheveningen" }), "SUP conditions for Scheveningen");
  });

  test("nl and de have their own translation, not the English fallback", () => {
    assert.notEqual(t("nl", "searchButton"), t("en", "searchButton"));
    assert.notEqual(t("de", "searchButton"), t("en", "searchButton"));
  });

  test("an unrecognized locale value falls back to the default locale's strings", () => {
    // Bypasses the Locale type on purpose - exercises the runtime fallback
    // for a value that (in real routing) parseLocalizedPath would already
    // have rejected, as defense in depth.
    assert.equal(t("fr" as Locale, "searchButton"), t("en", "searchButton"));
  });
});

describe("localizedUrl", () => {
  test("root path gets no trailing slash after the locale", () => {
    assert.equal(localizedUrl("de", "/", ""), "/de");
  });

  test("preserves the query string", () => {
    assert.equal(localizedUrl("de", "/search", "?q=Utrecht"), "/de/search?q=Utrecht");
  });

  test("a deeper path with no query string", () => {
    assert.equal(localizedUrl("nl", "/spots/scheveningen", ""), "/nl/spots/scheveningen");
  });
});
