// UptimeRobot v2 API wrapper with 90-second in-memory cache.
// Fail-open: all errors return an empty map so the caller can skip the site-down category silently.

const API_URL = "https://api.uptimerobot.com/v2/getMonitors";
const CACHE_TTL_MS = 90_000;
const REQUEST_TIMEOUT_MS = 5_000;

export type MonitorStatus = "up" | "down" | "paused";

interface CacheEntry {
  data: Map<string, MonitorStatus>;
  fetched_at: number;
}

let cache: CacheEntry | null = null;
let inFlight: Promise<Map<string, MonitorStatus>> | null = null;

/**
 * Normalizes a URL for matching: lowercased, protocol stripped, trailing slash stripped.
 * Example: "https://Example.com/" → "example.com"
 */
export function normalizeUrl(url: string): string {
  return url
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/$/, "");
}

/**
 * Returns a Map of normalized URL → status. Empty map if API key missing,
 * API fails, or cache is cold and refresh fails.
 */
export async function getMonitorStatusMap(): Promise<Map<string, MonitorStatus>> {
  const apiKey = process.env.UPTIMEROBOT_API_KEY;
  if (!apiKey) return new Map();

  // Return fresh cache
  if (cache && Date.now() - cache.fetched_at < CACHE_TTL_MS) {
    return cache.data;
  }

  // Share in-flight refresh
  if (inFlight) return inFlight;

  inFlight = fetchAndCache(apiKey).finally(() => {
    inFlight = null;
  });
  return inFlight;
}

async function fetchAndCache(apiKey: string): Promise<Map<string, MonitorStatus>> {
  try {
    const body = new URLSearchParams({ api_key: apiKey, format: "json" });
    const res = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!res.ok) {
      console.warn(`[uptimerobot] HTTP ${res.status}, returning empty map`);
      return returnOrStale();
    }
    const json = await res.json() as { stat: string; monitors?: Array<{ url: string; status: number }> };
    if (json.stat !== "ok" || !Array.isArray(json.monitors)) {
      console.warn("[uptimerobot] API returned non-ok stat, returning empty map");
      return returnOrStale();
    }
    const map = new Map<string, MonitorStatus>();
    for (const m of json.monitors) {
      if (!m.url) continue;
      const status: MonitorStatus =
        m.status === 2 ? "up" :
        m.status === 8 || m.status === 9 ? "down" :
        "paused";
      map.set(normalizeUrl(m.url), status);
    }
    cache = { data: map, fetched_at: Date.now() };
    return map;
  } catch (err) {
    console.warn("[uptimerobot] fetch failed:", (err as Error).message);
    return returnOrStale();
  }
}

function returnOrStale(): Map<string, MonitorStatus> {
  // If we have stale cache, return it rather than nothing
  if (cache) return cache.data;
  return new Map();
}
