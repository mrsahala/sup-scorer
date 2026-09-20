import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { scoreHour, TIER_NAMES } from "./scoring";
import type { HourRow } from "./weather";

function row(overrides: Partial<HourRow> = {}): HourRow {
  return {
    time: "2026-08-27T10:00",
    date: "2026-08-27",
    hour: "10:00",
    hourNum: 10,
    tempC: 20,
    windKmh: 10,
    gustKmh: 10,
    windDirDeg: 0,
    weatherCode: 0,
    isDaylight: true,
    ...overrides,
  };
}

describe("scoreHour - base tier from sustained wind (neutral gust)", () => {
  // gustKmh === windKmh keeps delta=0, ratio=1 - no gust adjustment fires -
  // isolates the pure wind->tier boundaries.
  const cases: [number, string][] = [
    [10, "great"],
    [10.1, "good"],
    [15, "good"],
    [15.1, "marginal"],
    [20, "marginal"],
    [20.1, "poor"],
    [25, "poor"],
    [25.1, "avoid"],
  ];
  for (const [windKmh, expected] of cases) {
    test(`wind ${windKmh}km/h -> ${expected}`, () => {
      const r = scoreHour(row({ windKmh, gustKmh: windKmh }));
      assert.equal(r.tier, expected);
      assert.equal(r.baseTier, expected);
      assert.equal(r.gustDowngraded, false);
    });
  }
});

describe("scoreHour - gust adjustment", () => {
  test("gust > 45 forces avoid regardless of low sustained wind", () => {
    const r = scoreHour(row({ windKmh: 5, gustKmh: 46 }));
    assert.equal(r.baseTier, "great");
    assert.equal(r.tier, "avoid");
    assert.equal(r.gustDowngraded, true);
  });

  test("gust in (35,45] forces at least poor, even from a great base", () => {
    const r = scoreHour(row({ windKmh: 5, gustKmh: 40 }));
    assert.equal(r.baseTier, "great");
    assert.equal(r.tier, "poor");
  });

  test("gust > 35 never improves a tier already worse than poor", () => {
    const r = scoreHour(row({ windKmh: 30, gustKmh: 40 }));
    assert.equal(r.baseTier, "avoid");
    assert.equal(r.tier, "avoid");
  });

  test("gust <= 35 exactly does not trigger the force-poor branch", () => {
    const r = scoreHour(row({ windKmh: 15, gustKmh: 35 }));
    assert.equal(r.tier, r.baseTier); // no downgrade at all, see delta test below
  });

  test("downgrade 2 tiers via delta > 25 (gust <= 35, so no force branch)", () => {
    const r = scoreHour(row({ windKmh: 8, gustKmh: 34 }));
    assert.equal(r.baseTier, "great");
    assert.equal(r.gustDelta, 26);
    assert.equal(r.tier, "marginal"); // great -> good -> marginal (2 steps)
    assert.equal(r.gustDowngraded, true);
  });

  test("downgrade 2 tiers via ratio>=2.5 and gust>=30 (delta alone insufficient)", () => {
    const r = scoreHour(row({ windKmh: 12, gustKmh: 31 }));
    assert.equal(r.baseTier, "good");
    assert.ok(r.gustDelta <= 25, "delta must not itself cross the delta-2 threshold");
    assert.equal(r.tier, "poor"); // good -> marginal -> poor
  });

  test("downgrade 1 tier via delta > 20 (kept under the ratio-2 gust>=30 gate)", () => {
    const r = scoreHour(row({ windKmh: 14.9, gustKmh: 35 }));
    assert.equal(r.baseTier, "good");
    assert.equal(r.tier, "marginal");
  });

  test("delta exactly 20 (not > 20) with low ratio: no downgrade", () => {
    const r = scoreHour(row({ windKmh: 15, gustKmh: 35 }));
    assert.equal(r.gustDelta, 20);
    assert.ok(r.gustRatio < 2.5);
    assert.equal(r.tier, r.baseTier);
    assert.equal(r.gustDowngraded, false);
  });

  test("gustDelta and gustRatio are rounded for display", () => {
    const r = scoreHour(row({ windKmh: 12, gustKmh: 31 }));
    assert.equal(r.gustDelta, 19);
    assert.equal(r.gustRatio, 2.58); // 31/12 = 2.58333...
  });
});

