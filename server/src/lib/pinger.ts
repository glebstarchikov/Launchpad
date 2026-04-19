export interface PingResult {
  ok: boolean;
  status_code?: number;
  response_time_ms?: number;
  error?: string;
}

type FetchFn = typeof fetch;

export async function pingProject(
  url: string,
  fetchImpl: FetchFn = fetch,
): Promise<PingResult> {
  const start = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const res = await fetchImpl(url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: { "User-Agent": "Launchpad-Monitor/1.0" },
    });
    const elapsed = Date.now() - start;
    return {
      ok: res.status >= 200 && res.status < 400,
      status_code: res.status,
      response_time_ms: elapsed,
    };
  } catch (err: unknown) {
    const isTimeout = err instanceof Error && (err.name === "AbortError" || err.name === "TimeoutError");
    const msg = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      error: isTimeout ? "timeout" : msg.slice(0, 200),
    };
  } finally {
    clearTimeout(timeout);
  }
}
