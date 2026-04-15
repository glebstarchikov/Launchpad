import { Database } from "bun:sqlite";

const dbPath = process.env.DATABASE_PATH ?? "./launchpad.db";
export const db = new Database(dbPath, { create: true });

db.run("PRAGMA journal_mode = WAL");
db.run("PRAGMA foreign_keys = ON");

db.run(`CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
)`);

db.run(`CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  url TEXT,
  type TEXT NOT NULL DEFAULT 'for-profit',
  stage TEXT NOT NULL DEFAULT 'idea',
  tech_stack TEXT NOT NULL DEFAULT '[]',
  last_deployed INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
)`);

try { db.run(`ALTER TABLE projects ADD COLUMN starred INTEGER NOT NULL DEFAULT 0`); } catch {}
try { db.run(`ALTER TABLE projects ADD COLUMN github_repo TEXT`); } catch {}
try { db.run(`ALTER TABLE tech_debt ADD COLUMN severity TEXT`); } catch {}
try { db.run(`ALTER TABLE tech_debt ADD COLUMN category TEXT`); } catch {}
try { db.run(`ALTER TABLE tech_debt ADD COLUMN effort TEXT`); } catch {}
try { db.run(`ALTER TABLE launch_checklist ADD COLUMN category TEXT`); } catch {}
try { db.run(`ALTER TABLE launch_checklist ADD COLUMN min_stage TEXT`); } catch {}
try { db.run(`ALTER TABLE launch_checklist ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0`); } catch {}
try { db.run(`ALTER TABLE legal_items ADD COLUMN priority TEXT`); } catch {}
try { db.run(`ALTER TABLE legal_items ADD COLUMN category TEXT`); } catch {}
try { db.run(`ALTER TABLE legal_items ADD COLUMN why TEXT`); } catch {}
try { db.run(`ALTER TABLE legal_items ADD COLUMN action TEXT`); } catch {}
try { db.run(`ALTER TABLE legal_items ADD COLUMN resources TEXT`); } catch {}
try { db.run(`ALTER TABLE legal_items ADD COLUMN scope TEXT NOT NULL DEFAULT 'country'`); } catch {}
try { db.run(`ALTER TABLE legal_items ADD COLUMN scope_code TEXT`); } catch {}
try { db.run(`ALTER TABLE legal_items ADD COLUMN last_reviewed_at INTEGER`); } catch {}
try { db.run(`ALTER TABLE legal_items ADD COLUMN status_note TEXT`); } catch {}

db.run(`CREATE TABLE IF NOT EXISTS project_links (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  url TEXT NOT NULL,
  icon TEXT
)`);

db.run(`CREATE TABLE IF NOT EXISTS project_countries (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  country_code TEXT NOT NULL,
  country_name TEXT NOT NULL
)`);

db.run(`CREATE TABLE IF NOT EXISTS legal_items (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  country_code TEXT NOT NULL,
  item TEXT NOT NULL,
  completed INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
)`);

db.run(`CREATE TABLE IF NOT EXISTS launch_checklist (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  item TEXT NOT NULL,
  completed INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
)`);

db.run(`CREATE TABLE IF NOT EXISTS mrr_history (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  mrr INTEGER NOT NULL,
  user_count INTEGER NOT NULL DEFAULT 0,
  recorded_at INTEGER NOT NULL
)`);

db.run(`CREATE TABLE IF NOT EXISTS goals (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  target_value REAL NOT NULL,
  current_value REAL NOT NULL DEFAULT 0,
  unit TEXT,
  target_date INTEGER,
  completed INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
)`);

db.run(`CREATE TABLE IF NOT EXISTS ideas (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'raw',
  promoted_to_project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
)`);

db.run(`CREATE TABLE IF NOT EXISTS notes (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  is_build_log INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
)`);

db.run(`CREATE TABLE IF NOT EXISTS tech_debt (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  note TEXT NOT NULL,
  resolved INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
)`);

db.run(`CREATE TABLE IF NOT EXISTS files (
  id TEXT PRIMARY KEY,
  project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  original_name TEXT NOT NULL,
  mimetype TEXT NOT NULL,
  size INTEGER NOT NULL,
  uploaded_at INTEGER NOT NULL
)`);

db.run(`CREATE TABLE IF NOT EXISTS daily_summaries (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  summary TEXT NOT NULL,
  activity_data TEXT NOT NULL,
  date TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE(user_id, date)
)`);

db.run(`CREATE TABLE IF NOT EXISTS news_sources (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  name TEXT NOT NULL,
  url TEXT,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL
)`);

db.run(`CREATE TABLE IF NOT EXISTS news_items (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source TEXT NOT NULL,
  source_id TEXT,
  title TEXT NOT NULL,
  url TEXT,
  summary TEXT,
  relevance_score REAL,
  relevance_reason TEXT,
  read INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
)`);

db.run("CREATE INDEX IF NOT EXISTS idx_projects_user_id ON projects(user_id)");
db.run("CREATE INDEX IF NOT EXISTS idx_project_links_project_id ON project_links(project_id)");
db.run("CREATE INDEX IF NOT EXISTS idx_project_countries_project_id ON project_countries(project_id)");
db.run("CREATE INDEX IF NOT EXISTS idx_legal_items_project_id ON legal_items(project_id)");
db.run("CREATE INDEX IF NOT EXISTS idx_launch_checklist_project_id ON launch_checklist(project_id)");
db.run("CREATE INDEX IF NOT EXISTS idx_mrr_history_project_id ON mrr_history(project_id)");
db.run("CREATE INDEX IF NOT EXISTS idx_goals_project_id ON goals(project_id)");
db.run("CREATE INDEX IF NOT EXISTS idx_ideas_user_id ON ideas(user_id)");
db.run("CREATE INDEX IF NOT EXISTS idx_notes_project_id ON notes(project_id)");
db.run("CREATE INDEX IF NOT EXISTS idx_tech_debt_project_id ON tech_debt(project_id)");
db.run("CREATE INDEX IF NOT EXISTS idx_files_project_id ON files(project_id)");
db.run("CREATE INDEX IF NOT EXISTS idx_files_user_id ON files(user_id)");
db.run("CREATE INDEX IF NOT EXISTS idx_daily_summaries_user_id ON daily_summaries(user_id)");
db.run("CREATE INDEX IF NOT EXISTS idx_news_sources_user_id ON news_sources(user_id)");
db.run("CREATE INDEX IF NOT EXISTS idx_news_items_user_id ON news_items(user_id)");
db.run("CREATE INDEX IF NOT EXISTS idx_news_items_source_id ON news_items(source_id)");
