import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { countryName, displayName, reverseName } from "./placename";

describe("countryName", () => {
  test("localizes a country code per UI locale, falling back to the geocoder's string", () => {
    assert.equal(countryName("en", "DE"), "Germany");
    assert.equal(countryName("nl", "DE"), "Duitsland");
    assert.equal(countryName("de", "NL"), "Niederlande");
    assert.equal(countryName("en", "XX", "Nowhere"), "Nowhere");
  });
});

describe("displayName", () => {
  const town = { name: "Loosdrecht", state: "North Holland", countryCode: "NL" };
  const lake = { name: "Loosdrechtse Plassen", city: "Loosdrecht", state: "North Holland", countryCode: "NL" };
  const german = { name: "Tegernsee", county: "Landkreis Miesbach", state: "Bayern", countryCode: "DE", countryName: "Deutschland" };

  test("place plus one region; the country only when it isn't the visitor's", () => {
    assert.equal(displayName(town, { locale: "en", viewerCountry: "NL" }), "Loosdrecht, North Holland");
    assert.equal(displayName(town, { locale: "en", viewerCountry: "DE" }), "Loosdrecht, North Holland, Netherlands");
    assert.equal(displayName(german, { locale: "nl", viewerCountry: "NL" }), "Tegernsee, Bayern, Duitsland");
    assert.equal(displayName(german, { locale: "de", viewerCountry: "DE" }), "Tegernsee, Bayern");
  });

  test("prefers the city over the state, and skips a region equal to the name", () => {
    assert.equal(displayName(lake, { locale: "en", viewerCountry: "NL" }), "Loosdrechtse Plassen, Loosdrecht");
    const station = { name: "Tegernsee", city: "Tegernsee", state: "Bayern", countryCode: "DE" };
    assert.equal(displayName(station, { locale: "en", viewerCountry: "DE" }), "Tegernsee, Bayern");
  });

  test("no viewer country appends every country; no name yields null", () => {
    assert.equal(displayName(town, { locale: "en" }), "Loosdrecht, North Holland, Netherlands");
    assert.equal(displayName({ city: "X" }, { locale: "en" }), null);
  });
});

describe("reverseName", () => {
  test("a named feature, then the town when it adds something", () => {
    assert.equal(reverseName({ name: "Tegernsee", city: "Tegernsee", countryCode: "DE" }, { locale: "en", viewerCountry: "DE" }), "Tegernsee");
    assert.equal(reverseName({ name: "Vondelpark", city: "Amsterdam", countryCode: "NL" }, { locale: "en", viewerCountry: "NL" }), "Vondelpark, Amsterdam");
  });

  test("an unnamed feature uses district, then city, then state", () => {
    assert.equal(reverseName({ district: "Oud-Loosdrecht", city: "Loosdrecht", countryCode: "NL" }, { locale: "en", viewerCountry: "NL" }), "Oud-Loosdrecht, Loosdrecht");
    assert.equal(reverseName({ city: "Utrecht", countryCode: "NL" }, { locale: "en", viewerCountry: "NL" }), "Utrecht");
    assert.equal(reverseName({ state: "Bayern", countryCode: "DE" }, { locale: "en", viewerCountry: "NL" }), "Bayern, Germany");
    assert.equal(reverseName({ countryCode: "DE" }, { locale: "en" }), null);
  });
});
