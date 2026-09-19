import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { mockFetch } from "../testSupport";
import { fetchForecast, OpenMeteoError } from "./weather";

function fixture() {
  return {
    hourly: {
      time: [
        "2026-08-27T05:00",
        "2026-08-27T06:00", // exactly at sunrise
        "2026-08-27T12:00", // midday
        "2026-08-27T20:00", // exactly at sunset
        "2026-08-27T21:00", // after sunset
      ],
      temperature_2m: [14, 15, 22, 19, 17],
      windspeed_10m: [5, 6, 12, 9, 7],
      windgusts_10m: [10, 11, 20, 15, 12],
      winddirection_10m: [200, 210, 225, 240, 250],
      weathercode: [3, 1, 0, 61, 2],
    },
    daily: {
      time: ["2026-08-27"],
      sunrise: ["2026-08-27T06:00"],
      sunset: ["2026-08-27T20:00"],
    },
  };
}

describe("fetchForecast", () => {
  test("maps hourly rows and computes daylight from that day's sunrise/sunset", async (t) => {
    const calls = mockFetch(t, [
      { match: (url) => url.includes("api.open-meteo.com"), respond: () => ({ status: 200, json: fixture() }) },
    ]);

    const { hours } = await fetchForecast({ lat: 1, lon: 2, timezone: "Europe/Amsterdam", days: 1 });

    assert.equal(hours.length, 5);
    assert.deepEqual(
      hours.map((h) => h.isDaylight),
      [false, true, true, true, false]
    );
    assert.deepEqual(
      hours.map((h) => h.hour),
      ["05:00", "06:00", "12:00", "20:00", "21:00"]
    );
    assert.equal(hours[2]!.date, "2026-08-27");
    assert.equal(hours[2]!.tempC, 22);
    assert.equal(hours[2]!.windKmh, 12);
    assert.equal(hours[2]!.gustKmh, 20);
    assert.equal(hours[2]!.windDirDeg, 225);
    assert.equal(hours[2]!.weatherCode, 0);

    assert.equal(calls.length, 1);
  });

  test("builds the Open-Meteo URL with the expected query params", async (t) => {
    const calls = mockFetch(t, [
      { match: (url) => url.includes("api.open-meteo.com"), respond: () => ({ status: 200, json: fixture() }) },
    ]);

    await fetchForecast({ lat: 52.1, lon: 4.9, timezone: "Europe/Amsterdam", days: 4 });

    const url = new URL(calls[0]!.url);
    assert.equal(url.searchParams.get("latitude"), "52.1");
    assert.equal(url.searchParams.get("longitude"), "4.9");
    assert.equal(
      url.searchParams.get("hourly"),
      "temperature_2m,windspeed_10m,windgusts_10m,winddirection_10m,weathercode"
    );
    assert.equal(url.searchParams.get("daily"), "sunrise,sunset");
    assert.equal(url.searchParams.get("timezone"), "Europe/Amsterdam");
    assert.equal(url.searchParams.get("forecast_days"), "4");
    assert.equal(url.searchParams.get("wind_speed_unit"), "kmh");
    assert.equal(url.searchParams.get("temperature_unit"), "celsius");
  });

  test("defaults to config.ts's LOCATION/LOOKAHEAD_DAYS when called with no args", async (t) => {
    const calls = mockFetch(t, [
      { match: (url) => url.includes("api.open-meteo.com"), respond: () => ({ status: 200, json: fixture() }) },
    ]);

    await fetchForecast();

    const url = new URL(calls[0]!.url);
    assert.equal(url.searchParams.get("timezone"), "Europe/Amsterdam");
    assert.ok(Number(url.searchParams.get("forecast_days")) > 0);
  });

  test("throws an OpenMeteoError with status/body as real properties, not just in the message", async (t) => {
    mockFetch(t, [
      {
        match: (url) => url.includes("api.open-meteo.com"),
        respond: () => ({ status: 500, text: "server exploded" }),
      },
    ]);

    await assert.rejects(() => fetchForecast(), (err: unknown) => {
      assert.ok(err instanceof OpenMeteoError);
      assert.equal(err.status, 500);
      assert.equal(err.body, "server exploded");
      assert.match(err.message, /Open-Meteo fetch failed: 500/);
      return true;
    });
  });

  test("an hour with no matching daily entry is not daylight", async (t) => {
    const f = fixture();
    f.hourly.time.push("2026-08-28T12:00"); // no daily entry for this date
    f.hourly.temperature_2m.push(20);
    f.hourly.windspeed_10m.push(10);
    f.hourly.windgusts_10m.push(15);
    f.hourly.winddirection_10m.push(180);
    f.hourly.weathercode.push(1);
    mockFetch(t, [{ match: (url) => url.includes("api.open-meteo.com"), respond: () => ({ status: 200, json: f }) }]);

    const { hours } = await fetchForecast();
    const extra = hours.find((h) => h.date === "2026-08-28");
    assert.equal(extra?.isDaylight, false);
  });
});
