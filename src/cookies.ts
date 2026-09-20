// sd_last/sd_spots cookie parsing and serialization. Parsing never throws on a hostile cookie - it's just "no cookie".
const SD_LAST = "sd_last";
const SD_SPOTS = "sd_spots";
const MAX_SPOTS = 8;
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

// sd_last: set by the server on every /conditions response.
export interface SdLast {
  name: string;
  lat: number;
  lon: number;
  gps: boolean;
}

// sd_spots: written by client JS, read here for chip rendering.
export interface SdSpot {
  name: string;
  lat: number;
  lon: number;
}

function isValidLat(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v) && v >= -90 && v <= 90;
}

function isValidLon(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v) && v >= -180 && v <= 180;
}

// Reads one cookie's raw value; a malformed percent-escape is treated as absent, not thrown.
function readCookie(cookieHeader: string | null, name: string): string | undefined {
  if (!cookieHeader) return undefined;
  for (const part of cookieHeader.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() !== name) continue;
    try {
      return decodeURIComponent(part.slice(eq + 1).trim());
    } catch {
      return undefined;
    }
  }
  return undefined;
}

export function parseSdLast(cookieHeader: string | null): SdLast | null {
  const raw = readCookie(cookieHeader, SD_LAST);
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Record<string, unknown>;
    if (v && typeof v === "object" && typeof v.name === "string" && isValidLat(v.lat) && isValidLon(v.lon)) {
      return { name: v.name, lat: v.lat, lon: v.lon, gps: Boolean(v.gps) };
    }
  } catch {
    // fall through
  }
  return null;
}

export function parseSdSpots(cookieHeader: string | null): SdSpot[] {
  const raw = readCookie(cookieHeader, SD_SPOTS);
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    if (!Array.isArray(v)) return [];
    const spots: SdSpot[] = [];
    for (const entry of v as unknown[]) {
      if (spots.length >= MAX_SPOTS) break;
      if (
        entry &&
        typeof entry === "object" &&
        typeof (entry as Record<string, unknown>).name === "string" &&
        isValidLat((entry as Record<string, unknown>).lat) &&
        isValidLon((entry as Record<string, unknown>).lon)
      ) {
        const e = entry as Record<string, unknown>;
        spots.push({ name: e.name as string, lat: e.lat as number, lon: e.lon as number });
      }
    }
    return spots;
  } catch {
    return [];
  }
}

// Set-Cookie value for sd_last - 1 year, Secure unless localhost (browsers reject it over plain http).
export function serializeSdLast(value: SdLast, { secure }: { secure: boolean }): string {
  const encoded = encodeURIComponent(JSON.stringify(value));
  const attrs = [`${SD_LAST}=${encoded}`, `Max-Age=${ONE_YEAR_SECONDS}`, "Path=/", "SameSite=Lax"];
  if (secure) attrs.push("Secure");
  return attrs.join("; ");
}

export function isLocalhost(url: URL): boolean {
  return url.hostname === "localhost" || url.hostname === "127.0.0.1";
}
