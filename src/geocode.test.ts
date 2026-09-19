import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { mockFetch } from "../testSupport";
import { searchLocation, reverseGeocode } from "./geocode";

describe("searchLocation", () => {
  test("parses centroide_ll's WKT point into lat/lon", async (t) => {
    mockFetch(t, [
      {
        match: (url) => url.includes("locatieserver/search/v3_1/free"),
        respond: () => ({
          status: 200,
          json: {
            response: {
              docs: [{ weergavenaam: "Utrecht", type: "woonplaats", centroide_ll: "POINT(5.1214 52.0907)" }],
            },
          },
        }),
      },
    ]);

    const results = await searchLocation("Utrecht");
    assert.deepEqual(results, [{ name: "Utrecht", type: "woonplaats", lon: 5.1214, lat: 52.0907 }]);
  });

  test("excludes gemeente and provincie via fq - broad regions that otherwise outrank the actual place", async (t) => {
    const calls = mockFetch(t, [
      {
        match: (url) => url.includes("locatieserver/search/v3_1/free"),
        respond: () => ({ status: 200, json: { response: { docs: [] } } }),
      },
    ]);

    await searchLocation("Amsterdam");
    const url = new URL(calls[0]!.url);
    assert.deepEqual(url.searchParams.getAll("fq"), ["-type:gemeente", "-type:provincie"]);
  });

  test("appends a wildcard so a partial word like 'amster' still matches", async (t) => {
    const calls = mockFetch(t, [
      { match: (url) => url.includes("locatieserver/search/v3_1/free"), respond: () => ({ status: 200, json: { response: { docs: [] } } }) },
    ]);
    await searchLocation("amster");
    const url = new URL(calls[0]!.url);
    assert.equal(url.searchParams.get("q"), "amster*");
  });

  test("does not double up a wildcard the caller already supplied", async (t) => {
    const calls = mockFetch(t, [
      { match: (url) => url.includes("locatieserver/search/v3_1/free"), respond: () => ({ status: 200, json: { response: { docs: [] } } }) },
    ]);
    await searchLocation("amster*");
    const url = new URL(calls[0]!.url);
    assert.equal(url.searchParams.get("q"), "amster*");
  });

  test("skips a doc with no parseable centroide_ll", async (t) => {
    mockFetch(t, [
      {
        match: (url) => url.includes("locatieserver/search/v3_1/free"),
        respond: () => ({
          status: 200,
          json: { response: { docs: [{ weergavenaam: "Nowhere", type: "woonplaats" }] } },
        }),
      },
    ]);

    assert.deepEqual(await searchLocation("Nowhere"), []);
  });

  test("throws with status and body text when the request fails", async (t) => {
    mockFetch(t, [
      {
        match: (url) => url.includes("locatieserver/search/v3_1/free"),
        respond: () => ({ status: 500, text: "server exploded" }),
      },
    ]);

    await assert.rejects(() => searchLocation("Utrecht"), /PDOK geocode failed: 500/);
  });
});

describe("reverseGeocode", () => {
  test("uses the buurt (neighborhood) result when one's found", async (t) => {
    const calls = mockFetch(t, [
      {
        match: (url) => url.includes("locatieserver/search/v3_1/reverse"),
        respond: () => ({ status: 200, json: { response: { docs: [{ weergavenaam: "Diamantbuurt Amsterdam" }] } } }),
      },
    ]);

    assert.equal(await reverseGeocode(52.35, 4.9075), "Diamantbuurt Amsterdam");
    assert.equal(calls.length, 1, "should not fall back to woonplaats when buurt already matched");
    const url = new URL(calls[0]!.url);
    assert.equal(url.searchParams.get("type"), "buurt");
    assert.equal(url.searchParams.get("lat"), "52.35");
    assert.equal(url.searchParams.get("lon"), "4.9075");
  });

  test("keeps only the first comma segment of weergavenaam (woonplaats' repeated-name format)", async (t) => {
    mockFetch(t, [
      {
        match: (url) => url.includes("type=buurt"),
        respond: () => ({ status: 200, json: { response: { docs: [] } } }),
      },
      {
        match: (url) => url.includes("type=woonplaats"),
        respond: () => ({
          status: 200,
          json: { response: { docs: [{ weergavenaam: "Zandvoort, Zandvoort, Noord-Holland" }] } },
        }),
      },
    ]);

    assert.equal(await reverseGeocode(52.373, 4.533), "Zandvoort");
  });

  test("falls back to woonplaats when buurt has no match", async (t) => {
    const calls = mockFetch(t, [
      {
        match: (url) => url.includes("type=buurt"),
        respond: () => ({ status: 200, json: { response: { docs: [] } } }),
      },
      {
        match: (url) => url.includes("type=woonplaats"),
        respond: () => ({ status: 200, json: { response: { docs: [{ weergavenaam: "Utrecht" }] } } }),
      },
    ]);

    assert.equal(await reverseGeocode(52.09, 5.12), "Utrecht");
    assert.equal(calls.length, 2);
  });

  test("returns null (not a throw) when neither tier has a matching doc", async (t) => {
    mockFetch(t, [
      {
        match: (url) => url.includes("locatieserver/search/v3_1/reverse"),
        respond: () => ({ status: 200, json: { response: { docs: [] } } }),
      },
    ]);

    assert.equal(await reverseGeocode(0, 0), null);
  });

  test("returns null (not a throw) on a non-ok response", async (t) => {
    mockFetch(t, [
      {
        match: (url) => url.includes("locatieserver/search/v3_1/reverse"),
        respond: () => ({ status: 500, text: "server exploded" }),
      },
    ]);

    assert.equal(await reverseGeocode(52.09, 5.12), null);
  });

  test("returns null (not a throw) when the request itself fails", async (t) => {
    t.mock.method(globalThis, "fetch", async () => {
      throw new Error("network down");
    });

    assert.equal(await reverseGeocode(52.09, 5.12), null);
  });
});
