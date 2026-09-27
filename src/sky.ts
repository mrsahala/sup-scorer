// Sky and rain summaries for the ribbon: per-hour glyph kind, per-day word and
// rain total, and the temperature scale shared by every day of a forecast.
import type { ScoredHour } from "./scoring";

export type SkyKind = "sun" | "partly" | "cloud" | "rain";
export type SkyWord = "sunny" | "mixed" | "overcast" | "showers" | "rainy";

const RAIN_MM = 0.2;
const LIKELY_RAIN_PCT = 60;
const CLOUD_PCT = 75;
const PARTLY_PCT = 35;
const RAINY_MM = 3;
const SHOWERS_MM = 0.5;
const SUNNY_MEAN_PCT = 30;
const MIXED_MEAN_PCT = 70;
const TEMP_PAD = 2;
const TEMP_MIN_SPAN = 12;
const TEMP_FALLBACK = { min: 0, max: 30 };

const finite = (v: number) => (Number.isFinite(v) ? v : 0);
const daylight = (hours: ScoredHour[]) => hours.filter((h) => h.isDaylight);

export function skyKind(h: ScoredHour): SkyKind {
  const mm = finite(h.rainMm);
  if (mm >= RAIN_MM || (mm > 0 && finite(h.rainPct) >= LIKELY_RAIN_PCT)) return "rain";
  const cloud = finite(h.cloudPct);
  if (cloud >= CLOUD_PCT) return "cloud";
  if (cloud >= PARTLY_PCT) return "partly";
  return "sun";
}

// The day's daylight rain in mm, rounded to 0.1.
export function rainTotal(dayHours: ScoredHour[]): number {
  const sum = daylight(dayHours).reduce((acc, h) => acc + Math.max(0, finite(h.rainMm)), 0);
  return Math.round(sum * 10) / 10;
}

export function skyWord(dayHours: ScoredHour[]): SkyWord {
  const rain = rainTotal(dayHours);
  if (rain >= RAINY_MM) return "rainy";
  if (rain >= SHOWERS_MM) return "showers";
  const hours = daylight(dayHours);
  const meanCloud = hours.length ? hours.reduce((acc, h) => acc + finite(h.cloudPct), 0) / hours.length : 0;
  if (meanCloud < SUNNY_MEAN_PCT) return "sunny";
  if (meanCloud < MIXED_MEAN_PCT) return "mixed";
  return "overcast";
}

// One temperature scale for the whole forecast, padded and at least TEMP_MIN_SPAN wide.
export function tempRange(days: ScoredHour[][]): { min: number; max: number } {
  const temps = days.flatMap(daylight).map((h) => h.tempC).filter(Number.isFinite);
  if (!temps.length) return { ...TEMP_FALLBACK };
  let min = Math.floor(Math.min(...temps)) - TEMP_PAD;
  let max = Math.ceil(Math.max(...temps)) + TEMP_PAD;
  const short = TEMP_MIN_SPAN - (max - min);
  if (short > 0) {
    min -= short / 2;
    max += short / 2;
  }
  return { min, max };
}
