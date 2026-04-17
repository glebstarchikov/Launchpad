import { test, expect, describe, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import { collectYesterdayActivity } from "../src/lib/cron.ts";

function createTestDb(): Database {
  const db = new Database(":memory:");
  db.run(`CREATE TABLE projects (
    id TEXT PRIMARY KEY, user_id TEXT NOT NULL, name TEXT NOT NULL,
    description TEXT, url TEXT, type TEXT DEFAULT 'for-profit',
    stage TEXT DEFAULT 'idea', tech_stack TEXT DEFAULT '[]',
    last_deployed INTEGER, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
    starred INTEGER DEFAULT 0, github_repo TEXT
  )`);
  db.run(`CREATE TABLE ideas (
    id TEXT PRIMARY KEY, user_id TEXT NOT NULL, title TEXT NOT NULL,
    body TEXT DEFAULT '', status TEXT DEFAULT 'raw',
    promoted_to_project_id TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
  )`);
  db.run(`CREATE TABLE launch_checklist (
    id TEXT PRIMARY KEY, project_id TEXT NOT NULL, item TEXT NOT NULL,
    completed INTEGER DEFAULT 0, created_at INTEGER NOT NULL,
    category TEXT, min_stage TEXT, sort_order INTEGER DEFAULT 0, priority TEXT
  )`);
  db.run(`CREATE TABLE tech_debt (
    id TEXT PRIMARY KEY, project_id TEXT NOT NULL, note TEXT NOT NULL,
    resolved INTEGER DEFAULT 0, created_at INTEGER NOT NULL,
    severity TEXT, category TEXT, effort TEXT
  )`);
  db.run(`CREATE TABLE notes (
    id TEXT PRIMARY KEY, project_id TEXT NOT NULL, content TEXT NOT NULL,
    is_build_log INTEGER DEFAULT 0, created_at INTEGER NOT NULL
  )`);
  return db;
}

describe("collectYesterdayActivity", () => {
  let testDb: Database;
  const userId = "user-1";
  const projectId = "proj-1";
  const dateStr = "2025-01-15";
  const dayStart = new Date(`${dateStr}T00:00:00`).getTime();
  const midDay = dayStart + 43200000;
  const dayBefore = dayStart - 43200000;

  beforeEach(() => {
    testDb = createTestDb();
    // Use dayBefore for timestamps so the project itself doesn't appear as "updated yesterday"
    testDb.run(
      "INSERT INTO projects (id, user_id, name, type, stage, tech_stack, created_at, updated_at) VALUES (?, ?, 'Test Project', 'for-profit', 'live', '[]', ?, ?)",
      [projectId, userId, dayBefore, dayBefore]
    );
  });

  test("returns all empty arrays when no activity", () => {
    const result = collectYesterdayActivity(userId, dateStr, testDb);
    expect(result.projectsUpdated).toHaveLength(0);
    expect(result.checklistCompleted).toHaveLength(0);
    expect(result.ideasCreated).toHaveLength(0);
    expect(result.techDebtAdded).toHaveLength(0);
    expect(result.notesAdded).toHaveLength(0);
  });

  test("includes ideas created during the day", () => {
    testDb.run(
      "INSERT INTO ideas VALUES ('idea-1', ?, 'Test idea', '', 'raw', null, ?, ?)",
      [userId, midDay, midDay]
    );
    const result = collectYesterdayActivity(userId, dateStr, testDb);
    expect(result.ideasCreated).toHaveLength(1);
    expect(result.ideasCreated[0].title).toBe("Test idea");
  });

  test("excludes ideas created before the day window", () => {
    testDb.run(
      "INSERT INTO ideas VALUES ('idea-old', ?, 'Old idea', '', 'raw', null, ?, ?)",
      [userId, dayBefore, dayBefore]
    );
    const result = collectYesterdayActivity(userId, dateStr, testDb);
    expect(result.ideasCreated).toHaveLength(0);
  });

  test("includes tech debt added during the day", () => {
    testDb.run(
      "INSERT INTO tech_debt VALUES ('debt-1', ?, 'Redis not pooled', 0, ?, null, null, null)",
      [projectId, midDay]
    );
    const result = collectYesterdayActivity(userId, dateStr, testDb);
    expect(result.techDebtAdded).toHaveLength(1);
    expect(result.techDebtAdded[0].note).toBe("Redis not pooled");
    expect(result.techDebtAdded[0].project_name).toBe("Test Project");
  });

  test("includes build log notes (is_build_log=1) during the day", () => {
    testDb.run(
      "INSERT INTO notes VALUES ('note-1', ?, 'Shipped auth refactor', 1, ?)",
      [projectId, midDay]
    );
    const result = collectYesterdayActivity(userId, dateStr, testDb);
    expect(result.notesAdded).toHaveLength(1);
    expect(result.notesAdded[0].content).toBe("Shipped auth refactor");
  });

  test("excludes regular notes (is_build_log=0)", () => {
    testDb.run(
      "INSERT INTO notes VALUES ('note-2', ?, 'A regular note', 0, ?)",
      [projectId, midDay]
    );
    const result = collectYesterdayActivity(userId, dateStr, testDb);
    expect(result.notesAdded).toHaveLength(0);
  });

  test("does not include another user's activity", () => {
    testDb.run(
      "INSERT INTO ideas VALUES ('idea-other', 'other-user', 'Other idea', '', 'raw', null, ?, ?)",
      [midDay, midDay]
    );
    const result = collectYesterdayActivity(userId, dateStr, testDb);
    expect(result.ideasCreated).toHaveLength(0);
  });
});
