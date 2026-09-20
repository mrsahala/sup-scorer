import * as c from "./core.js";
const f = await c.fetchForecast(52.34789, 4.88986);
console.log("hours", f.hours.length, "days", f.days.length);
for (const d of f.days) {
  const s = c.daySummary(d.hours);
  console.log(d.date, c.dayLabel(d.date), "best", s.best ? c.fmtRange(s.best) + " " + s.best.bestTier : "-", "wind", s.minWind, s.maxWind, "q", s.qualifyingHours + "/" + s.daylightHours);
}
console.log((await c.searchPlaces("loosdrecht")).slice(0, 3));
console.log("reverse", await c.reverseName(52.34789, 4.88986));
