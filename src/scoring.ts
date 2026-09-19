// Turns an hourly forecast row into a SUP verdict.
//
// Two independent axes, both tuned in config.ts:
//   - wind/gust -> a 5-level tier (great/good/marginal/poor/avoid). Sustained
//     wind picks a base tier; gust can only push it worse (see
//     applyGustAdjustment), never better.
//   - temp -> a separate qualify gate (> TEMP_MIN_C) plus a "warm" note
//     (> TEMP_BETTER_C), not folded into the wind/gust tier.
// Daylight is a third, independent gate.
import {
  WIND_TIERS,
  WORST_QUALIFYING_TIER,
  GUST_FORCE_AVOID_KMH,
  GUST_FORCE_POOR_KMH,
  GUST_DOWNGRADE_RATIO,
  GUST_DOWNGRADE_2_DELTA_KMH,
  GUST_DOWNGRADE_2_RATIO_MIN_KMH,
  GUST_DOWNGRADE_1_DELTA_KMH,
  GUST_DOWNGRADE_1_RATIO_MIN_KMH,
  TEMP_BETTER_C,
  TEMP_MIN_C,
  type Tier,
} from "./config";
import type { HourRow } from "./weather";

// scoreHour's output: an HourRow plus its verdict. This is what render.ts
// consumes to draw each hour's cell in the grid.
export interface ScoredHour extends HourRow {
  qualifies: boolean; // daylight + tier at/better than WORST_QUALIFYING_TIER + warm enough
  tier: Tier; // final tier, after any gust downgrade
  baseTier: Tier; // tier from sustained wind alone, before gust adjustment
  warm: boolean; // tempC > TEMP_BETTER_C - informational, doesn't affect qualifies
  gustDowngraded: boolean; // true when tier !== baseTier (gust made it worse)
  gustDelta: number; // gustKmh - windKmh, rounded for display
  gustRatio: number; // gustKmh / windKmh, rounded for display
}

// Tier order best -> worst: WIND_TIERS' names plus "avoid" appended.
export const TIER_NAMES: Tier[] = [...WIND_TIERS.map((t) => t.name), "avoid"];
const WORST_QUALIFYING_INDEX = TIER_NAMES.indexOf(WORST_QUALIFYING_TIER);

function baseTierFromWind(windKmh: number): Tier {
  const match = WIND_TIERS.find((t) => windKmh <= t.maxSustainedKmh);
  return match ? match.name : "avoid";
}

// Mirrors config.ts's GUST_* comment 1:1 - see that file for the rule
// table. Gust can only ever make the tier worse (or leave it unchanged),
// never better than what sustained wind alone earned.
function applyGustAdjustment(
  baseTier: Tier,
  windKmh: number,
  gustKmh: number
): { tier: Tier; gustDelta: number; gustRatio: number } {
  let idx = TIER_NAMES.indexOf(baseTier);
  const delta = gustKmh - windKmh;
  const ratio = gustKmh / Math.max(windKmh, 1);

  if (gustKmh > GUST_FORCE_AVOID_KMH) {
    idx = TIER_NAMES.indexOf("avoid");
  } else if (gustKmh > GUST_FORCE_POOR_KMH) {
    idx = Math.max(idx, TIER_NAMES.indexOf("poor"));
  } else if (
    delta > GUST_DOWNGRADE_2_DELTA_KMH ||
    (ratio >= GUST_DOWNGRADE_RATIO && gustKmh >= GUST_DOWNGRADE_2_RATIO_MIN_KMH)
  ) {
    idx = Math.min(idx + 2, TIER_NAMES.length - 1);
  } else if (
    delta > GUST_DOWNGRADE_1_DELTA_KMH ||
    (ratio >= GUST_DOWNGRADE_RATIO && gustKmh >= GUST_DOWNGRADE_1_RATIO_MIN_KMH)
  ) {
    idx = Math.min(idx + 1, TIER_NAMES.length - 1);
  }

  return { tier: TIER_NAMES[idx]!, gustDelta: delta, gustRatio: ratio };
}

// Scores one hour's forecast row into a tier + qualifies flag.
export function scoreHour(row: HourRow): ScoredHour {
  const baseTier = baseTierFromWind(row.windKmh);
  const { tier, gustDelta, gustRatio } = applyGustAdjustment(baseTier, row.windKmh, row.gustKmh);
  const tierIndex = TIER_NAMES.indexOf(tier);

  const qualifies = row.isDaylight && tierIndex <= WORST_QUALIFYING_INDEX && row.tempC > TEMP_MIN_C;
  const warm = row.tempC > TEMP_BETTER_C;
  const gustDowngraded = tier !== baseTier;

  return {
    ...row,
    qualifies,
    tier,
    baseTier,
    warm,
    gustDowngraded,
    gustDelta: Math.round(gustDelta * 10) / 10,
    gustRatio: Math.round(gustRatio * 100) / 100,
  };
}
