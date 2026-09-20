// Fetches an hourly wind/temp forecast plus daily sunrise/sunset from
// Open-Meteo.
//
// Deliberately its own copy (not shared) - same reasoning sup-sync and
// remarkable-hack use for each other: this repo is meant to stand alone.
import { LOCATION, LOOKAHEAD_DAYS } from "./config";

// One hour of forecast data, already mapped from Open-Meteo's parallel
// arrays into a single per-hour record. This is scoring.ts's input shape.
export interface HourRow {
  time: string; // "YYYY-MM-DDTHH:MM", no timezone offset
  date: string; // "YYYY-MM-DD"
  hour: string; // "HH:MM"
  hourNum: number; // 0-23, for window-contiguity checks in windows.ts
  tempC: number;
  windKmh: number;
  gustKmh: number;
  // Meteorological convention: the direction the wind is blowing FROM
  // (0 = N, 90 = E, ...), not the direction it's heading towards.
  windDirDeg: number;
  // Open-Meteo's WMO weather code (0 = clear sky, 61 = light rain, etc.) -
  // https://open-meteo.com/en/docs#weathervariables lists the full table.
  // Not currently shown anywhere in the UI; fetched for future use.
  weatherCode: number;
  // Precomputed once here (against the day's sunrise/sunset below) so
  // every downstream consumer - scoring.ts's qualifies check, render.tsx's
  // groupByDate filter - just reads a boolean instead of each re-deriving
  // it from a sunrise/sunset lookup.
  isDaylight: boolean;
}

// One day's sunrise/sunset instants - only used internally, to compute
// each HourRow's isDaylight; not part of this module's public return value.
interface DaylightWindow {
  sunrise: Date;
  sunset: Date;
}

// fetchForecast's return value.
export interface ForecastResult {
  hours: HourRow[];
}

// fetchForecast's params - all optional, each defaulting to config.ts's
// LOCATION/LOOKAHEAD_DAYS. In practice the one real caller (index.ts)
// always overrides lat/lon and never timezone/days (all of NL is one
// timezone); the defaults mainly let tests call fetchForecast() bare.
interface FetchForecastOptions {
  lat?: number;
  lon?: number;
  timezone?: string;
  days?: number;
}

// The shape of Open-Meteo's JSON response (only the fields this project
// actually requests/uses - see https://open-meteo.com/en/docs for the
// full public response shape).
interface OpenMeteoResponse {
  hourly: {
    time: string[];
    temperature_2m: number[];
    windspeed_10m: number[];
    windgusts_10m: number[];
    winddirection_10m: number[];
    weathercode: number[];
  };
  daily: {
    time: string[];
    sunrise: string[];
    sunset: string[];
  };
}

// Thrown by fetchForecast on a non-2xx response. status/body are real
// properties (not just embedded in the message string) so a caller can
// branch on them programmatically instead of parsing message text.
export class OpenMeteoError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: string
  ) {
    super(`Open-Meteo fetch failed: ${status} ${body}`);
    this.name = "OpenMeteoError";
  }
}

// Rounds to 3 decimal places (~110m) so nearby requests share Open-Meteo's
// edge cache instead of missing on float noise.
function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

// Fetches and maps one location's hourly forecast.
export async function fetchForecast({
  lat = LOCATION.lat,
  lon = LOCATION.lon,
  timezone = LOCATION.timezone,
  days = LOOKAHEAD_DAYS,
}: FetchForecastOptions = {}): Promise<ForecastResult> {
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", String(round3(lat)));
  url.searchParams.set("longitude", String(round3(lon)));
  url.searchParams.set("hourly", "temperature_2m,windspeed_10m,windgusts_10m,winddirection_10m,weathercode");
  url.searchParams.set("daily", "sunrise,sunset");
  url.searchParams.set("timezone", timezone);
  url.searchParams.set("forecast_days", String(days));
  url.searchParams.set("wind_speed_unit", "kmh");
  url.searchParams.set("temperature_unit", "celsius");

  // cacheEverything + a 10 min TTL: repeat and nearby requests (chip glance
  // fetches especially) are served from Cloudflare's edge, not Open-Meteo.
  const resp = await fetch(url, { cf: { cacheTtl: 600, cacheEverything: true } });
  if (!resp.ok) {
    throw new OpenMeteoError(resp.status, await resp.text());
  }
  const data = (await resp.json()) as OpenMeteoResponse;

  // Map each date (YYYY-MM-DD) to its sunrise/sunset instants, so hourly
  // rows can be tagged for daylight without re-deriving them elsewhere.
  const daylightByDate = new Map<string, DaylightWindow>();
  data.daily.time.forEach((date, i) => {
    daylightByDate.set(date, {
      sunrise: new Date(data.daily.sunrise[i]!),
      sunset: new Date(data.daily.sunset[i]!),
    });
  });

  const h = data.hourly;
  const hours: HourRow[] = h.time.map((time, i) => {
    const date = time.slice(0, 10);
    const at = new Date(time);
    const window = daylightByDate.get(date);
    const isDaylight = !!window && at >= window.sunrise && at <= window.sunset;
    return {
      time,
      date,
      hour: time.slice(11, 16),
      hourNum: Number(time.slice(11, 13)),
      tempC: h.temperature_2m[i]!,
      windKmh: h.windspeed_10m[i]!,
      gustKmh: h.windgusts_10m[i]!,
      windDirDeg: h.winddirection_10m[i]!,
      weatherCode: h.weathercode[i]!,
      isDaylight,
    };
  });

  return { hours };
}
