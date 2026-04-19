import { test, expect, describe, beforeEach, afterEach } from "bun:test";
import { Hono } from "hono";

import { createMcpRouter } from "../src/routes/mcp.ts";
import { Database } from "bun:sqlite";
import { runMigrations } from "../src/db/migrations.ts";

function createTestDb(): Database {
  const db = new Database(":memory:");
  db.run("PRAGMA foreign_keys = ON");
  db.run(`CREATE TABLE users (id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, name TEXT NOT NULL, password_hash TEXT NOT NULL, created_at INTEGER NOT NULL)`);
  db.run(`CREATE TABLE projects (
    id TEXT PRIMARY KEY, user_id TEXT NOT NULL, name TEXT NOT NULL,
    description TEXT, url TEXT, type TEXT NOT NULL DEFAULT 'for-profit',
    stage TEXT NOT NULL DEFAULT 'idea', tech_stack TEXT NOT NULL DEFAULT '[]',
    last_deployed INTEGER, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
    starred INTEGER NOT NULL DEFAULT 0, github_repo TEXT
  )`);
  db.run(`CREATE TABLE notes (
    id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    content TEXT NOT NULL, is_build_log INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL
  )`);
  db.run(`CREATE TABLE tech_debt (
    id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    note TEXT NOT NULL, resolved INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL,
    severity TEXT, category TEXT, effort TEXT
  )`);
  db.run(`CREATE TABLE launch_checklist (
    id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    item TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL,
    category TEXT, min_stage TEXT, sort_order INTEGER NOT NULL DEFAULT 0, priority TEXT
  )`);
  db.run(`CREATE TABLE legal_items (
    id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    country_code TEXT NOT NULL, item TEXT NOT NULL,
    completed INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL
  )`);
  db.run(`CREATE TABLE goals (
    id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    description TEXT NOT NULL, target_value REAL NOT NULL,
    current_value REAL NOT NULL DEFAULT 0, unit TEXT, target_date INTEGER,
    completed INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL
  )`);
  db.run(`CREATE TABLE mrr_history (
    id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    recorded_at INTEGER NOT NULL, mrr REAL NOT NULL, user_count INTEGER NOT NULL DEFAULT 0
  )`);
  runMigrations(db);
  db.run("INSERT INTO users (id, email, name, password_hash, created_at) VALUES ('u1', 'test@example.com', 'Test', 'hash', 1000)");
  return db;
}

function buildApp(db: Database, apiKey: string | undefined) {
  const app = new Hono();
  app.route("/api/mcp", createMcpRouter({ database: db, apiKey }));
  return app;
}

let savedEmailEnv: string | undefined;

beforeEach(() => {
  savedEmailEnv = process.env.LAUNCHPAD_USER_EMAIL;
  delete process.env.LAUNCHPAD_USER_EMAIL;
});

afterEach(() => {
  if (savedEmailEnv !== undefined) {
    process.env.LAUNCHPAD_USER_EMAIL = savedEmailEnv;
  }
});

describe("POST /api/mcp — auth", () => {
  test("503 when MCP_API_KEY is not configured", async () => {
    const app = buildApp(createTestDb(), undefined);
    const res = await app.request("/api/mcp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }),
    });
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "mcp not configured" });
  });

  test("401 when Authorization header is missing", async () => {
    const app = buildApp(createTestDb(), "secret-key");
    const res = await app.request("/api/mcp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }),
    });
    expect(res.status).toBe(401);
  });

  test("401 when Authorization header has wrong key", async () => {
    const app = buildApp(createTestDb(), "secret-key");
    const res = await app.request("/api/mcp", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer wrong" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }),
    });
    expect(res.status).toBe(401);
  });

  test("200 when Authorization header matches", async () => {
    const app = buildApp(createTestDb(), "secret-key");
    const res = await app.request("/api/mcp", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer secret-key" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result.serverInfo.name).toBe("launchpad");
  });
});

describe("POST /api/mcp — end-to-end tools/call", () => {
  test("list_projects returns projects scoped to the resolved user", async () => {
    const db = createTestDb();
    db.run("INSERT INTO projects (id, user_id, name, stage, created_at, updated_at) VALUES ('p1','u1','Mine','live',1,1)");
    const app = buildApp(db, "secret-key");
    const res = await app.request("/api/mcp", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer secret-key" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "list_projects", arguments: {} } }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    const projects = JSON.parse(body.result.content[0].text);
    expect(projects).toHaveLength(1);
    expect(projects[0].name).toBe("Mine");
  });
});

describe("POST /api/mcp — content type", () => {
  test("response has application/json content-type", async () => {
    const app = buildApp(createTestDb(), "secret-key");
    const res = await app.request("/api/mcp", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer secret-key" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
    });
    expect(res.headers.get("content-type")).toContain("application/json");
  });
});

describe("POST /api/mcp — malformed body", () => {
  test("400 on non-JSON body", async () => {
    const app = buildApp(createTestDb(), "secret-key");
    const res = await app.request("/api/mcp", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer secret-key" },
      body: "not json",
    });
    expect(res.status).toBe(400);
  });
});