describe("scoreHour - qualify gates (daylight, temp, worst tier)", () => {
  test("qualifies when daylight, warm enough, and tier is great", () => {
    const r = scoreHour(row({ windKmh: 5, gustKmh: 5, tempC: 11, isDaylight: true }));
    assert.equal(r.qualifies, true);
  });

  test("does not qualify outside daylight, even with perfect wind/temp", () => {
    const r = scoreHour(row({ windKmh: 5, gustKmh: 5, tempC: 20, isDaylight: false }));
    assert.equal(r.qualifies, false);
  });

  test("temp must be strictly > 10C to qualify", () => {
    const atBoundary = scoreHour(row({ windKmh: 5, gustKmh: 5, tempC: 10 }));
    const justAbove = scoreHour(row({ windKmh: 5, gustKmh: 5, tempC: 10.1 }));
    assert.equal(atBoundary.qualifies, false);
    assert.equal(justAbove.qualifies, true);
  });

  test("marginal tier qualifies (it's the configured worst-qualifying tier)", () => {
    const r = scoreHour(row({ windKmh: 18, gustKmh: 18, tempC: 20 }));
    assert.equal(r.tier, "marginal");
    assert.equal(r.qualifies, true);
  });

  test("poor tier does not qualify, even with good daylight/temp", () => {
    const r = scoreHour(row({ windKmh: 22, gustKmh: 22, tempC: 20 }));
    assert.equal(r.tier, "poor");
    assert.equal(r.qualifies, false);
  });

  test("avoid tier never qualifies", () => {
    const r = scoreHour(row({ windKmh: 30, gustKmh: 30, tempC: 20 }));
    assert.equal(r.tier, "avoid");
    assert.equal(r.qualifies, false);
  });
});

describe("scoreHour - warm flag (independent of tier)", () => {
  test("warm is false at exactly 15C, true just above", () => {
    assert.equal(scoreHour(row({ tempC: 15 })).warm, false);
    assert.equal(scoreHour(row({ tempC: 15.1 })).warm, true);
  });
});

describe("TIER_NAMES", () => {
  test("is ordered best to worst, ending in avoid", () => {
    assert.deepEqual(TIER_NAMES, ["great", "good", "marginal", "poor", "avoid"]);
  });
});

describe("scoreHour - tierIndex", () => {
  test("matches TIER_NAMES.indexOf(tier), including after a gust downgrade", () => {
    const r = scoreHour(row({ windKmh: 8, gustKmh: 34 })); // great -> marginal (2-step downgrade)
    assert.equal(r.tier, "marginal");
    assert.equal(r.tierIndex, TIER_NAMES.indexOf("marginal"));
  });
});

describe("scoreHour - coldLimited", () => {
  test("true when tier qualifies on wind but temp is at/below TEMP_MIN_C", () => {
    const r = scoreHour(row({ windKmh: 5, gustKmh: 5, tempC: 10, isDaylight: true }));
    assert.equal(r.tier, "great");
    assert.equal(r.qualifies, false); // temp gate fails
    assert.equal(r.coldLimited, true);
  });

  test("false when warm enough, even at the same tier", () => {
    const r = scoreHour(row({ windKmh: 5, gustKmh: 5, tempC: 10.1, isDaylight: true }));
    assert.equal(r.coldLimited, false);
  });

  test("false outside daylight, regardless of temp", () => {
    const r = scoreHour(row({ windKmh: 5, gustKmh: 5, tempC: 5, isDaylight: false }));
    assert.equal(r.coldLimited, false);
  });

  test("false when the tier itself is worse than marginal, even if cold", () => {
    const r = scoreHour(row({ windKmh: 22, gustKmh: 22, tempC: 5, isDaylight: true }));
    assert.equal(r.tier, "poor");
    assert.equal(r.coldLimited, false);
  });
});
