import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { skyKind, skyWord, rainTotal, heatColor, formatTemp } from "./sky";
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

describe("heatColor", () => {
  const stops: [number, string][] = [
    [5, "rgb(74,127,214)"],
    [12, "rgb(90,167,217)"],
    [17, "rgb(159,199,106)"],
    [22, "rgb(240,192,75)"],
    [27, "rgb(240,138,60)"],
    [32, "rgb(224,85,58)"],
  ];
  for (const [c, want] of stops) test(`${c} °C is exactly its stop`, () => assert.equal(heatColor(c), want));

  test("interpolates linearly between stops", () => assert.equal(heatColor(19.5), "rgb(200,196,91)"));

  test("clamps below and above the range", () => {
    assert.equal(heatColor(-10), "rgb(74,127,214)");
    assert.equal(heatColor(45), "rgb(224,85,58)");
  });

  test("a missing temperature doesn't produce NaN", () => assert.doesNotMatch(heatColor(NaN), /NaN/));
});

describe("formatTemp", () => {
  test("rounds Celsius to an integer", () => {
    assert.equal(formatTemp(17.5, "C"), "18");
    assert.equal(formatTemp(17.4, "C"), "17");
    assert.equal(formatTemp(-0.4, "C"), "0");
  });

  test("converts to Fahrenheit, then rounds", () => {
    assert.equal(formatTemp(18, "F"), "64");
    assert.equal(formatTemp(0, "F"), "32");
    assert.equal(formatTemp(-40, "F"), "-40");
    assert.equal(formatTemp(17.5, "F"), "64");
  });

  test("a missing temperature is 0, not NaN", () => assert.equal(formatTemp(NaN, "F"), "32"));
});
