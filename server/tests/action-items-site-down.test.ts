import { test, expect, describe, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import { runMigrations } from "../src/db/migrations.ts";

// This test guards the exact SQL query used in
// server/src/routes/misc.ts (GET /dashboard/action-items, site-down category).
// If that query diverges from this copy the test stays true but production
// drifts — so any change to the query must land in both places.
const SITE_DOWN_QUERY = `
  SELECT p.id, p.name, p.url FROM projects p
  JOIN site_checks s ON s.project_id = p.id
  WHERE p.user_id = ?
    AND p.stage IN ('live', 'growing')
    AND s.is_alerting = 1
`;

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

function insertProject(db: Database, id: string, userId: string, url: string | null, stage: string) {
  db.run(
    "INSERT INTO projects (id, user_id, name, url, stage) VALUES (?, ?, ?, ?, ?)",
    [id, userId, `Project ${id}`, url, stage],
  );
}

function insertCheck(db: Database, projectId: string, isAlerting: 0 | 1) {
  db.run(
    `INSERT INTO site_checks
       (project_id, last_check_at, last_status, consecutive_failures, is_alerting, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [projectId, 1000, isAlerting === 1 ? "down" : "up", isAlerting === 1 ? 2 : 0, isAlerting, 1000],
  );
}

describe("dashboard action-items: site-down SQL", () => {
  let db: Database;
  beforeEach(() => {
    db = createTestDb();
  });

  test("returns live project with is_alerting=1", () => {
    insertProject(db, "p1", "u1", "https://example.com", "live");
    insertCheck(db, "p1", 1);
    const rows = db.query<{ id: string; name: string; url: string | null }, [string]>(SITE_DOWN_QUERY).all("u1");
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe("p1");
    expect(rows[0]?.url).toBe("https://example.com");
  });

  test("returns growing project with is_alerting=1", () => {
    insertProject(db, "p1", "u1", "https://example.com", "growing");
    insertCheck(db, "p1", 1);
    const rows = db.query(SITE_DOWN_QUERY).all("u1");
    expect(rows).toHaveLength(1);
  });

  test("excludes live project with is_alerting=0", () => {
    insertProject(db, "p1", "u1", "https://example.com", "live");
    insertCheck(db, "p1", 0);
    const rows = db.query(SITE_DOWN_QUERY).all("u1");
    expect(rows).toHaveLength(0);
  });

  test("excludes project with no site_checks row (never pinged)", () => {
    insertProject(db, "p1", "u1", "https://example.com", "live");
    const rows = db.query(SITE_DOWN_QUERY).all("u1");
    expect(rows).toHaveLength(0);
  });

  test("excludes non-live/growing stages even if is_alerting=1 (stale state)", () => {
    insertProject(db, "p1", "u1", "https://example.com", "sunset");
    insertCheck(db, "p1", 1);
    const rows = db.query(SITE_DOWN_QUERY).all("u1");
    expect(rows).toHaveLength(0);
  });

  test("scopes to requesting user", () => {
    insertProject(db, "p1", "u1", "https://u1.example.com", "live");
    insertProject(db, "p2", "u2", "https://u2.example.com", "live");
    insertCheck(db, "p1", 1);
    insertCheck(db, "p2", 1);
    const u1Rows = db.query<{ id: string }, [string]>(SITE_DOWN_QUERY).all("u1");
    expect(u1Rows.map((r) => r.id)).toEqual(["p1"]);
    const u2Rows = db.query<{ id: string }, [string]>(SITE_DOWN_QUERY).all("u2");
    expect(u2Rows.map((r) => r.id)).toEqual(["p2"]);
  });
});
