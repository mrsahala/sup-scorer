// Integration tests for the Worker's fetch() entrypoint - route dispatch,
// spot resolution order, the sd_last cookie round-trip, and /api/glance.
// scoring.test.ts/windows.test.ts own the scoring/windows math itself.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { mockFetch, openMeteoRoute } from "../testSupport";
import { LOCATION } from "./config";
import worker from "./index";

const ctx = { waitUntil() {}, passThroughOnException() {} } as unknown as ExecutionContext;
const env = { ASSETS: { fetch: async () => new Response("not an app route") } } as unknown as Parameters<
  typeof worker.fetch
>[1];

function req(url: string, { cookie, cf }: { cookie?: string; cf?: Record<string, unknown> } = {}): Request {
  const init: RequestInit = {};
  if (cookie) init.headers = { Cookie: cookie };
  const request = new Request(url, init);
  if (cf) Object.defineProperty(request, "cf", { value: cf });
  return request;
}

function sdLastCookie(value: { name: string; lat: number; lon: number; gps: boolean }): string {
  return `sd_last=${encodeURIComponent(JSON.stringify(value))}`;
}

describe("/{locale}/ spot resolution order", () => {
  test("sd_last cookie wins over IP and default", async (t) => {
    const calls = mockFetch(t, [openMeteoRoute()]);
    const cookie = sdLastCookie({ name: "Loosdrecht", lat: 52.2, lon: 5.08, gps: false });

    const res = await worker.fetch(
      req("https://supdawg.nl/en/", { cookie, cf: { latitude: "10", longitude: "10" } }),
      env,
      ctx
    );
    const body = await res.text();

    assert.equal(res.status, 200);
    assert.ok(body.includes("Loosdrecht"));
    const url = new URL(calls[0]!.url);
    assert.equal(url.searchParams.get("latitude"), "52.2");
    assert.equal(url.searchParams.get("longitude"), "5.08");
  });

  test("falls back to the IP guess (request.cf) when there's no cookie", async (t) => {
    const calls = mockFetch(t, [openMeteoRoute()]);

    const res = await worker.fetch(
      req("https://supdawg.nl/en/", { cf: { latitude: "52.1", longitude: "4.9", city: "Utrecht" } }),
      env,
      ctx
    );
    const body = await res.text();

    assert.equal(res.status, 200);
    assert.ok(body.includes("Utrecht"));
    const url = new URL(calls[0]!.url);
    assert.equal(url.searchParams.get("latitude"), "52.1");
    assert.equal(url.searchParams.get("longitude"), "4.9");
  });

  test("falls back to LOCATION/DEFAULT_SPOT_NAME with no cookie and no IP guess", async (t) => {
    const calls = mockFetch(t, [openMeteoRoute()]);

    const res = await worker.fetch(req("https://supdawg.nl/en/"), env, ctx);
    const body = await res.text();

    assert.equal(res.status, 200);
    assert.ok(body.includes("Amsterdamse Bos"));
    const url = new URL(calls[0]!.url);
    // LOCATION rounded to 3 decimals, same helper weather.ts uses.
    assert.equal(url.searchParams.get("latitude"), String(Math.round(LOCATION.lat * 1000) / 1000));
    assert.equal(url.searchParams.get("longitude"), String(Math.round(LOCATION.lon * 1000) / 1000));
  });
});

// A visitor who has starred a spot: the only case in which sd_last is set.
const SAVED = `sd_spots=${encodeURIComponent(JSON.stringify([{ name: "Zandvoort", lat: 52.37, lon: 4.53 }]))}`;

