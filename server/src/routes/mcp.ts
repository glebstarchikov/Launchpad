import { Hono } from "hono";
import type { Database } from "bun:sqlite";
import { db as defaultDb } from "../db/index.ts";
import { dispatchMcpRequest, type McpRequest } from "../lib/mcp-protocol.ts";

interface McpRouterOptions {
  database?: Database;
  apiKey?: string;
}

function resolveUserId(database: Database): string | null {
  const email = process.env.LAUNCHPAD_USER_EMAIL;
  if (email) {
    const user = database.query<{ id: string }, [string]>("SELECT id FROM users WHERE email = ?").get(email);
    if (user) return user.id;
  }
  // Fall back to first user in DB (mirrors cron.ts behaviour; also lets tests
  // use an in-memory DB without needing to match the LAUNCHPAD_USER_EMAIL env var).
  const fallback = database.query<{ id: string }, []>("SELECT id FROM users LIMIT 1").get();
  return fallback?.id ?? null;
}

export function createMcpRouter(options: McpRouterOptions = {}): Hono {
  const router = new Hono();
  const database = options.database ?? defaultDb;
  // options.apiKey wins over env so tests can inject deterministic values.
  const keyOverride = options.apiKey;

  router.post("/", async (c) => {
    const expectedKey = keyOverride !== undefined ? keyOverride : process.env.MCP_API_KEY;
    if (!expectedKey) return c.json({ error: "mcp not configured" }, 503);
    const header = c.req.header("Authorization") ?? "";
    if (header !== `Bearer ${expectedKey}`) return c.json({ error: "unauthorized" }, 401);

    const userId = resolveUserId(database);
    if (!userId) return c.json({ error: "no user found" }, 503);

    let body: McpRequest;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "malformed json" }, 400);
    }

    const response = await dispatchMcpRequest(body, userId, database);
    return c.json(response);
  });

  return router;
}

// Default export: router wired to the real DB + process.env.MCP_API_KEY.
export default createMcpRouter();
