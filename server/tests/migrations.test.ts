import { test, expect, describe } from "bun:test";
import { Database } from "bun:sqlite";
import { runMigrations } from "../src/db/migrations.ts";

describe("migrations v2: site_checks table", () => {
  test("runMigrations creates site_checks table with expected columns", () => {
    const db = new Database(":memory:");
    db.run(`CREATE TABLE projects (id TEXT PRIMARY KEY)`);

    runMigrations(db);

    const userVersion = db.query<{ user_version: number }, []>("PRAGMA user_version").get();
    expect(userVersion?.user_version).toBeGreaterThanOrEqual(2);

    const columns = db.query<{ name: string; type: string; notnull: number; pk: number }, []>(
      "PRAGMA table_info(site_checks)"
    ).all();
    const colNames = columns.map((c) => c.name).sort();

    expect(colNames).toEqual([
      "consecutive_failures",
      "is_alerting",
      "last_check_at",
      "last_error",
      "last_response_time_ms",
      "last_status",
      "last_status_code",
      "project_id",
      "updated_at",
      "went_down_at",
    ]);

    const pkCol = columns.find((c) => c.pk === 1);
    expect(pkCol?.name).toBe("project_id");
  });

  test("site_checks row is deleted when project is deleted (ON DELETE CASCADE)", () => {
    const db = new Database(":memory:");
    db.run("PRAGMA foreign_keys = ON");
    db.run(`CREATE TABLE projects (id TEXT PRIMARY KEY)`);
    runMigrations(db);

    db.run("INSERT INTO projects (id) VALUES ('p1')");
    db.run(
      `INSERT INTO site_checks
       (project_id, last_check_at, last_status, consecutive_failures, is_alerting, updated_at)
       VALUES ('p1', 1000, 'up', 0, 0, 1000)`
    );

    expect(db.query("SELECT COUNT(*) as c FROM site_checks").get()).toEqual({ c: 1 });

    db.run("DELETE FROM projects WHERE id = 'p1'");

    expect(db.query("SELECT COUNT(*) as c FROM site_checks").get()).toEqual({ c: 0 });
  });
});
