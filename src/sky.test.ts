import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { skyKind, skyWord, rainTotal, tempRange } from "./sky";
import { scoreHour, type ScoredHour } from "./scoring";
import type { HourRow } from "./weather";

function hour(extra: Partial<HourRow> = {}): ScoredHour {
  return scoreHour({
    time: "2026-09-20T12:00",
    date: "2026-09-20",
    hour: "12:00",
    hourNum: 12,
    tempC: 18,
    windKmh: 8,
    gustKmh: 8,
    windDirDeg: 225,
    weatherCode: 0,
    cloudPct: 0,
    rainMm: 0,
    rainPct: 0,
    isDaylight: true,
    sunrise: "07:23",
    sunset: "19:40",
    ...extra,
  });
}

describe("skyKind", () => {
  const cases: [string, Partial<HourRow>, string][] = [
    ["0.2 mm is rain", { rainMm: 0.2 }, "rain"],
    ["0.19 mm at low chance is not rain", { rainMm: 0.19, rainPct: 59 }, "sun"],
    ["a trace at 60% is rain", { rainMm: 0.1, rainPct: 60 }, "rain"],
    ["a trace at 59% is not rain", { rainMm: 0.1, rainPct: 59 }, "sun"],
    ["60% with nothing falling is not rain", { rainMm: 0, rainPct: 90 }, "sun"],
    ["75% cloud is cloud", { cloudPct: 75 }, "cloud"],
    ["74% cloud is partly", { cloudPct: 74 }, "partly"],
    ["35% cloud is partly", { cloudPct: 35 }, "partly"],
    ["34% cloud is sun", { cloudPct: 34 }, "sun"],
    ["rain wins over full cloud", { cloudPct: 100, rainMm: 1 }, "rain"],
  ];
  for (const [name, extra, want] of cases) test(name, () => assert.equal(skyKind(hour(extra)), want));
});

describe("rainTotal", () => {
  test("sums daylight hours only and rounds to 0.1", () => {
    const hours = [hour({ rainMm: 0.12 }), hour({ rainMm: 0.2 }), hour({ rainMm: 5, isDaylight: false })];
    assert.equal(rainTotal(hours), 0.3);
  });

  test("an empty day is 0", () => assert.equal(rainTotal([]), 0));
});

describe("skyWord", () => {
  const day = (rain: number[], cloud = 0) => rain.map((rainMm) => hour({ rainMm, cloudPct: cloud }));
  test("3 mm is rainy", () => assert.equal(skyWord(day([1, 1, 1])), "rainy"));
  test("2.9 mm is showers", () => assert.equal(skyWord(day([1, 1, 0.9])), "showers"));
  test("0.5 mm is showers, using the rounded total", () => assert.equal(skyWord(day([0.1, 0.2, 0.2])), "showers"));
  test("0.4 mm falls through to cloud", () => assert.equal(skyWord(day([0.2, 0.2], 10)), "sunny"));
  test("mean cloud 29 is sunny", () => assert.equal(skyWord([hour({ cloudPct: 28 }), hour({ cloudPct: 30 })]), "sunny"));
  test("mean cloud 30 is mixed", () => assert.equal(skyWord([hour({ cloudPct: 20 }), hour({ cloudPct: 40 })]), "mixed"));
  test("mean cloud 69 is mixed", () => assert.equal(skyWord(day([0], 69)), "mixed"));
  test("mean cloud 70 is overcast", () => assert.equal(skyWord(day([0], 70)), "overcast"));
  test("night hours don't count", () =>
    assert.equal(skyWord([hour({ cloudPct: 0 }), hour({ cloudPct: 100, rainMm: 9, isDaylight: false })]), "sunny"));
  test("an empty day is sunny, not NaN-driven", () => assert.equal(skyWord([]), "sunny"));
});

describe("tempRange", () => {
  test("floors and ceils, then pads 2 each side", () => {
    assert.deepEqual(tempRange([[hour({ tempC: 4.6 })], [hour({ tempC: 20.2 })]]), { min: 2, max: 23 });
  });

  test("a narrow forecast widens symmetrically to 12 degrees", () => {
    // 15..18 -> 13..20 (span 7) -> widened by 2.5 each side.
    assert.deepEqual(tempRange([[hour({ tempC: 15 }), hour({ tempC: 18 })]]), { min: 10.5, max: 22.5 });
  });

  test("exactly 12 after padding is left alone", () => {
    assert.deepEqual(tempRange([[hour({ tempC: 10 }), hour({ tempC: 18 })]]), { min: 8, max: 20 });
  });

  test("night hours are ignored", () => {
    assert.deepEqual(tempRange([[hour({ tempC: 10 }), hour({ tempC: 30 }), hour({ tempC: -20, isDaylight: false })]]), {
      min: 8,
      max: 32,
    });
  });

  test("no usable hours gives a finite fallback", () => {
    const r = tempRange([[], [hour({ tempC: NaN })]]);
    assert.ok(Number.isFinite(r.min) && Number.isFinite(r.max) && r.max - r.min >= 12);
  });
});
