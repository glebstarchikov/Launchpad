import type { Database } from "bun:sqlite";

interface Migration {
  version: number;
  up: (db: Database) => void;
}

const migrations: Migration[] = [
  {
    // v1: catch-up for columns added after initial release via ALTER TABLE
    // try/catch per ALTER — existing DBs may already have these columns
    version: 1,
    up: (db) => {
      const alters = [
        `ALTER TABLE projects ADD COLUMN starred INTEGER NOT NULL DEFAULT 0`,
        `ALTER TABLE projects ADD COLUMN github_repo TEXT`,
        `ALTER TABLE tech_debt ADD COLUMN severity TEXT`,
        `ALTER TABLE tech_debt ADD COLUMN category TEXT`,
        `ALTER TABLE tech_debt ADD COLUMN effort TEXT`,
        `ALTER TABLE launch_checklist ADD COLUMN category TEXT`,
        `ALTER TABLE launch_checklist ADD COLUMN min_stage TEXT`,
        `ALTER TABLE launch_checklist ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0`,
        `ALTER TABLE launch_checklist ADD COLUMN priority TEXT`,
        `ALTER TABLE legal_items ADD COLUMN priority TEXT`,
        `ALTER TABLE legal_items ADD COLUMN category TEXT`,
        `ALTER TABLE legal_items ADD COLUMN why TEXT`,
        `ALTER TABLE legal_items ADD COLUMN action TEXT`,
        `ALTER TABLE legal_items ADD COLUMN resources TEXT`,
        `ALTER TABLE legal_items ADD COLUMN scope TEXT NOT NULL DEFAULT 'country'`,
        `ALTER TABLE legal_items ADD COLUMN scope_code TEXT`,
        `ALTER TABLE legal_items ADD COLUMN last_reviewed_at INTEGER`,
        `ALTER TABLE legal_items ADD COLUMN status_note TEXT`,
      ];
      for (const sql of alters) {
        try { db.run(sql); } catch {}
      }
    },
  },
  {
    // v2: built-in site monitoring — per-project check state for pinger
    version: 2,
    up: (db) => {
      db.run(`
        CREATE TABLE IF NOT EXISTS site_checks (
          project_id TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
          last_check_at INTEGER NOT NULL,
          last_status TEXT NOT NULL,
          last_status_code INTEGER,
          last_response_time_ms INTEGER,
          last_error TEXT,
          consecutive_failures INTEGER NOT NULL DEFAULT 0,
          is_alerting INTEGER NOT NULL DEFAULT 0,
          went_down_at INTEGER,
          updated_at INTEGER NOT NULL
        )
      `);
      db.run(`
        CREATE INDEX IF NOT EXISTS idx_site_checks_alerting
          ON site_checks(is_alerting)
          WHERE is_alerting = 1
      `);
    },
  },
  {
    // v3: notes.source — distinguishes user-authored vs AI-authored build log entries
    version: 3,
    up: (db) => {
      db.run(
        `ALTER TABLE notes ADD COLUMN source TEXT NOT NULL DEFAULT 'user'
          CHECK (source IN ('user', 'ai'))`,
      );
    },
  },
];

export function runMigrations(db: Database): void {
  const row = db.query<{ user_version: number }, []>("PRAGMA user_version").get();
  const current = row?.user_version ?? 0;

  for (const migration of migrations) {
    if (migration.version <= current) continue;
    db.transaction(() => {
      migration.up(db);
      db.run(`PRAGMA user_version = ${migration.version}`);
    })();
    console.log(`[db] migration v${migration.version} applied`);
  }
}
