import { test, expect, describe } from "bun:test";
import { Database } from "bun:sqlite";
import { runMigrations } from "../src/db/migrations.ts";
import { dispatchMcpRequest, type McpRequest } from "../src/lib/mcp-protocol.ts";

function createTestDb(): Database {
  const db = new Database(":memory:");
  db.run("PRAGMA foreign_keys = ON");
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
  return db;
}

describe("dispatchMcpRequest — initialize", () => {
  test("returns server info and tools capability", async () => {
    const db = createTestDb();
    const response = await dispatchMcpRequest(
      { jsonrpc: "2.0", id: 1, method: "initialize", params: {} } as McpRequest,
      "u1", db,
    );
    expect(response).toMatchObject({
      jsonrpc: "2.0",
      id: 1,
      result: {
        protocolVersion: "2024-11-05",
        serverInfo: { name: "launchpad", version: expect.any(String) },
        capabilities: { tools: {} },
      },
    });
  });
});

describe("dispatchMcpRequest — tools/list", () => {
  test("returns all 12 tools with names and descriptions", async () => {
    const db = createTestDb();
    const response = await dispatchMcpRequest(
      { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} } as McpRequest,
      "u1", db,
    );
    expect(response.result!.tools).toHaveLength(12);
    const names = response.result!.tools.map((t: any) => t.name).sort();
    expect(names).toEqual([
      "add_tech_debt",
      "append_build_log",
      "get_build_log",
      "get_checklist",
      "get_github_commits",
      "get_goals",
      "get_legal",
      "get_mrr",
      "get_project_overview",
      "get_site_health",
      "get_tech_debt",
      "list_projects",
    ]);
    for (const tool of response.result!.tools) {
      expect(tool.description).toBeTypeOf("string");
      expect(tool.description.length).toBeGreaterThan(10);
      expect(tool.inputSchema).toMatchObject({ type: "object" });
    }
  });
});

describe("dispatchMcpRequest — tools/call happy path", () => {
  test("list_projects returns JSON text content", async () => {
    const db = createTestDb();
    db.run("INSERT INTO projects (id, user_id, name, stage, created_at, updated_at) VALUES ('p1','u1','Alpha','live',1,1)");
    const response = await dispatchMcpRequest(
      { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "list_projects", arguments: {} } } as McpRequest,
      "u1", db,
    );
    expect(response.result!.content[0].type).toBe("text");
    const payload = JSON.parse(response.result!.content[0].text);
    expect(payload).toHaveLength(1);
    expect(payload[0].name).toBe("Alpha");
  });

  test("get_project_overview returns markdown content", async () => {
    const db = createTestDb();
    db.run("INSERT INTO projects (id, user_id, name, stage, created_at, updated_at) VALUES ('p1','u1','Alpha','live',1,1)");
    const response = await dispatchMcpRequest(
      { jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "get_project_overview", arguments: { project_id: "p1" } } } as McpRequest,
      "u1", db,
    );
    expect(response.result!.content[0].text).toContain("# Project: Alpha");
  });

  test("append_build_log writes and returns id", async () => {
    const db = createTestDb();
    db.run("INSERT INTO projects (id, user_id, name, stage, created_at, updated_at) VALUES ('p1','u1','Alpha','live',1,1)");
    const response = await dispatchMcpRequest(
      { jsonrpc: "2.0", id: 5, method: "tools/call", params: { name: "append_build_log", arguments: { project_id: "p1", content: "Did something" } } } as McpRequest,
      "u1", db,
    );
    const payload = JSON.parse(response.result!.content[0].text);
    expect(payload.id).toBeTypeOf("string");
    const noteCount = db.query<{ c: number }, []>("SELECT COUNT(*) as c FROM notes WHERE source = 'ai'").get()!.c;
    expect(noteCount).toBe(1);
  });
});

describe("dispatchMcpRequest — errors", () => {
  test("unknown method → -32601", async () => {
    const db = createTestDb();
    const response = await dispatchMcpRequest(
      { jsonrpc: "2.0", id: 1, method: "bogus/method", params: {} } as McpRequest,
      "u1", db,
    );
    expect(response.error).toMatchObject({ code: -32601, message: expect.stringContaining("method not found") });
  });

  test("unknown tool name → -32602", async () => {
    const db = createTestDb();
    const response = await dispatchMcpRequest(
      { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "bogus_tool", arguments: {} } } as McpRequest,
      "u1", db,
    );
    expect(response.error).toMatchObject({ code: -32602, message: expect.stringContaining("bogus_tool") });
  });

  test("invalid arguments (Zod failure) → -32602", async () => {
    const db = createTestDb();
    const response = await dispatchMcpRequest(
      { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "get_build_log", arguments: { /* missing project_id */ } } } as McpRequest,
      "u1", db,
    );
    expect(response.error).toMatchObject({ code: -32602 });
  });

  test("project not found → tool-level error (isError=true in result)", async () => {
    const db = createTestDb();
    const response = await dispatchMcpRequest(
      { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "get_build_log", arguments: { project_id: "nope" } } } as McpRequest,
      "u1", db,
    );
    expect(response.result).toMatchObject({
      isError: true,
      content: [{ type: "text", text: expect.stringContaining("project not found") }],
    });
  });

  test("missing jsonrpc field → -32600", async () => {
    const db = createTestDb();
    const response = await dispatchMcpRequest(
      { id: 1, method: "tools/list", params: {} } as any,
      "u1", db,
    );
    expect(response.error).toMatchObject({ code: -32600 });
  });
});
