// Expected values cross-checked by running core.js's own scoreHour/findWindows/daySummary on this fixture (see PR description).
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { mockFetch, threeDayWindowsRoute } from "../testSupport";
import { fetchForecast } from "./weather";
import { scoreHour, type ScoredHour } from "./scoring";
import { findWindows, daySummary, glance, groupByDate } from "./windows";

async function threeScoredDays(t: import("node:test").TestContext): Promise<ScoredHour[][]> {
  mockFetch(t, [threeDayWindowsRoute()]);
  const { hours } = await fetchForecast({ lat: 1, lon: 2, days: 3 });
  return groupByDate(hours.map(scoreHour)).map((d) => d.hours);
}

describe("windows.ts against the three-day fixture (day1: 3h+1h windows, day2: all-day, day3: none)", () => {
  test("groupByDate + findWindows/daySummary match core.js's output", async (t) => {
    const days = await threeScoredDays(t);
    assert.equal(days.length, 3);

    // Day 1: 06-08 great (3h), 09 poor breaks it, 10 good (1h), then avoid.
    const day1 = daySummary(days[0]!);
    assert.equal(day1.windows.length, 2);
    assert.deepEqual(
      day1.windows.map((w) => ({ start: w.startHour, end: w.endHour, n: w.hours.length, mode: w.modeTier })),
      [
        { start: 6, end: 9, n: 3, mode: "great" },
        { start: 10, end: 11, n: 1, mode: "good" },
      ]
    );
    assert.equal(day1.best?.startHour, 6);
    assert.equal(day1.best?.endHour, 9);
    assert.equal(day1.best?.hours.length, 3);
    assert.equal(day1.minWind, 8);
    assert.equal(day1.maxWind, 30);
    assert.equal(day1.qualifyingHours, 4);
    assert.equal(day1.daylightHours, 15);

    // Day 2: every daylight hour qualifies at "great" - one all-day window.
    const day2 = daySummary(days[1]!);
    assert.equal(day2.windows.length, 1);
    assert.equal(day2.best?.startHour, 6);
    assert.equal(day2.best?.endHour, 21);
    assert.equal(day2.best?.hours.length, 15);
    assert.equal(day2.best?.modeTier, "great");
    assert.equal(day2.qualifyingHours, day2.daylightHours);
    assert.equal(day2.minWind, 8);
    assert.equal(day2.maxWind, 8);

    // Day 3: constant 30 km/h (avoid) - no qualifying hours, no window.
    const day3 = daySummary(days[2]!);
    assert.equal(day3.windows.length, 0);
    assert.equal(day3.best, null);
    assert.equal(day3.qualifyingHours, 0);
    assert.equal(day3.daylightHours, 15);
    assert.equal(day3.minWind, 30);
    assert.equal(day3.maxWind, 30);
  });

  test("glance reports the first day with a window (day1's 3h window, not all-day)", async (t) => {
    const days = await threeScoredDays(t);
    const g = glance(days);
    assert.deepEqual(g, { dayIndex: 0, allDay: false, startHour: 6, endHour: 9, tier: "great" });
  });

  test("glance reports allDay when the first qualifying day's window covers every daylight hour", async (t) => {
    const days = await threeScoredDays(t);
    const g = glance(days.slice(1)); // skip day1, so day2 (all-day) is first
    assert.deepEqual(g, { dayIndex: 0, allDay: true, startHour: 6, endHour: 21, tier: "great" });
  });

  test("glance returns nulls when no day in the lookahead has a window", async (t) => {
    const days = await threeScoredDays(t);
    const g = glance([days[2]!]); // only the no-window day
    assert.deepEqual(g, { dayIndex: null, allDay: false, startHour: 0, endHour: 0, tier: null });
  });
});

describe("findWindows / glance - empty input", () => {
  test("no hours -> no windows", () => {
    assert.deepEqual(findWindows([]), []);
  });

  test("no days -> glance returns nulls", () => {
    assert.deepEqual(glance([]), { dayIndex: null, allDay: false, startHour: 0, endHour: 0, tier: null });
  });
});
