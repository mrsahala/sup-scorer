// Fetches an hourly wind/temp forecast plus daily sunrise/sunset from
// Open-Meteo - free, keyless, no rate-limit auth needed.
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
  tempC: number;
  windKmh: number;
  gustKmh: number;
  // Meteorological convention: the direction the wind is blowing FROM
  // (0 = N, 90 = E, ...), not the direction it's heading towards.
  windDirDeg: number;
  weatherCode: number;
  isDaylight: boolean;
}

// One day's sunrise/sunset instants, used to tag each HourRow with
// isDaylight without re-deriving it per hour.
export interface DaylightWindow {
  sunrise: Date;
  sunset: Date;
}

// fetchForecast's return value: the mapped hourly rows, plus the raw
// sunrise/sunset lookup they were derived from (exposed in case a caller
// needs the daylight window itself, not just the isDaylight flag).
export interface ForecastResult {
  hours: HourRow[];
  daylightByDate: Map<string, DaylightWindow>;
}

// fetchForecast's params - all optional, each defaulting to config.ts's
// LOCATION/LOOKAHEAD_DAYS so a bare `fetchForecast()` fetches the default
// spot's forecast.
interface FetchForecastOptions {
  lat?: number;
  lon?: number;
  timezone?: string;
  days?: number;
}

// The shape of Open-Meteo's JSON response (only the fields this project
// actually requests/uses - Open-Meteo's real response has more).
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

// Fetches and maps one location's hourly forecast.
export async function fetchForecast({
  lat = LOCATION.lat,
  lon = LOCATION.lon,
  timezone = LOCATION.timezone,
  days = LOOKAHEAD_DAYS,
}: FetchForecastOptions = {}): Promise<ForecastResult> {
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", String(lat));
  url.searchParams.set("longitude", String(lon));
  url.searchParams.set("hourly", "temperature_2m,windspeed_10m,windgusts_10m,winddirection_10m,weathercode");
  url.searchParams.set("daily", "sunrise,sunset");
  url.searchParams.set("timezone", timezone);
  url.searchParams.set("forecast_days", String(days));
  url.searchParams.set("wind_speed_unit", "kmh");
  url.searchParams.set("temperature_unit", "celsius");

  const resp = await fetch(url);
  if (!resp.ok) {
    throw new Error(`Open-Meteo fetch failed: ${resp.status} ${await resp.text()}`);
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
      tempC: h.temperature_2m[i]!,
      windKmh: h.windspeed_10m[i]!,
      gustKmh: h.windgusts_10m[i]!,
      windDirDeg: h.winddirection_10m[i]!,
      weatherCode: h.weathercode[i]!,
      isDaylight,
    };
  });

  return { hours, daylightByDate };
}
