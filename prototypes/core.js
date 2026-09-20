// Shared prototype core: live data + the real scoring model, ported 1:1 from
// src/config.ts + src/scoring.ts + src/weather.ts + src/geocode.ts.
// ES module. No build step. Both prototype variations import from here.

export const TIERS = ["great", "good", "marginal", "poor", "avoid"];
export const TIER_LABEL = { great: "Great", good: "Good", marginal: "OK", poor: "Poor", avoid: "Avoid" };
export const WORST_QUALIFYING = "marginal";
const WIND_TIERS = [
  { name: "great", max: 10 },
  { name: "good", max: 15 },
  { name: "marginal", max: 20 },
  { name: "poor", max: 25 },
];
const GUST_FORCE_AVOID = 45, GUST_FORCE_POOR = 35, GUST_RATIO = 2.5;
const G2_DELTA = 25, G2_MIN = 30, G1_DELTA = 20, G1_MIN = 25;
export const TEMP_BETTER_C = 15, TEMP_MIN_C = 10;
export const LOOKAHEAD_DAYS = 4;
export const DEFAULT_SPOT = { name: "Amsterdamse Bos", lat: 52.34789, lon: 4.88986 };

export function scoreHour(row) {
  const baseTier = (WIND_TIERS.find((t) => row.windKmh <= t.max) || { name: "avoid" }).name;
  let idx = TIERS.indexOf(baseTier);
  const delta = row.gustKmh - row.windKmh;
  const ratio = row.gustKmh / Math.max(row.windKmh, 1);
  if (row.gustKmh > GUST_FORCE_AVOID) idx = 4;
  else if (row.gustKmh > GUST_FORCE_POOR) idx = Math.max(idx, 3);
  else if (delta > G2_DELTA || (ratio >= GUST_RATIO && row.gustKmh >= G2_MIN)) idx = Math.min(idx + 2, 4);
  else if (delta > G1_DELTA || (ratio >= GUST_RATIO && row.gustKmh >= G1_MIN)) idx = Math.min(idx + 1, 4);
  const tier = TIERS[idx];
  return {
    ...row,
    tier,
    baseTier,
    tierIndex: idx,
    qualifies: row.isDaylight && idx <= TIERS.indexOf(WORST_QUALIFYING) && row.tempC > TEMP_MIN_C,
    warm: row.tempC > TEMP_BETTER_C,
    gustDowngraded: tier !== baseTier,
    coldLimited: row.isDaylight && idx <= 2 && row.tempC <= TEMP_MIN_C,
  };
}

// Returns { hours: ScoredHour[], days: [{date, sunrise, sunset, hours}] }.
// Every hour (night included) is present in `hours`, flagged isDaylight.
export async function fetchForecast(lat, lon, days = LOOKAHEAD_DAYS) {
  const u = new URL("https://api.open-meteo.com/v1/forecast");
  u.searchParams.set("latitude", lat);
  u.searchParams.set("longitude", lon);
  u.searchParams.set("hourly", "temperature_2m,windspeed_10m,windgusts_10m,winddirection_10m,weathercode");
  u.searchParams.set("daily", "sunrise,sunset");
  u.searchParams.set("timezone", "Europe/Amsterdam");
  u.searchParams.set("forecast_days", String(days));
  u.searchParams.set("wind_speed_unit", "kmh");
  const r = await fetch(u);
  if (!r.ok) throw new Error("Open-Meteo " + r.status);
  const d = await r.json();
  const dayMap = new Map();
  d.daily.time.forEach((date, i) => dayMap.set(date, { date, sunrise: d.daily.sunrise[i], sunset: d.daily.sunset[i], hours: [] }));
  const h = d.hourly;
  const hours = h.time.map((time, i) => {
    const date = time.slice(0, 10);
    const w = dayMap.get(date);
    // Same rule as src/weather.ts: hour instant within [sunrise, sunset].
    const isDaylight = !!w && time >= w.sunrise && time <= w.sunset;
    const row = scoreHour({
      time, date, hour: time.slice(11, 16), hourNum: Number(time.slice(11, 13)),
      tempC: h.temperature_2m[i], windKmh: h.windspeed_10m[i], gustKmh: h.windgusts_10m[i],
      windDirDeg: h.winddirection_10m[i], weatherCode: h.weathercode[i], isDaylight,
    });
    if (w) w.hours.push(row);
    return row;
  });
  return { hours, days: [...dayMap.values()] };
}

// Contiguous runs of qualifying daylight hours, per day.
// Each: {date, startHour, endHour (exclusive), hours, bestTier, worstTier, modeTier}
export function findWindows(hours) {
  const out = [];
  let run = null;
  for (const h of hours) {
    if (h.qualifies) {
      if (run && run.date === h.date && run.endHour === h.hourNum) { run.hours.push(h); run.endHour = h.hourNum + 1; }
      else { run = { date: h.date, startHour: h.hourNum, endHour: h.hourNum + 1, hours: [h] }; out.push(run); }
    } else run = null;
  }
  for (const w of out) {
    const idxs = w.hours.map((h) => h.tierIndex);
    w.bestTier = TIERS[Math.min(...idxs)];
    w.worstTier = TIERS[Math.max(...idxs)];
    w.modeTier = TIERS[Math.round(idxs.reduce((a, b) => a + b, 0) / idxs.length)];
  }
  return out;
}

// One-line verdict for a day: best window or none.
export function daySummary(dayHours) {
  const wins = findWindows(dayHours).sort((a, b) => b.hours.length - a.hours.length || TIERS.indexOf(a.bestTier) - TIERS.indexOf(b.bestTier));
  const daylight = dayHours.filter((h) => h.isDaylight);
  const winds = daylight.map((h) => h.windKmh);
  return {
    best: wins[0] || null,
    windows: wins,
    minWind: winds.length ? Math.min(...winds) : null,
    maxWind: winds.length ? Math.max(...winds) : null,
    qualifyingHours: daylight.filter((h) => h.qualifies).length,
    daylightHours: daylight.length,
  };
}

