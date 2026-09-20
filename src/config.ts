// Stores all tunable config vars in one place.
//
// Can edit these and run `npm run dev` to see the effect immediately

// Internal identifiers, not display text. render.tsx maps each one to a
// translated word (i18n.ts) and to a CSS class `tier-${tier}` (style.css)
// - renaming a value here means updating both.
export type Tier = "great" | "good" | "marginal" | "poor" | "avoid";

// A point to fetch/score a forecast for, plus the IANA timezone Open-Meteo
// should localize its hourly timestamps to.
export interface Location {
  lat: number;
  lon: number;
  timezone: string;
}

// Default location: weather.ts's fallback lat/lon/timezone when a caller
// doesn't pass its own.
export const LOCATION: Location = {
  lat: 52.347890675735485,
  lon: 4.889856145643074,
  timezone: "Europe/Amsterdam",
};

// How many days ahead to fetch/score forecast data for.
export const LOOKAHEAD_DAYS = 4;

// One entry of the WIND_TIERS table below: a tier name and the sustained
// wind speed (km/h) it tops out at, before any gust adjustment.
export interface WindTierConfig {
  name: Exclude<Tier, "avoid">;
  maxSustainedKmh: number;
}

// Tiers ordered best -> worst. Each entry's maxSustainedKmh is the upper
// bound (exclusive... well, <=) of *sustained* wind for that tier, before
// any gust adjustment. A sustained wind past the last tier's bound is
// "avoid" with no further check needed.
export const WIND_TIERS: WindTierConfig[] = [
  { name: "great", maxSustainedKmh: 10 },
  { name: "good", maxSustainedKmh: 15 },
  { name: "marginal", maxSustainedKmh: 20 },
  { name: "poor", maxSustainedKmh: 25 },
];

// Tiers worse than this don't count as a qualifying SUP window - they're
// still shown on the site (colored red/orange in the hourly grid), just not
// treated as "go paddle now" worthy. Casual read: only "marginal" or better
// is worth a session.
export const WORST_QUALIFYING_TIER: Tier = "marginal";

// Gust adjustment inputs - see scoring.ts's applyGustAdjustment for how
// these combine into a tier downgrade (that's the canonical explanation
// of how scoring works; this file just documents each knob).

// Gust above this overrides everything else and forces "avoid", regardless
// of how calm the sustained wind is.
export const GUST_FORCE_AVOID_KMH = 45;
// Gust above this (but at/below the force-avoid threshold) forces at least
// "poor", even from an otherwise "great" sustained-wind base.
export const GUST_FORCE_POOR_KMH = 35;
// Gust/sustained ratio threshold shared by both downgrade rules below - on
// its own it does nothing; it only fires combined with one of the
// *_RATIO_MIN_KMH gust floors.
export const GUST_DOWNGRADE_RATIO = 2.5;
// Gust-minus-sustained delta (km/h) that, above this, downgrades the tier
// by 2 steps.
export const GUST_DOWNGRADE_2_DELTA_KMH = 25;
// Minimum gust (km/h) required for the ratio-based 2-step downgrade to
// fire, even if GUST_DOWNGRADE_RATIO is met - stops a trivial ratio (e.g.
// 3km/h gusting to 8km/h) from triggering a downgrade at very low wind.
export const GUST_DOWNGRADE_2_RATIO_MIN_KMH = 30;
// Same as GUST_DOWNGRADE_2_DELTA_KMH, but for a 1-step downgrade.
export const GUST_DOWNGRADE_1_DELTA_KMH = 20;
// Same as GUST_DOWNGRADE_2_RATIO_MIN_KMH, but for the 1-step downgrade.
export const GUST_DOWNGRADE_1_RATIO_MIN_KMH = 25;

// Temp is a separate axis from wind/gust, not folded into the tier:

// Above this, an hour is flagged "warm" - informational only (not currently
// surfaced in the UI's hourly cells), doesn't affect the tier or whether
// the hour qualifies.
export const TEMP_BETTER_C = 15;
// Minimum temp required to qualify at all, regardless of how good the wind
// tier is - a technically "great" wind hour at 4C still won't qualify.
export const TEMP_MIN_C = 10;
