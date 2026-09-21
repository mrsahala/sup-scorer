import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { searchLocation, reverseGeocode } from "./geocode";
import { mockFetch, type MockRoute } from "../testSupport";

const isPhoton = (url: string) => url.startsWith("https://photon.komoot.io/api/");
const isPhotonReverse = (url: string) => url.startsWith("https://photon.komoot.io/reverse");
const isOpenMeteo = (url: string) => url.startsWith("https://geocoding-api.open-meteo.com/");

// Real Photon shapes (September 2026): a Dutch town, a Dutch lake, a German town.
const PHOTON_FEATURES = [
  {
    geometry: { coordinates: [5.0905629, 52.2025993] },
    properties: { osm_key: "boundary", osm_value: "administrative", type: "city", name: "Loosdrecht", state: "North Holland", country: "Netherlands", countrycode: "NL" },
  },
  {
    geometry: { coordinates: [5.0484918, 52.1865761] },
    properties: { osm_key: "water", osm_value: "lake", type: "other", name: "Loosdrechtse Plassen", city: "Loosdrecht", state: "North Holland", country: "Netherlands", countrycode: "NL" },
  },
  {
    geometry: { coordinates: [11.76, 47.71] },
    properties: { osm_key: "place", osm_value: "town", type: "city", name: "Tegernsee", county: "Landkreis Miesbach", state: "Bavaria", country: "Germany", countrycode: "DE" },
  },
];

const photonOk = (): MockRoute => ({ match: isPhoton, respond: () => ({ status: 200, json: { features: PHOTON_FEATURES } }) });
const photonDown = (status = 429): MockRoute => ({ match: isPhoton, respond: () => ({ status, text: "slow down" }) });
const openMeteoOk = (): MockRoute => ({
  match: isOpenMeteo,
  respond: () => ({
    status: 200,
    json: { results: [{ name: "Loosdrecht", admin1: "Noord-Holland", admin2: "Wijdemeren", country: "Nederland", country_code: "NL", latitude: 52.21718, longitude: 5.06899 }] },
  }),
});

describe("searchLocation via Photon", () => {
  test("maps features to display names, kinds and coordinates, appending only foreign countries", async (t) => {
    mockFetch(t, [photonOk()]);
    const r = await searchLocation("loos", { locale: "en", viewerCountry: "NL" });
    assert.deepEqual(
      r.map((x) => [x.name, x.kind, x.type, x.country]),
      [
        ["Loosdrecht, North Holland", "city", "city", "NL"],
        ["Loosdrechtse Plassen, Loosdrecht", "lake", "lake", "NL"],
        ["Tegernsee, Bavaria, Germany", "town", "town", "DE"],
      ]
    );
    assert.equal(r[0]!.lat, 52.2025993);
    assert.equal(r[0]!.lon, 5.0905629);
  });

  test("with no viewer country every result carries its country", async (t) => {
    mockFetch(t, [photonOk()]);
    const r = await searchLocation("loos", { locale: "en" });
    assert.equal(r[0]!.name, "Loosdrecht, North Holland, Netherlands");
  });

  test("asks Photon for en/de names and no lang for nl, with limit and an identifying User-Agent", async (t) => {
    const calls = mockFetch(t, [photonOk()]);
    await searchLocation("x", { locale: "de", limit: 3 });
    await searchLocation("x", { locale: "nl" });
    const de = new URL(calls[0]!.url);
    assert.equal(de.searchParams.get("lang"), "de");
    assert.equal(de.searchParams.get("limit"), "3");
    assert.equal(new URL(calls[1]!.url).searchParams.get("lang"), null);
    assert.match(String((calls[0]!.init.headers as Record<string, string>)["User-Agent"]), /supdawg/);
  });

  test("kind labels are localized", async (t) => {
    mockFetch(t, [photonOk()]);
    const r = await searchLocation("loos", { locale: "nl", viewerCountry: "NL" });
    assert.equal(r[1]!.type, "meer");
    assert.equal(r[2]!.name, "Tegernsee, Bavaria, Duitsland");
  });

  test("collapses rows that would read identically (same name and label)", async (t) => {
    const seg = (lon: number) => ({
      geometry: { coordinates: [lon, 52.31] },
      properties: { osm_key: "highway", osm_value: "residential", name: "Loosdrechtdreef", city: "Amsterdam", countrycode: "NL" },
    });
    mockFetch(t, [{ match: isPhoton, respond: () => ({ status: 200, json: { features: [seg(4.993), seg(4.995)] } }) }]);
    const r = await searchLocation("loosdrechtdreef", { locale: "en", viewerCountry: "NL" });
    assert.deepEqual(r.map((x) => [x.name, x.lon]), [["Loosdrechtdreef, Amsterdam", 4.993]]);
  });

  test("skips features without a name or coordinates", async (t) => {
    mockFetch(t, [
      { match: isPhoton, respond: () => ({ status: 200, json: { features: [{ properties: { city: "X" } }, { geometry: {}, properties: { name: "Y" } }] } }) },
    ]);
    assert.deepEqual(await searchLocation("x"), []);
  });
});

