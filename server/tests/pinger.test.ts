import { test, expect, describe } from "bun:test";
import { pingProject } from "../src/lib/pinger.ts";

function mockFetch(response: Response | Error): typeof fetch {
  return (async () => {
    if (response instanceof Error) throw response;
    return response;
  }) as unknown as typeof fetch;
}

describe("pingProject", () => {
  test("200 response is ok", async () => {
    const result = await pingProject("https://example.com", mockFetch(new Response("", { status: 200 })));
    expect(result.ok).toBe(true);
    expect(result.status_code).toBe(200);
    expect(result.response_time_ms).toBeGreaterThanOrEqual(0);
    expect(result.error).toBeUndefined();
  });

  test("301 redirect response is ok", async () => {
    const result = await pingProject("https://example.com", mockFetch(new Response("", { status: 301 })));
    expect(result.ok).toBe(true);
    expect(result.status_code).toBe(301);
  });

  test("404 response is not ok", async () => {
    const result = await pingProject("https://example.com", mockFetch(new Response("", { status: 404 })));
    expect(result.ok).toBe(false);
    expect(result.status_code).toBe(404);
    expect(result.error).toBeUndefined();
  });

  test("500 response is not ok", async () => {
    const result = await pingProject("https://example.com", mockFetch(new Response("", { status: 500 })));
    expect(result.ok).toBe(false);
    expect(result.status_code).toBe(500);
  });

  test("AbortError maps to timeout", async () => {
    const err = new Error("aborted");
    err.name = "AbortError";
    const result = await pingProject("https://example.com", mockFetch(err));
    expect(result.ok).toBe(false);
    expect(result.error).toBe("timeout");
    expect(result.status_code).toBeUndefined();
  });

  test("generic network error surfaces truncated message", async () => {
    const longMsg = "x".repeat(500);
    const result = await pingProject("https://example.com", mockFetch(new Error(longMsg)));
    expect(result.ok).toBe(false);
    expect(result.error).toHaveLength(200);
    expect(result.status_code).toBeUndefined();
  });
});
