// config.ts itself has no logic - these are invariant checks, guarding
// against a future edit that silently breaks scoring.ts's assumptions
// (e.g. WIND_TIERS no longer sorted, or WORST_QUALIFYING_TIER renamed to
// something that no longer exists).
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  WIND_TIERS,
  WORST_QUALIFYING_TIER,
  GUST_FORCE_AVOID_KMH,
  GUST_FORCE_POOR_KMH,
  GUST_DOWNGRADE_2_DELTA_KMH,
  GUST_DOWNGRADE_1_DELTA_KMH,
  TEMP_BETTER_C,
  TEMP_MIN_C,
  LOOKAHEAD_DAYS,
  LOCATION,
} from "./config";

describe("config invariants", () => {
  test("WIND_TIERS is sorted ascending by maxSustainedKmh", () => {
    for (let i = 1; i < WIND_TIERS.length; i++) {
      assert.ok(
        WIND_TIERS[i]!.maxSustainedKmh > WIND_TIERS[i - 1]!.maxSustainedKmh,
        `${WIND_TIERS[i]!.name} must have a higher bound than ${WIND_TIERS[i - 1]!.name}`
      );
    }
  });

  test("WORST_QUALIFYING_TIER names an actual wind tier", () => {
    const names = WIND_TIERS.map((t) => t.name);
    assert.ok(names.includes(WORST_QUALIFYING_TIER as (typeof names)[number]));
  });

  test("gust force-avoid threshold is above the force-poor threshold", () => {
    assert.ok(GUST_FORCE_AVOID_KMH > GUST_FORCE_POOR_KMH);
  });

  test("2-tier gust downgrade threshold is stricter (higher) than the 1-tier one", () => {
    assert.ok(GUST_DOWNGRADE_2_DELTA_KMH > GUST_DOWNGRADE_1_DELTA_KMH);
  });

  test("warm threshold is above the minimum-to-qualify threshold", () => {
    assert.ok(TEMP_BETTER_C > TEMP_MIN_C);
  });

  test("lookahead is a positive integer", () => {
    assert.ok(Number.isInteger(LOOKAHEAD_DAYS) && LOOKAHEAD_DAYS > 0);
  });

  test("location has a plausible Amsterdam-area lat/lon and an IANA timezone string", () => {
    assert.ok(LOCATION.lat > 50 && LOCATION.lat < 54);
    assert.ok(LOCATION.lon > 2 && LOCATION.lon < 8);
    assert.ok(LOCATION.timezone.includes("/"));
  });
});