describe("searchLocation fallback", () => {
  test("a throttled Photon falls back to Open-Meteo's geocoder", async (t) => {
    const calls = mockFetch(t, [photonDown(429), openMeteoOk()]);
    const r = await searchLocation("loos", { locale: "nl", viewerCountry: "NL" });
    assert.deepEqual(r.map((x) => [x.name, x.kind, x.type]), [["Loosdrecht, Noord-Holland", "", ""]]);
    assert.equal(r[0]!.lat, 52.21718);
    const om = new URL(calls[1]!.url);
    assert.equal(om.searchParams.get("name"), "loos");
    assert.equal(om.searchParams.get("language"), "nl");
  });

  test("throws only when both providers fail", async (t) => {
    mockFetch(t, [photonDown(503), { match: isOpenMeteo, respond: () => ({ status: 500, text: "boom" }) }]);
    await assert.rejects(searchLocation("x"), /geocode failed/);
  });
});

describe("reverseGeocode", () => {
  test("a named feature (a lake) is the name, plus the town when it differs", async (t) => {
    mockFetch(t, [
      {
        match: isPhotonReverse,
        respond: () => ({ status: 200, json: { features: [{ properties: { osm_key: "water", osm_value: "lake", name: "Tegernsee", city: "Tegernsee", state: "Bavaria", countrycode: "DE", country: "Germany" } }] } }),
      },
    ]);
    assert.equal(await reverseGeocode(47.72, 11.74, { locale: "en", viewerCountry: "NL" }), "Tegernsee, Germany");
    assert.equal(await reverseGeocode(47.72, 11.74, { locale: "de", viewerCountry: "DE" }), "Tegernsee");
  });

  test("an unnamed house falls back to the neighbourhood, then the town", async (t) => {
    mockFetch(t, [
      {
        match: isPhotonReverse,
        respond: () => ({ status: 200, json: { features: [{ properties: { osm_value: "house", street: "Nieuw-Loosdrechtsedijk", district: "Oud-Loosdrecht", city: "Loosdrecht", countrycode: "NL" } }] } }),
      },
    ]);
    assert.equal(await reverseGeocode(52.195, 5.105, { locale: "en", viewerCountry: "NL" }), "Oud-Loosdrecht, Loosdrecht");
  });

  test("passes lat/lon and the language", async (t) => {
    const calls = mockFetch(t, [{ match: isPhotonReverse, respond: () => ({ status: 200, json: { features: [] } }) }]);
    await reverseGeocode(52.2, 5.08, { locale: "en" });
    const url = new URL(calls[0]!.url);
    assert.equal(url.searchParams.get("lat"), "52.2");
    assert.equal(url.searchParams.get("lon"), "5.08");
    assert.equal(url.searchParams.get("lang"), "en");
  });

  test("returns null (not a throw) on no features, a non-ok response, or a failed request", async (t) => {
    mockFetch(t, [{ match: isPhotonReverse, respond: () => ({ status: 200, json: { features: [] } }) }]);
    assert.equal(await reverseGeocode(0, 0), null);
    mockFetch(t, [{ match: isPhotonReverse, respond: () => ({ status: 502, text: "bad" }) }]);
    assert.equal(await reverseGeocode(0, 0), null);
    t.mock.method(globalThis, "fetch", async () => {
      throw new Error("network down");
    });
    assert.equal(await reverseGeocode(0, 0), null);
  });
});
