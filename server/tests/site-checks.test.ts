import { test, expect, describe, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import { runMigrations } from "../src/db/migrations.ts";
import { runSiteChecks } from "../src/lib/site-checks.ts";
import type { PingResult } from "../src/lib/pinger.ts";

function createTestDb(): Database {
  const db = new Database(":memory:");
  db.run("PRAGMA foreign_keys = ON");
  db.run(`CREATE TABLE projects (
    id TEXT PRIMARY KEY, user_id TEXT NOT NULL, name TEXT NOT NULL,
    url TEXT, stage TEXT NOT NULL
  )`);
  runMigrations(db);
  return db;
}

function insertProject(db: Database, id: string, url: string | null, stage: string) {
  db.run("INSERT INTO projects (id, user_id, name, url, stage) VALUES (?, ?, ?, ?, ?)",
    [id, "u1", `Project ${id}`, url, stage]);
}

function getCheck(db: Database, projectId: string) {
  return db.query<{
    last_status: string;
    consecutive_failures: number;
    is_alerting: number;
    went_down_at: number | null;
    last_error: string | null;
    last_status_code: number | null;
  }, [string]>("SELECT last_status, consecutive_failures, is_alerting, went_down_at, last_error, last_status_code FROM site_checks WHERE project_id = ?").get(projectId);
}

describe("runSiteChecks state machine", () => {
  let db: Database;
  let alerts: string[];
  const captureAlert = async (msg: string) => { alerts.push(msg); };
  const pingOk = async (): Promise<PingResult> => ({ ok: true, status_code: 200, response_time_ms: 42 });
  const pingFail500 = async (): Promise<PingResult> => ({ ok: false, status_code: 500, response_time_ms: 42 });
  const pingTimeout = async (): Promise<PingResult> => ({ ok: false, error: "timeout" });

  beforeEach(() => {
    db = createTestDb();
    alerts = [];
  });

  test("live project with successful ping → row created, no alert", async () => {
    insertProject(db, "p1", "https://example.com", "live");
    await runSiteChecks(db, pingOk, captureAlert);
    const row = getCheck(db, "p1");
    expect(row?.last_status).toBe("up");
    expect(row?.consecutive_failures).toBe(0);
    expect(row?.is_alerting).toBe(0);
    expect(alerts).toHaveLength(0);
  });

  test("single failure → row shows failure, no alert yet", async () => {
    insertProject(db, "p1", "https://example.com", "live");
    await runSiteChecks(db, pingFail500, captureAlert);
    const row = getCheck(db, "p1");
    expect(row?.last_status).toBe("down");
    expect(row?.consecutive_failures).toBe(1);
    expect(row?.is_alerting).toBe(0);
    expect(alerts).toHaveLength(0);
  });

  test("two consecutive failures → alert fires, is_alerting=1", async () => {
    insertProject(db, "p1", "https://example.com", "live");
    await runSiteChecks(db, pingFail500, captureAlert);
    await runSiteChecks(db, pingFail500, captureAlert);
    const row = getCheck(db, "p1");
    expect(row?.consecutive_failures).toBe(2);
    expect(row?.is_alerting).toBe(1);
    expect(row?.went_down_at).not.toBeNull();
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toContain("🔴");
    expect(alerts[0]).toContain("Project p1");
  });

  test("third failure after alerting → no duplicate alert", async () => {
    insertProject(db, "p1", "https://example.com", "live");
    await runSiteChecks(db, pingFail500, captureAlert);
    await runSiteChecks(db, pingFail500, captureAlert);
    await runSiteChecks(db, pingFail500, captureAlert);
    const row = getCheck(db, "p1");
    expect(row?.consecutive_failures).toBe(3);
    expect(row?.is_alerting).toBe(1);
    expect(alerts).toHaveLength(1);
  });

  test("recovery after alerting → recovery alert + is_alerting=0", async () => {
    insertProject(db, "p1", "https://example.com", "live");
    await runSiteChecks(db, pingFail500, captureAlert);
    await runSiteChecks(db, pingFail500, captureAlert);
    expect(alerts).toHaveLength(1);
    await runSiteChecks(db, pingOk, captureAlert);
    const row = getCheck(db, "p1");
    expect(row?.last_status).toBe("up");
    expect(row?.consecutive_failures).toBe(0);
    expect(row?.is_alerting).toBe(0);
    expect(row?.went_down_at).toBeNull();
    expect(alerts).toHaveLength(2);
    expect(alerts[1]).toContain("🟢");
    expect(alerts[1]).toContain("back up");
  });

  test("idea-stage project is not pinged", async () => {
    insertProject(db, "p1", "https://example.com", "idea");
    let pingCalls = 0;
    const countPing = async () => { pingCalls++; return pingOk(); };
    await runSiteChecks(db, countPing, captureAlert);
    expect(pingCalls).toBe(0);
    expect(getCheck(db, "p1")).toBeNull();
  });

  test("growing-stage project is pinged", async () => {
    insertProject(db, "p1", "https://example.com", "growing");
    await runSiteChecks(db, pingOk, captureAlert);
    expect(getCheck(db, "p1")?.last_status).toBe("up");
  });

  test("live project with null URL is skipped", async () => {
    insertProject(db, "p1", null, "live");
    let pingCalls = 0;
    const countPing = async () => { pingCalls++; return pingOk(); };
    await runSiteChecks(db, countPing, captureAlert);
    expect(pingCalls).toBe(0);
  });

  test("live project with empty-string URL is skipped", async () => {
    insertProject(db, "p1", "", "live");
    let pingCalls = 0;
    const countPing = async () => { pingCalls++; return pingOk(); };
    await runSiteChecks(db, countPing, captureAlert);
    expect(pingCalls).toBe(0);
  });

  test("down alert message includes error reason", async () => {
    insertProject(db, "p1", "https://example.com", "live");
    await runSiteChecks(db, pingTimeout, captureAlert);
    await runSiteChecks(db, pingTimeout, captureAlert);
    expect(alerts[0]).toContain("timeout");
  });

  test("last_error persists on failure, cleared implicitly on success", async () => {
    insertProject(db, "p1", "https://example.com", "live");
    await runSiteChecks(db, pingTimeout, captureAlert);
    expect(getCheck(db, "p1")?.last_error).toBe("timeout");
    await runSiteChecks(db, pingOk, captureAlert);
    expect(getCheck(db, "p1")?.last_error).toBeNull();
  });

  test("stage transition out of live/growing deletes stale site_checks row", async () => {
    insertProject(db, "p1", "https://example.com", "live");
    await runSiteChecks(db, pingFail500, captureAlert);
    await runSiteChecks(db, pingFail500, captureAlert);
    expect(getCheck(db, "p1")?.is_alerting).toBe(1);
    // User moves project to sunset — the stale is_alerting=1 row should not linger.
    db.run("UPDATE projects SET stage = 'sunset' WHERE id = 'p1'");
    await runSiteChecks(db, pingOk, captureAlert);
    expect(getCheck(db, "p1")).toBeNull();
  });

  test("project name with markdown chars is escaped in alerts", async () => {
    // Raw name would crash Telegram's Markdown parser: _bold_ *star* `code`
    db.run("INSERT INTO projects (id, user_id, name, url, stage) VALUES (?, ?, ?, ?, ?)",
      ["p1", "u1", "My_Project*v2`beta`", "https://example.com", "live"]);
    await runSiteChecks(db, pingFail500, captureAlert);
    await runSiteChecks(db, pingFail500, captureAlert);
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toContain("My\\_Project\\*v2\\`beta\\`");
  });
});