describe("/{locale}/conditions - sd_last cookie round-trip", () => {
  test("no sd_last without a saved spot", async (t) => {
    mockFetch(t, [openMeteoRoute()]);

    const res = await worker.fetch(
      req("https://supdawg.nl/en/conditions?lat=52.2&lon=5.08&name=Loosdrecht"),
      env,
      ctx
    );
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("Set-Cookie"), null);
  });

  test("sets sd_last for a visitor with a saved spot, for 90 days", async (t) => {
    mockFetch(t, [openMeteoRoute()]);

    const res = await worker.fetch(
      req("https://supdawg.nl/en/conditions?lat=52.2&lon=5.08&name=Loosdrecht", { cookie: SAVED }),
      env,
      ctx
    );
    const setCookie = res.headers.get("Set-Cookie");

    assert.ok(setCookie);
    assert.match(setCookie!, /^sd_last=/);
    assert.match(setCookie!, /Max-Age=7776000/);
    assert.match(setCookie!, /Secure/);

    const raw = decodeURIComponent(setCookie!.split(";")[0]!.slice("sd_last=".length));
    assert.deepEqual(JSON.parse(raw), { name: "Loosdrecht", lat: 52.2, lon: 5.08, gps: false });
  });

  test("src=gps marks the cookie's gps flag true", async (t) => {
    mockFetch(t, [openMeteoRoute()]);

    const res = await worker.fetch(
      req("https://supdawg.nl/en/conditions?lat=52.2&lon=5.08&name=X&src=gps", { cookie: SAVED }),
      env,
      ctx
    );
    const raw = decodeURIComponent(res.headers.get("Set-Cookie")!.split(";")[0]!.slice("sd_last=".length));
    assert.equal(JSON.parse(raw).gps, true);
  });

  test("omits Secure on localhost", async (t) => {
    mockFetch(t, [openMeteoRoute()]);

    const res = await worker.fetch(
      req("http://localhost:8787/en/conditions?lat=52.2&lon=5.08&name=X", { cookie: SAVED }),
      env,
      ctx
    );
    assert.doesNotMatch(res.headers.get("Set-Cookie")!, /Secure/);
  });

  test("a round-tripped sd_last cookie resolves '/{locale}/' back to the same spot", async (t) => {
    mockFetch(t, [openMeteoRoute()]);
    const first = await worker.fetch(
      req("https://supdawg.nl/en/conditions?lat=52.2&lon=5.08&name=Loosdrecht", { cookie: SAVED }),
      env,
      ctx
    );
    const cookie = first.headers.get("Set-Cookie")!.split(";")[0]!;

    // A different IP guess is present but must lose to the cookie.
    const second = await worker.fetch(
      req("https://supdawg.nl/en/", { cookie, cf: { latitude: "10", longitude: "10" } }),
      env,
      ctx
    );
    assert.ok((await second.text()).includes("Loosdrecht"));
  });

  test("non-numeric lat/lon is a 400, no cookie set", async (t) => {
    const res = await worker.fetch(req("https://supdawg.nl/en/conditions?lat=abc&lon=abc"), env, ctx);
    assert.equal(res.status, 400);
    assert.equal(res.headers.get("Set-Cookie"), null);
  });
});

describe("/api/glance", () => {
  test("a fixture with a qualifying window (not all day) returns its tier and range", async (t) => {
    // Daylight 06:00-12:00 (7 hours modeled); only 08-10 qualifies (great),
    // the rest is avoid-tier wind - so allDay is false and the window is
    // the "HH–HH" case, matching the plan's "Today 08–11" example.
    const hours = ["06", "07", "08", "09", "10", "11", "12"];
    const wind = [30, 30, 8, 8, 8, 30, 30];
    mockFetch(t, [
      {
        match: (url) => url.includes("api.open-meteo.com"),
        respond: () => ({
          status: 200,
          json: {
            hourly: {
              time: hours.map((h) => `2026-08-27T${h}:00`),
              temperature_2m: hours.map(() => 18),
              windspeed_10m: wind,
              windgusts_10m: wind,
              winddirection_10m: hours.map(() => 200),
              weathercode: hours.map(() => 0),
            },
            daily: { time: ["2026-08-27"], sunrise: ["2026-08-27T06:00"], sunset: ["2026-08-27T20:00"] },
          },
        }),
      },
    ]);

    const res = await worker.fetch(req("https://supdawg.nl/api/glance?lat=52.2&lon=5.08&lang=en"), env, ctx);
    const body = (await res.json()) as { tier: string | null; text: string };

    assert.equal(res.status, 200);
    assert.equal(body.tier, "great");
    assert.equal(body.text, "Today 08–11");
  });

  test("a fixture with no qualifying window returns tier null and 'no window'", async (t) => {
    mockFetch(t, [
      {
        match: (url) => url.includes("api.open-meteo.com"),
        respond: () => ({
          status: 200,
          json: {
            hourly: {
              time: ["2026-08-27T06:00", "2026-08-27T07:00"],
              temperature_2m: [18, 18],
              windspeed_10m: [30, 30],
              windgusts_10m: [30, 30],
              winddirection_10m: [200, 200],
              weathercode: [0, 0],
            },
            daily: { time: ["2026-08-27"], sunrise: ["2026-08-27T06:00"], sunset: ["2026-08-27T20:00"] },
          },
        }),
      },
    ]);

    const res = await worker.fetch(req("https://supdawg.nl/api/glance?lat=52.2&lon=5.08&lang=en"), env, ctx);
    const body = (await res.json()) as { tier: string | null; text: string };

    assert.equal(body.tier, null);
    assert.equal(body.text, "no window");
  });

  test("rounds lat/lon to 3 decimals before hitting Open-Meteo", async (t) => {
    const calls = mockFetch(t, [openMeteoRoute()]);

    await worker.fetch(req("https://supdawg.nl/api/glance?lat=52.347890675735485&lon=4.889856145643074"), env, ctx);

    const url = new URL(calls[0]!.url);
    assert.equal(url.searchParams.get("latitude"), "52.348");
    assert.equal(url.searchParams.get("longitude"), "4.89");
  });

  test("invalid lat/lon is a 400", async (t) => {
    const res = await worker.fetch(req("https://supdawg.nl/api/glance?lat=x&lon=y"), env, ctx);
    assert.equal(res.status, 400);
  });

  test("an unknown lang falls back to the default locale", async (t) => {
    mockFetch(t, [openMeteoRoute()]);
    const res = await worker.fetch(req("https://supdawg.nl/api/glance?lat=52.2&lon=5.08&lang=xx"), env, ctx);
    assert.equal(res.status, 200);
  });
});
