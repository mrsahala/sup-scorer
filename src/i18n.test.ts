import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { t, parseLocalizedPath, localizedUrl, weekdayShort, dayLabel, type Locale } from "./i18n";
import { STRINGS, type StringKey } from "./i18n-strings";

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
    assert.notEqual(t("nl", "searchPlaceholder"), t("en", "searchPlaceholder"));
    assert.notEqual(t("de", "searchPlaceholder"), t("en", "searchPlaceholder"));
  });

  test("an unrecognized locale value falls back to the default locale's strings", () => {
    // Bypasses the Locale type on purpose - exercises the runtime fallback
    // for a value that (in real routing) parseLocalizedPath would already
    // have rejected, as defense in depth.
    assert.equal(t("fr" as Locale, "searchPlaceholder"), t("en", "searchPlaceholder"));
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

describe("STRINGS completeness (every EN key has an NL and DE translation)", () => {
  const enKeys = Object.keys(STRINGS.en) as StringKey[];

  test("nl and de define every EN key with a non-empty value", () => {
    for (const key of enKeys) {
      assert.ok(STRINGS.nl[key].length > 0, `nl is missing or empty for "${key}"`);
      assert.ok(STRINGS.de[key].length > 0, `de is missing or empty for "${key}"`);
    }
  });

  test("nl and de preserve every {placeholder} token from the EN value", () => {
    const placeholders = (s: string) => [...s.matchAll(/\{\w+\}/g)].map((m) => m[0]).sort();
    for (const key of enKeys) {
      const expected = placeholders(STRINGS.en[key]);
      if (expected.length === 0) continue;
      assert.deepEqual(placeholders(STRINGS.nl[key]), expected, `nl "${key}" placeholder mismatch`);
      assert.deepEqual(placeholders(STRINGS.de[key]), expected, `de "${key}" placeholder mismatch`);
    }
  });
});

describe("weekdayShort", () => {
  test("distinct days produce distinct abbreviations", () => {
    const mon = weekdayShort("en", "2026-09-21");
    const tue = weekdayShort("en", "2026-09-22");
    assert.ok(mon.length > 0);
    assert.ok(tue.length > 0);
    assert.notEqual(mon, tue);
  });

  test("nl and de use their own locale, not English", () => {
    assert.notEqual(weekdayShort("nl", "2026-09-21"), weekdayShort("en", "2026-09-21"));
    assert.notEqual(weekdayShort("de", "2026-09-21"), weekdayShort("en", "2026-09-21"));
  });
});

describe("dayLabel", () => {
  test("same date as today is labeled Today", () => {
    assert.equal(dayLabel("en", "2026-09-20", "2026-09-20"), "Today");
  });

  test("the day after today is labeled Tomorrow", () => {
    assert.equal(dayLabel("en", "2026-09-21", "2026-09-20"), "Tomorrow");
  });

  test("any other day falls back to the weekday abbreviation", () => {
    assert.equal(dayLabel("en", "2026-09-25", "2026-09-20"), weekdayShort("en", "2026-09-25"));
  });

  test("around midnight: today is still Today up to the last minute of the day", () => {
    // dayLabel takes plain YYYY-MM-DD strings, not clock times, so there is
    // no local-vs-UTC midnight ambiguity here - this just pins that.
    assert.equal(dayLabel("nl", "2026-09-20", "2026-09-20"), "Vandaag");
    assert.equal(dayLabel("nl", "2026-09-21", "2026-09-20"), "Morgen");
  });

  test("year end: Dec 31 -> Jan 1 is still Tomorrow", () => {
    assert.equal(dayLabel("en", "2027-01-01", "2026-12-31"), "Tomorrow");
    assert.equal(dayLabel("de", "2027-01-01", "2026-12-31"), "Morgen");
  });

  test("year end: a day further out than tomorrow is not mislabeled", () => {
    assert.equal(dayLabel("en", "2027-01-02", "2026-12-31"), weekdayShort("en", "2027-01-02"));
  });
});
