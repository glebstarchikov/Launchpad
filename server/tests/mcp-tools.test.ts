import { test, expect, describe } from "bun:test";
import { Database } from "bun:sqlite";
import { runMigrations } from "../src/db/migrations.ts";
import {
  listProjects,
  getProjectOverviewText,
  getBuildLog,
  getTechDebt,
  getChecklist,
  getLegal,
  getGoals,
  getMrr,
  getSiteHealth,
  getGithubCommits,
  appendBuildLog,
  addTechDebt,
} from "../src/lib/mcp-tools.ts";

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
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    is_build_log INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
  )`);
  db.run(`CREATE TABLE tech_debt (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    note TEXT NOT NULL, resolved INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL, severity TEXT, category TEXT, effort TEXT
  )`);
  db.run(`CREATE TABLE launch_checklist (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    item TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL, category TEXT, min_stage TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0, priority TEXT
  )`);
  db.run(`CREATE TABLE legal_items (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    country_code TEXT NOT NULL, item TEXT NOT NULL,
    completed INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL
  )`);
  db.run(`CREATE TABLE goals (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    description TEXT NOT NULL, target_value REAL NOT NULL,
    current_value REAL NOT NULL DEFAULT 0, unit TEXT, target_date INTEGER,
    completed INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL
  )`);
  db.run(`CREATE TABLE mrr_history (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    recorded_at INTEGER NOT NULL, mrr REAL NOT NULL, user_count INTEGER NOT NULL DEFAULT 0
  )`);
  runMigrations(db);
  return db;
}

function insertProject(db: Database, id: string, userId: string, name = `Project ${id}`, stage = "live", url: string | null = null) {
  db.run(
    `INSERT INTO projects (id, user_id, name, stage, url, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 1000, 1000)`,
    [id, userId, name, stage, url],
  );
}

describe("listProjects", () => {
  test("returns only projects owned by userId", () => {
    const db = createTestDb();
    insertProject(db, "p1", "u1", "Alpha", "live", "https://a.example");
    insertProject(db, "p2", "u1", "Beta", "idea");
    insertProject(db, "p3", "u2", "OtherUser");
    const result = listProjects("u1", db);
    expect(result).toHaveLength(2);
    expect(result.map(r => r.id).sort()).toEqual(["p1", "p2"]);
    expect(result.find(r => r.id === "p1")).toEqual({ id: "p1", name: "Alpha", stage: "live", url: "https://a.example" });
  });

  test("returns empty array when user has no projects", () => {
    const db = createTestDb();
    expect(listProjects("u1", db)).toEqual([]);
  });
});

describe("getProjectOverviewText", () => {
  test("returns markdown overview for owned project", () => {
    const db = createTestDb();
    insertProject(db, "p1", "u1", "My SaaS");
    const md = getProjectOverviewText("u1", "p1", db);
    expect(md).toContain("# Project: My SaaS");
    expect(md).toContain("<project>");
  });

  test("throws 'project not found' for other user's project", () => {
    const db = createTestDb();
    insertProject(db, "p1", "u1");
    expect(() => getProjectOverviewText("u2", "p1", db)).toThrow("project not found");
  });

  test("throws 'project not found' for nonexistent project", () => {
    const db = createTestDb();
    expect(() => getProjectOverviewText("u1", "nope", db)).toThrow("project not found");
  });
});

describe("getBuildLog", () => {
  test("returns newest first, excludes non-build-log notes", () => {
    const db = createTestDb();
    insertProject(db, "p1", "u1");
    db.run("INSERT INTO notes (id, project_id, content, is_build_log, created_at, source) VALUES ('n1','p1','a',1,1000,'user'), ('n2','p1','b',0,2000,'user'), ('n3','p1','c',1,3000,'ai')");
    const result = getBuildLog("u1", "p1", {}, db);
    expect(result).toHaveLength(2);
    expect(result[0].content).toBe("c");
    expect(result[0].source).toBe("ai");
    expect(result[1].content).toBe("a");
  });

  test("source='ai' filter returns only AI entries", () => {
    const db = createTestDb();
    insertProject(db, "p1", "u1");
    db.run("INSERT INTO notes (id, project_id, content, is_build_log, created_at, source) VALUES ('n1','p1','user-one',1,1000,'user'), ('n2','p1','ai-one',1,2000,'ai')");
    const result = getBuildLog("u1", "p1", { source: "ai" }, db);
    expect(result).toHaveLength(1);
    expect(result[0].content).toBe("ai-one");
  });

  test("default limit is 50", () => {
    const db = createTestDb();
    insertProject(db, "p1", "u1");
    for (let i = 0; i < 60; i++) {
      db.run("INSERT INTO notes (id, project_id, content, is_build_log, created_at) VALUES (?, 'p1', ?, 1, ?)", [`n${i}`, `c${i}`, i]);
    }
    expect(getBuildLog("u1", "p1", {}, db)).toHaveLength(50);
  });

  test("limit is clamped to max 500", () => {
    const db = createTestDb();
    insertProject(db, "p1", "u1");
    for (let i = 0; i < 600; i++) {
      db.run("INSERT INTO notes (id, project_id, content, is_build_log, created_at) VALUES (?, 'p1', ?, 1, ?)", [`n${i}`, `c${i}`, i]);
    }
    expect(getBuildLog("u1", "p1", { limit: 10_000 }, db)).toHaveLength(500);
  });

  test("throws for other user's project", () => {
    const db = createTestDb();
    insertProject(db, "p1", "u1");
    expect(() => getBuildLog("u2", "p1", {}, db)).toThrow("project not found");
  });
});

describe("getTechDebt", () => {
  test("default returns open items only", () => {
    const db = createTestDb();
    insertProject(db, "p1", "u1");
    db.run("INSERT INTO tech_debt (id, project_id, note, resolved, created_at) VALUES ('d1','p1','a',0,1), ('d2','p1','b',1,2)");
    const result = getTechDebt("u1", "p1", {}, db);
    expect(result).toHaveLength(1);
    expect(result[0].note).toBe("a");
  });

  test("status='resolved' returns only resolved", () => {
    const db = createTestDb();
    insertProject(db, "p1", "u1");
    db.run("INSERT INTO tech_debt (id, project_id, note, resolved, created_at) VALUES ('d1','p1','a',0,1), ('d2','p1','b',1,2)");
    const result = getTechDebt("u1", "p1", { status: "resolved" }, db);
    expect(result).toHaveLength(1);
    expect(result[0].note).toBe("b");
  });

  test("status='all' returns both", () => {
    const db = createTestDb();
    insertProject(db, "p1", "u1");
    db.run("INSERT INTO tech_debt (id, project_id, note, resolved, created_at) VALUES ('d1','p1','a',0,1), ('d2','p1','b',1,2)");
    expect(getTechDebt("u1", "p1", { status: "all" }, db)).toHaveLength(2);
  });

  test("throws for other user's project", () => {
    const db = createTestDb();
    insertProject(db, "p1", "u1");
    expect(() => getTechDebt("u2", "p1", {}, db)).toThrow("project not found");
  });

  test("default limit is 200", () => {
    const db = createTestDb();
    insertProject(db, "p1", "u1");
    for (let i = 0; i < 250; i++) {
      db.run(
        "INSERT INTO tech_debt (id, project_id, note, resolved, created_at) VALUES (?, 'p1', ?, 0, ?)",
        [`d${i}`, `note ${i}`, i],
      );
    }
    expect(getTechDebt("u1", "p1", {}, db)).toHaveLength(200);
  });
});

describe("getChecklist", () => {
  test("returns all items for owned project", () => {
    const db = createTestDb();
    insertProject(db, "p1", "u1");
    db.run("INSERT INTO launch_checklist (id, project_id, item, completed, created_at, sort_order) VALUES ('c1','p1','one',0,1,0), ('c2','p1','two',1,2,0)");
    const result = getChecklist("u1", "p1", db);
    expect(result).toHaveLength(2);
  });

  test("throws for other user's project", () => {
    const db = createTestDb();
    insertProject(db, "p1", "u1");
    expect(() => getChecklist("u2", "p1", db)).toThrow("project not found");
  });

  test("orders by sort_order then created_at", () => {
    const db = createTestDb();
    insertProject(db, "p1", "u1");
    db.run(
      `INSERT INTO launch_checklist (id, project_id, item, completed, created_at, sort_order) VALUES
        ('c1','p1','third',0,5,2),
        ('c2','p1','first',0,10,0),
        ('c3','p1','second',0,1,1)`,
    );
    const result = getChecklist("u1", "p1", db);
    expect(result.map(r => r.item)).toEqual(["first", "second", "third"]);
  });
});

describe("getLegal", () => {
  test("returns all legal items for owned project", () => {
    const db = createTestDb();
    insertProject(db, "p1", "u1");
    db.run("INSERT INTO legal_items (id, project_id, country_code, item, completed, created_at) VALUES ('l1','p1','US','a',0,1)");
    expect(getLegal("u1", "p1", db)).toHaveLength(1);
  });

  test("throws for other user's project", () => {
    const db = createTestDb();
    insertProject(db, "p1", "u1");
    expect(() => getLegal("u2", "p1", db)).toThrow("project not found");
  });
});

describe("getGoals", () => {
  test("returns goals with current vs target", () => {
    const db = createTestDb();
    insertProject(db, "p1", "u1");
    db.run("INSERT INTO goals (id, project_id, description, target_value, current_value, completed, created_at) VALUES ('g1','p1','MRR',1000,500,0,1)");
    const result = getGoals("u1", "p1", db);
    expect(result[0]).toMatchObject({ description: "MRR", target_value: 1000, current_value: 500, completed: 0 });
  });

  test("throws for other user's project", () => {
    const db = createTestDb();
    insertProject(db, "p1", "u1");
    expect(() => getGoals("u2", "p1", db)).toThrow("project not found");
  });
});

describe("getMrr", () => {
  test("returns history ordered newest first", () => {
    const db = createTestDb();
    insertProject(db, "p1", "u1");
    db.run("INSERT INTO mrr_history (id, project_id, recorded_at, mrr, user_count) VALUES ('m1','p1',1000,100,5), ('m2','p1',2000,200,10)");
    const result = getMrr("u1", "p1", {}, db);
    expect(result).toHaveLength(2);
    expect(result[0].mrr).toBe(200);
  });

  test("months filter clamps by time window", () => {
    const db = createTestDb();
    insertProject(db, "p1", "u1");
    const now = Date.now();
    const sixMonthsAgo = now - 180 * 24 * 60 * 60 * 1000;
    const twoMonthsAgo = now - 60 * 24 * 60 * 60 * 1000;
    db.run("INSERT INTO mrr_history (id, project_id, recorded_at, mrr, user_count) VALUES (?, 'p1', ?, 100, 5), (?, 'p1', ?, 200, 10)", ["m1", sixMonthsAgo, "m2", twoMonthsAgo]);
    expect(getMrr("u1", "p1", { months: 3 }, db)).toHaveLength(1);
  });

  test("throws for other user's project", () => {
    const db = createTestDb();
    insertProject(db, "p1", "u1");
    expect(() => getMrr("u2", "p1", {}, db)).toThrow("project not found");
  });
});

describe("getSiteHealth", () => {
  test("returns 'unknown' when no site_checks row", () => {
    const db = createTestDb();
    insertProject(db, "p1", "u1");
    expect(getSiteHealth("u1", "p1", db)).toEqual({ status: "unknown", last_check_at: null, last_error: null });
  });

  test("reflects site_checks row when present", () => {
    const db = createTestDb();
    insertProject(db, "p1", "u1");
    db.run(`INSERT INTO site_checks (project_id, last_check_at, last_status, last_error, consecutive_failures, is_alerting, updated_at)
            VALUES ('p1', 5000, 'up', null, 0, 0, 5000)`);
    expect(getSiteHealth("u1", "p1", db)).toEqual({ status: "up", last_check_at: 5000, last_error: null });
  });

  test("throws for other user's project", () => {
    const db = createTestDb();
    insertProject(db, "p1", "u1");
    expect(() => getSiteHealth("u2", "p1", db)).toThrow("project not found");
  });
});

describe("getGithubCommits", () => {
  test("returns [] when project has no github_repo set", async () => {
    const db = createTestDb();
    insertProject(db, "p1", "u1");
    const result = await getGithubCommits("u1", "p1", {}, db);
    expect(result).toEqual([]);
  });

  test("throws 'project not found' for other user's project", async () => {
    const db = createTestDb();
    insertProject(db, "p1", "u1");
    await expect(getGithubCommits("u2", "p1", {}, db)).rejects.toThrow("project not found");
  });
});

describe("appendBuildLog", () => {
  test("inserts a note with source='ai' and is_build_log=1", () => {
    const db = createTestDb();
    insertProject(db, "p1", "u1");
    const { id, created_at } = appendBuildLog("u1", "p1", "Something the AI did", db);
    expect(id).toBeTypeOf("string");
    expect(created_at).toBeTypeOf("number");
    const row = db.query<
      { content: string; is_build_log: number; source: string },
      [string]
    >("SELECT content, is_build_log, source FROM notes WHERE id = ?").get(id);
    expect(row).toEqual({ content: "Something the AI did", is_build_log: 1, source: "ai" });
  });

  test("new entry shows up in getBuildLog with source='ai'", () => {
    const db = createTestDb();
    insertProject(db, "p1", "u1");
    appendBuildLog("u1", "p1", "first ai entry", db);
    const log = getBuildLog("u1", "p1", {}, db);
    expect(log[0]).toMatchObject({ content: "first ai entry", source: "ai" });
  });

  test("throws 'project not found' for other user's project", () => {
    const db = createTestDb();
    insertProject(db, "p1", "u1");
    expect(() => appendBuildLog("u2", "p1", "x", db)).toThrow("project not found");
  });

  test("rejects empty content", () => {
    const db = createTestDb();
    insertProject(db, "p1", "u1");
    expect(() => appendBuildLog("u1", "p1", "", db)).toThrow("content is required");
    expect(() => appendBuildLog("u1", "p1", "   ", db)).toThrow("content is required");
  });
});

describe("addTechDebt", () => {
  test("inserts a tech_debt row AND a build-log note in one transaction", () => {
    const db = createTestDb();
    insertProject(db, "p1", "u1");
    const { id, note_id } = addTechDebt(
      "u1", "p1", "refactor auth middleware",
      { severity: "medium", category: "code" }, db,
    );
    expect(id).toBeTypeOf("string");
    expect(note_id).toBeTypeOf("string");

    const debt = db.query<
      { note: string; severity: string; category: string | null; resolved: number },
      [string]
    >("SELECT note, severity, category, resolved FROM tech_debt WHERE id = ?").get(id);
    expect(debt).toEqual({ note: "refactor auth middleware", severity: "medium", category: "code", resolved: 0 });

    const logRow = db.query<
      { content: string; source: string; is_build_log: number },
      [string]
    >("SELECT content, source, is_build_log FROM notes WHERE id = ?").get(note_id);
    expect(logRow).toEqual({
      content: "AI added tech debt: refactor auth middleware",
      source: "ai",
      is_build_log: 1,
    });
  });

  test("rolls back both inserts when the second write throws", () => {
    const db = createTestDb();
    insertProject(db, "p1", "u1");

    // Wrap db.run in a counting spy that throws on the Nth call.
    // We want the tech_debt INSERT to succeed, then make the notes INSERT blow up.
    const originalRun = db.run.bind(db);
    let runCount = 0;
    (db as any).run = (...args: any[]) => {
      runCount++;
      if (runCount === 2) throw new Error("simulated failure on notes insert");
      return originalRun(...args);
    };

    expect(() =>
      addTechDebt("u1", "p1", "bad write", {}, db),
    ).toThrow("simulated failure");

    (db as any).run = originalRun;

    const debtCount = db.query<{ c: number }, []>("SELECT COUNT(*) as c FROM tech_debt").get()!.c;
    const noteCount = db.query<{ c: number }, []>("SELECT COUNT(*) as c FROM notes").get()!.c;
    expect(debtCount).toBe(0);
    expect(noteCount).toBe(0);
  });

  test("throws 'project not found' for other user's project", () => {
    const db = createTestDb();
    insertProject(db, "p1", "u1");
    expect(() => addTechDebt("u2", "p1", "x", {}, db)).toThrow("project not found");
  });

  test("rejects empty note", () => {
    const db = createTestDb();
    insertProject(db, "p1", "u1");
    expect(() => addTechDebt("u1", "p1", "   ", {}, db)).toThrow("note is required");
  });

  test("works with all optional fields omitted", () => {
    const db = createTestDb();
    insertProject(db, "p1", "u1");
    const { id } = addTechDebt("u1", "p1", "minimal", {}, db);
    const row = db.query<
      { severity: string | null; category: string | null; effort: string | null },
      [string]
    >("SELECT severity, category, effort FROM tech_debt WHERE id = ?").get(id);
    expect(row).toEqual({ severity: null, category: null, effort: null });
  });
});
