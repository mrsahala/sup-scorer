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
  // That day's actual sunrise/sunset as "HH:MM" local time, for display -
  // isDaylight is hour-granular, these are what the visitor sees.
  sunrise: string;
  sunset: string;
}

// One day's sunrise/sunset - only used internally, to compute each
// HourRow's isDaylight and carry the display times; not part of this
// module's public return value.
interface DaylightWindow {
  sunrise: Date;
  sunset: Date;
  sunriseHm: string;
  sunsetHm: string;
}

// fetchForecast's return value. `timezone` is the IANA zone the hour rows
// are expressed in - the location's own zone when the request used "auto".
export interface ForecastResult {
  hours: HourRow[];
  timezone: string;
}

// fetchForecast's params - all optional. timezone defaults to "auto", which
// makes Open-Meteo localize the hours to the point's own zone and report
// it back; the other defaults mainly let tests call fetchForecast() bare.
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
  timezone?: string;
  utc_offset_seconds?: number;
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
  timezone = "auto",
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
      sunriseHm: data.daily.sunrise[i]!.slice(11, 16),
      sunsetHm: data.daily.sunset[i]!.slice(11, 16),
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
      sunrise: window?.sunriseHm ?? "",
      sunset: window?.sunsetHm ?? "",
    };
  });

  // With "auto" the zone comes back in the response; otherwise it's what was asked for.
  const resolvedTimezone = data.timezone || (timezone !== "auto" ? timezone : LOCATION.timezone);
  return { hours, timezone: resolvedTimezone };
}