const COMPASS = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
export const compass = (deg) => COMPASS[Math.round((((deg % 360) + 360) % 360) / 22.5) % 16];
export const compassShort = (deg) => ["N", "NE", "E", "SE", "S", "SW", "W", "NW"][Math.round((((deg % 360) + 360) % 360) / 45) % 8];

export function dayLabel(date, { relative = true } = {}) {
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const diff = Math.round((dt - today) / 864e5);
  if (relative && diff === 0) return "Today";
  if (relative && diff === 1) return "Tomorrow";
  return dt.toLocaleDateString("en-GB", { weekday: "long" });
}
export function dayDate(date) {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}
export const fmtHour = (n) => String(n).padStart(2, "0") + ":00";
export const fmtRange = (w) => fmtHour(w.startHour) + "–" + fmtHour(w.endHour);

// PDOK forward search (same fq filters as src/geocode.ts) -> [{name, type, lat, lon}]
export async function searchPlaces(q, limit = 6) {
  const u = new URL("https://api.pdok.nl/bzk/locatieserver/search/v3_1/suggest");
  u.searchParams.set("q", q);
  u.searchParams.set("fl", "weergavenaam,centroide_ll,type");
  u.searchParams.set("rows", String(limit));
  u.searchParams.append("fq", "-type:gemeente");
  u.searchParams.append("fq", "-type:provincie");
  const r = await fetch(u);
  if (!r.ok) throw new Error("PDOK " + r.status);
  const d = await r.json();
  return (d.response?.docs || []).flatMap((doc) => {
    const m = /POINT\(([-\d.]+) ([-\d.]+)\)/.exec(doc.centroide_ll || "");
    return m ? [{ name: doc.weergavenaam, type: doc.type, lon: Number(m[1]), lat: Number(m[2]) }] : [];
  });
}

export async function reverseName(lat, lon) {
  for (const type of ["buurt", "wijk", "woonplaats"]) {
    const u = new URL("https://api.pdok.nl/bzk/locatieserver/search/v3_1/reverse");
    u.searchParams.set("lat", lat); u.searchParams.set("lon", lon);
    u.searchParams.set("type", type); u.searchParams.set("fl", "weergavenaam"); u.searchParams.set("rows", "1");
    try {
      const d = await (await fetch(u)).json();
      const name = d.response?.docs?.[0]?.weergavenaam;
      if (name) return name.split(",")[0].trim();
    } catch {}
  }
  return null;
}

// Resolves the visitor's starting spot: cached last spot, else GPS (short
// timeout), else DEFAULT_SPOT. The production site does this server-side
// from Cloudflare's IP geolocation with zero latency/permission prompt;
// the prototype approximates that.
export async function locate({ gpsTimeoutMs = 4000 } = {}) {
  const last = store.get("lastSpot");
  if (last) return { ...last, source: "last" };
  // Hard timer too: Chrome only starts the geolocation timeout once the
  // permission prompt is answered, so an ignored prompt would hang forever.
  const gps = await new Promise((res) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return res(null);
    const timer = setTimeout(() => res(null), gpsTimeoutMs);
    navigator.geolocation.getCurrentPosition(
      (p) => { clearTimeout(timer); res({ lat: p.coords.latitude, lon: p.coords.longitude }); },
      () => { clearTimeout(timer); res(null); },
      { timeout: gpsTimeoutMs, maximumAge: 600000 }
    );
  });
  if (gps) {
    const name = (await reverseName(gps.lat, gps.lon)) || "My location";
    return { ...gps, name, source: "gps" };
  }
  return { ...DEFAULT_SPOT, source: "default" };
}

export const sameSpot = (a, b) => a && b && Math.abs(a.lat - b.lat) < 1e-4 && Math.abs(a.lon - b.lon) < 1e-4;

// localStorage-backed saved spots (CUJ3 mock). Set store.ns per prototype.
export const store = {
  ns: "supdawg-proto",
  key(k) { return this.ns + ":" + k; },
  get(k, fallback = null) { try { const v = localStorage.getItem(this.key(k)); return v ? JSON.parse(v) : fallback; } catch { return fallback; } },
  set(k, v) { try { localStorage.setItem(this.key(k), JSON.stringify(v)); } catch {} },
  spots() { return this.get("spots", []); },
  saveSpot(s) { const all = this.spots().filter((x) => !sameSpot(x, s)); all.unshift({ name: s.name, lat: s.lat, lon: s.lon }); this.set("spots", all.slice(0, 8)); return all; },
  removeSpot(s) { const all = this.spots().filter((x) => !sameSpot(x, s)); this.set("spots", all); return all; },
  isSaved(s) { return this.spots().some((x) => sameSpot(x, s)); },
};

// In-memory forecast cache so switching between spots is instant.
const cache = new Map();
export async function forecastFor(spot) {
  const k = spot.lat.toFixed(3) + "," + spot.lon.toFixed(3);
  if (!cache.has(k)) cache.set(k, fetchForecast(spot.lat, spot.lon).catch((e) => { cache.delete(k); throw e; }));
  return cache.get(k);
}

// Wind blows FROM windDirDeg; arrow points where it blows TO (deg+180), like the current site.
export const arrowRotation = (deg) => (deg + 180) % 360;
// "YYYY-MM-DDTHH" for the current local hour (Europe/Amsterdam assumed = browser tz).
export const nowKey = () => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}`;
};
