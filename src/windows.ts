// Detects contiguous "go paddle" windows and summarizes a day/lookahead from scored hours.
// Semantics ported 1:1 from prototypes/core.js (findWindows/daySummary) and a-ribbon.html (glance); groupByDate moved here from render.tsx.
import { TIER_NAMES, type ScoredHour } from "./scoring";
import type { Tier } from "./config";

export interface GoodWindow {
  date: string;
  startHour: number;
  endHour: number; // exclusive
  hours: ScoredHour[];
  bestTier: Tier;
  worstTier: Tier;
  modeTier: Tier; // rounded mean tierIndex of hours - what the UI shows
}

// Contiguous runs of qualifying hours; a non-qualifying hour or a date/hourNum jump ends the current run.
export function findWindows(hours: ScoredHour[]): GoodWindow[] {
  const windows: GoodWindow[] = [];
  let run: GoodWindow | null = null;

  for (const h of hours) {
    if (!h.qualifies) {
      run = null;
      continue;
    }
    if (run && run.date === h.date && run.endHour === h.hourNum) {
      run.hours.push(h);
      run.endHour = h.hourNum + 1;
    } else {
      run = { date: h.date, startHour: h.hourNum, endHour: h.hourNum + 1, hours: [h], bestTier: h.tier, worstTier: h.tier, modeTier: h.tier };
      windows.push(run);
    }
  }

  for (const w of windows) {
    const idxs = w.hours.map((h) => h.tierIndex);
    w.bestTier = TIER_NAMES[Math.min(...idxs)]!;
    w.worstTier = TIER_NAMES[Math.max(...idxs)]!;
    w.modeTier = TIER_NAMES[Math.round(idxs.reduce((a, b) => a + b, 0) / idxs.length)]!;
  }
  return windows;
}

export interface DaySummary {
  best: GoodWindow | null;
  windows: GoodWindow[];
  minWind: number | null;
  maxWind: number | null;
  qualifyingHours: number;
  daylightHours: number;
}

// One day's verdict: best window (longest, ties broken by better tier) plus wind range and hour counts.
export function daySummary(dayHours: ScoredHour[]): DaySummary {
  const windows = findWindows(dayHours).sort(
    (a, b) => b.hours.length - a.hours.length || TIER_NAMES.indexOf(a.bestTier) - TIER_NAMES.indexOf(b.bestTier)
  );
  const daylight = dayHours.filter((h) => h.isDaylight);
  const winds = daylight.map((h) => h.windKmh);

  return {
    best: windows[0] ?? null,
    windows,
    minWind: winds.length ? Math.min(...winds) : null,
    maxWind: winds.length ? Math.max(...winds) : null,
    qualifyingHours: daylight.filter((h) => h.qualifies).length,
    daylightHours: daylight.length,
  };
}

export interface Glance {
  dayIndex: number | null;
  allDay: boolean;
  startHour: number;
  endHour: number;
  tier: Tier | null;
}

// First day (in lookahead order) with a qualifying window; no window anywhere -> dayIndex/tier null.
export function glance(days: ScoredHour[][]): Glance {
  for (let i = 0; i < days.length; i++) {
    const summary = daySummary(days[i]!);
    if (summary.best) {
      return {
        dayIndex: i,
        allDay: summary.daylightHours > 0 && summary.qualifyingHours === summary.daylightHours,
        startHour: summary.best.startHour,
        endHour: summary.best.endHour,
        tier: summary.best.modeTier,
      };
    }
  }
  return { dayIndex: null, allDay: false, startHour: 0, endHour: 0, tier: null };
}

// Groups hours by date, in first-seen order - night hours stay in; filter after grouping if you only want daylight rows.
export function groupByDate(hours: ScoredHour[]): { date: string; hours: ScoredHour[] }[] {
  const byDate = new Map<string, ScoredHour[]>();
  for (const h of hours) {
    if (!byDate.has(h.date)) byDate.set(h.date, []);
    byDate.get(h.date)!.push(h);
  }
  return [...byDate.entries()].map(([date, hours]) => ({ date, hours }));
}
