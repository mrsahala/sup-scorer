// Shared test-only helpers. Deliberately NOT named *.test.ts / test-*.ts
// and not under a directory named test/ or tests/ - those are exactly the
// patterns node --test auto-discovers, and this file has no tests to run.
import type { TestContext } from "node:test";

// One recorded call to the mocked fetch, for tests that assert on what a
// function under test actually requested (e.g. checking the built URL's
// query params).
export interface MockCall {
  url: string;
  init: RequestInit;
}

// What a MockRoute's respond() returns for a JSON body (json gets
// JSON.stringify'd, with a matching content-type header).
interface MockRespondJson {
  status?: number;
  json: unknown;
}
// What a MockRoute's respond() returns for a plain-text/empty body.
interface MockRespondText {
  status?: number;
  text?: string;
}

// One entry of mockFetch's routing table: match() decides whether this
// route handles a given call, respond() builds the (status, body) to
// return when it does.
export interface MockRoute {
  match: (url: string, init?: RequestInit) => boolean;
  respond: (url: string, init?: RequestInit) => MockRespondJson | MockRespondText;
}

// Installs a routed fetch mock for the duration of one test (auto-restored
// by node:test's per-test mock tracker on t.mock). `routes` is tried in
// order per call; the first whose `match(url, init)` returns true handles
// the request. `respond` returns { status, json } or { status, text }.
export function mockFetch(t: TestContext, routes: MockRoute[]): MockCall[] {
  const calls: MockCall[] = [];
  t.mock.method(globalThis, "fetch", async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = typeof input === "string" ? input : input.toString();
    calls.push({ url, init });
    const route = routes.find((r) => r.match(url, init));
    if (!route) {
      throw new Error(`mockFetch: no route matched ${init.method || "GET"} ${url}`);
    }
    const result = route.respond(url, init);
    const status = result.status ?? 200;
    if ("json" in result) {
      return new Response(JSON.stringify(result.json), {
        status,
        headers: { "content-type": "application/json" },
      });
    }
    return new Response(result.text ?? "", { status });
  });
  return calls;
}

// A small, deterministic Open-Meteo-shaped fixture: one day, 3 consecutive
// daylight hours, identical mild conditions (all "great" if scored) - just
// enough for index tests that need *a* forecast to flow through, without
// re-testing scoring edge cases (that's scoring.test.ts's job).
export function openMeteoFixture() {
  return {
    hourly: {
      time: ["2026-08-27T09:00", "2026-08-27T10:00", "2026-08-27T11:00"],
      temperature_2m: [16, 16, 16],
      windspeed_10m: [8, 8, 8],
      windgusts_10m: [12, 12, 12],
      winddirection_10m: [220, 220, 220],
      weathercode: [0, 0, 0],
    },
    daily: {
      time: ["2026-08-27"],
      sunrise: ["2026-08-27T06:00"],
      sunset: ["2026-08-27T20:00"],
    },
  };
}

// A ready-to-use mockFetch route serving openMeteoFixture().
export function openMeteoRoute(): MockRoute {
  return {
    match: (url) => url.includes("api.open-meteo.com"),
    respond: () => ({ status: 200, json: openMeteoFixture() }),
  };
}

// Open-Meteo-shaped fixture for windows.ts: three days, daylight 06:00-20:00
// (15 hours each), each day's windKmh chosen to produce a specific window
// shape - day 1 a 3h window then a 1h window, day 2 all-day, day 3 none.
export function threeDayWindowsFixture() {
  const days: [string, number[]][] = [
    ["2026-08-27", [8, 8, 9, 22, 12, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30]],
    ["2026-08-28", Array(15).fill(8)],
    ["2026-08-29", Array(15).fill(30)],
  ];
  const time: string[] = [];
  const temperature_2m: number[] = [];
  const windspeed_10m: number[] = [];
  const windgusts_10m: number[] = [];
  const winddirection_10m: number[] = [];
  const weathercode: number[] = [];
  for (const [date, winds] of days) {
    winds.forEach((wind, i) => {
      const hh = String(6 + i).padStart(2, "0");
      time.push(`${date}T${hh}:00`);
      temperature_2m.push(18);
      windspeed_10m.push(wind);
      windgusts_10m.push(wind); // equal to wind - no gust downgrade in this fixture
      winddirection_10m.push(200);
      weathercode.push(0);
    });
  }
  return {
    hourly: { time, temperature_2m, windspeed_10m, windgusts_10m, winddirection_10m, weathercode },
    daily: {
      time: days.map(([date]) => date),
      sunrise: days.map(([date]) => `${date}T06:00`),
      sunset: days.map(([date]) => `${date}T20:00`),
    },
  };
}

// A ready-to-use mockFetch route serving threeDayWindowsFixture().
export function threeDayWindowsRoute(): MockRoute {
  return {
    match: (url) => url.includes("api.open-meteo.com"),
    respond: () => ({ status: 200, json: threeDayWindowsFixture() }),
  };
}
