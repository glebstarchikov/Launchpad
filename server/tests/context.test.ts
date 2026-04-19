import { test, expect, describe, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import { runMigrations } from "../src/db/migrations.ts";
import { getProjectOverview, projectOverviewToMarkdown } from "../src/lib/context.ts";

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
  runMigrations(db); // creates site_checks + adds notes.source
  return db;
}

function insertProject(
  db: Database,
  id: string,
  userId: string,
  overrides: Partial<{ name: string; description: string | null; url: string | null; stage: string; type: string; tech_stack: string }> = {},
) {
  db.run(
    `INSERT INTO projects (id, user_id, name, description, url, type, stage, tech_stack, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id, userId,
      overrides.name ?? `Project ${id}`,
      overrides.description ?? null,
      overrides.url ?? null,
      overrides.type ?? "for-profit",
      overrides.stage ?? "live",
      overrides.tech_stack ?? "[]",
      1000, 1000,
    ],
  );
}

describe("getProjectOverview", () => {
  let db: Database;
  beforeEach(() => { db = createTestDb(); });

  test("returns null when project does not exist", () => {
    expect(getProjectOverview("u1", "nonexistent", db)).toBeNull();
  });

  test("returns null when project belongs to a different user", () => {
    insertProject(db, "p1", "u1");
    expect(getProjectOverview("u2", "p1", db)).toBeNull();
  });

  test("returns project fields, zero counts, empty log, unknown health for a minimal project", () => {
    insertProject(db, "p1", "u1", {
      name: "My SaaS",
      description: "Subscription SaaS",
      url: "https://example.com",
      tech_stack: '["React","Bun"]',
    });
    const o = getProjectOverview("u1", "p1", db);
    expect(o).not.toBeNull();
    expect(o!.project.id).toBe("p1");
    expect(o!.project.name).toBe("My SaaS");
    expect(o!.project.description).toBe("Subscription SaaS");
    expect(o!.project.url).toBe("https://example.com");
    expect(o!.project.stage).toBe("live");
    expect(o!.project.tech_stack).toEqual(["React", "Bun"]);
    expect(o!.counts).toEqual({
      tech_debt_open: 0, tech_debt_resolved: 0,
      checklist_complete: 0, checklist_total: 0,
      legal_open: 0, legal_total: 0,
      goals_active: 0, goals_met: 0,
    });
    expect(o!.recent_build_log).toEqual([]);
    expect(o!.site_health.status).toBe("unknown");
    expect(o!.site_health.last_check_at).toBeNull();
  });

  test("counts reflect resolved/unresolved tech_debt", () => {
    insertProject(db, "p1", "u1");
    db.run("INSERT INTO tech_debt (id, project_id, note, resolved, created_at) VALUES ('d1','p1','a',0,1), ('d2','p1','b',0,2), ('d3','p1','c',1,3)");
    const o = getProjectOverview("u1", "p1", db)!;
    expect(o.counts.tech_debt_open).toBe(2);
    expect(o.counts.tech_debt_resolved).toBe(1);
  });

  test("counts reflect checklist completion", () => {
    insertProject(db, "p1", "u1");
    db.run("INSERT INTO launch_checklist (id, project_id, item, completed, created_at, sort_order) VALUES ('c1','p1','a',1,1,0), ('c2','p1','b',1,2,0), ('c3','p1','c',0,3,0)");
    const o = getProjectOverview("u1", "p1", db)!;
    expect(o.counts.checklist_complete).toBe(2);
    expect(o.counts.checklist_total).toBe(3);
  });

  test("counts reflect legal_items open/total", () => {
    insertProject(db, "p1", "u1");
    db.run("INSERT INTO legal_items (id, project_id, country_code, item, completed, created_at) VALUES ('l1','p1','US','a',0,1), ('l2','p1','US','b',1,2)");
    const o = getProjectOverview("u1", "p1", db)!;
    expect(o.counts.legal_open).toBe(1);
    expect(o.counts.legal_total).toBe(2);
  });

  test("counts reflect goals active vs met by current_value and completed flag", () => {
    insertProject(db, "p1", "u1");
    db.run(
      `INSERT INTO goals (id, project_id, description, target_value, current_value, completed, created_at) VALUES
        ('g1','p1','below',100,50,0,1),
        ('g2','p1','at',100,100,0,2),
        ('g3','p1','above',100,120,0,3),
        ('g4','p1','manually-completed',100,10,1,4)`,
    );
    const o = getProjectOverview("u1", "p1", db)!;
    expect(o.counts.goals_active).toBe(1); // only g1 (below target and not completed)
    expect(o.counts.goals_met).toBe(3);    // g2, g3 by numbers + g4 by completed flag
  });

  test("recent_build_log returns up to 3 entries, newest first, with source", () => {
    insertProject(db, "p1", "u1");
    db.run("INSERT INTO notes (id, project_id, content, is_build_log, created_at, source) VALUES ('n1','p1','first',1,1000,'user'), ('n2','p1','second',1,2000,'ai'), ('n3','p1','third',1,3000,'user'), ('n4','p1','fourth',1,4000,'ai')");
    const o = getProjectOverview("u1", "p1", db)!;
    expect(o.recent_build_log).toHaveLength(3);
    expect(o.recent_build_log[0]).toEqual({ created_at: 4000, source: "ai", content: "fourth" });
    expect(o.recent_build_log[1].content).toBe("third");
    expect(o.recent_build_log[2].content).toBe("second");
  });

  test("recent_build_log excludes non-build-log notes", () => {
    insertProject(db, "p1", "u1");
    db.run("INSERT INTO notes (id, project_id, content, is_build_log, created_at) VALUES ('n1','p1','regular',0,1000), ('n2','p1','buildlog',1,2000)");
    const o = getProjectOverview("u1", "p1", db)!;
    expect(o.recent_build_log).toHaveLength(1);
    expect(o.recent_build_log[0].content).toBe("buildlog");
  });

  test("site_health reflects site_checks row when present", () => {
    insertProject(db, "p1", "u1");
    db.run(
      `INSERT INTO site_checks (project_id, last_check_at, last_status, last_error, consecutive_failures, is_alerting, updated_at)
       VALUES ('p1', 5000, 'down', 'timeout', 2, 1, 5000)`,
    );
    const o = getProjectOverview("u1", "p1", db)!;
    expect(o.site_health.status).toBe("down");
    expect(o.site_health.last_check_at).toBe(5000);
    expect(o.site_health.last_error).toBe("timeout");
  });
});

describe("projectOverviewToMarkdown", () => {
  function fixtureOverview(overrides: any = {}): any {
    return {
      project: {
        id: "p1", name: "My SaaS", description: "Subscription SaaS",
        url: "https://example.com", type: "for-profit", stage: "live",
        tech_stack: ["React", "Bun"],
      },
      counts: {
        tech_debt_open: 5, tech_debt_resolved: 12,
        checklist_complete: 45, checklist_total: 57,
        legal_open: 2, legal_total: 10,
        goals_active: 3, goals_met: 1,
      },
      recent_build_log: [
        { created_at: Date.UTC(2026, 3, 19), source: "user", content: "Shipped v2" },
        { created_at: Date.UTC(2026, 3, 18), source: "ai", content: "AI observation" },
      ],
      site_health: { status: "up", last_check_at: Date.UTC(2026, 3, 19, 14, 30), last_error: null },
      ...overrides,
    };
  }

  test("produces XML-tagged sections with project, counts, recent_build_log, site_health", () => {
    const md = projectOverviewToMarkdown(fixtureOverview());
    expect(md).toContain("# Project: My SaaS");
    expect(md).toContain("<project>");
    expect(md).toContain("</project>");
    expect(md).toContain("<counts>");
    expect(md).toContain("<recent_build_log>");
    expect(md).toContain("<site_health>");
    expect(md).toContain("ID: p1");
    expect(md).toContain("Stage: live");
    expect(md).toContain("URL: https://example.com");
    expect(md).toContain("Tech: React, Bun");
    expect(md).toContain("Tech debt: 5 open · 12 resolved");
    expect(md).toContain("Checklist: 45/57 complete");
    expect(md).toContain("Legal: 2 open · 10 total");
    expect(md).toContain("Goals: 3 active · 1 met");
    expect(md).toContain("[user]: Shipped v2");
    expect(md).toContain("[ai]: AI observation");
    expect(md).toContain("Status: up");
  });

  test("is deterministic — same input produces same output", () => {
    const a = projectOverviewToMarkdown(fixtureOverview());
    const b = projectOverviewToMarkdown(fixtureOverview());
    expect(a).toBe(b);
  });

  test("omits Description block when description is null", () => {
    const md = projectOverviewToMarkdown(fixtureOverview({
      project: { ...fixtureOverview().project, description: null },
    }));
    expect(md).not.toContain("Description:");
  });

  test("renders '(none)' for empty tech_stack", () => {
    const md = projectOverviewToMarkdown(fixtureOverview({
      project: { ...fixtureOverview().project, tech_stack: [] },
    }));
    expect(md).toContain("Tech: (none)");
  });

  test("renders '(no build log entries)' when log is empty", () => {
    const md = projectOverviewToMarkdown(fixtureOverview({ recent_build_log: [] }));
    expect(md).toContain("(no build log entries)");
  });

  test("renders 'unknown' site health explanation when status is unknown", () => {
    const md = projectOverviewToMarkdown(fixtureOverview({
      site_health: { status: "unknown", last_check_at: null, last_error: null },
    }));
    expect(md).toContain("Status: unknown (project not monitored or never pinged)");
  });

  test("includes last_error line when site is down with an error", () => {
    const md = projectOverviewToMarkdown(fixtureOverview({
      site_health: { status: "down", last_check_at: Date.UTC(2026, 3, 19), last_error: "timeout" },
    }));
    expect(md).toContain("Status: down");
    expect(md).toContain("Last error: timeout");
  });
});
