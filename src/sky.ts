// Sky, rain and temperature helpers: per-hour glyph kind, per-day word and rain
// total, the fixed temperature color scale, and °C/°F display.
import type { ScoredHour } from "./scoring";

export type SkyKind = "sun" | "partly" | "cloud" | "rain";
export type SkyWord = "sunny" | "mixed" | "overcast" | "showers" | "rainy";
export type Unit = "C" | "F";

const RAIN_MM = 0.2;
const LIKELY_RAIN_PCT = 60;
const CLOUD_PCT = 75;
const PARTLY_PCT = 35;
const RAINY_MM = 3;
const SHOWERS_MM = 0.5;
const SUNNY_MEAN_PCT = 30;
const MIXED_MEAN_PCT = 70;

// °C -> rgb, the same on every forecast so a color always means the same temperature.
const HEAT_STOPS: [number, [number, number, number]][] = [
  [5, [74, 127, 214]],
  [12, [90, 167, 217]],
  [17, [159, 199, 106]],
  [22, [240, 192, 75]],
  [27, [240, 138, 60]],
  [32, [224, 85, 58]],
];

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

export function heatColor(tempC: number): string {
  const t = finite(tempC);
  const [firstC, firstRgb] = HEAT_STOPS[0]!;
  let rgb = HEAT_STOPS[HEAT_STOPS.length - 1]![1];
  if (t <= firstC) rgb = firstRgb;
  else {
    for (let i = 1; i < HEAT_STOPS.length; i++) {
      const [t0, c0] = HEAT_STOPS[i - 1]!;
      const [t1, c1] = HEAT_STOPS[i]!;
      if (t > t1) continue;
      const f = (t - t0) / (t1 - t0);
      rgb = [0, 1, 2].map((j) => Math.round(c0[j]! + (c1[j]! - c0[j]!) * f)) as [number, number, number];
      break;
    }
  }
  return `rgb(${rgb.join(",")})`;
}

// Rounded integer in the given unit, no symbol: "18" / "64".
export function formatTemp(tempC: number, unit: Unit): string {
  const c = finite(tempC);
  return String(Math.round(unit === "F" ? (c * 9) / 5 + 32 : c) || 0);
}
