import type { Database } from "bun:sqlite";
import { db as defaultDb } from "../db/index.ts";
import { getProjectOverview, projectOverviewToMarkdown } from "./context.ts";

function assertOwnership(database: Database, userId: string, projectId: string): void {
  const p = database.query<{ id: string }, [string, string]>(
    "SELECT id FROM projects WHERE id = ? AND user_id = ?",
  ).get(projectId, userId);
  if (!p) throw new Error("project not found");
}

function clamp(value: number | undefined, fallback: number, max: number): number {
  if (value === undefined) return fallback;
  if (value < 1) return fallback;
  return Math.min(value, max);
}

export function listProjects(
  userId: string,
  database: Database = defaultDb,
): Array<{ id: string; name: string; stage: string; url: string | null }> {
  return database.query<
    { id: string; name: string; stage: string; url: string | null },
    [string]
  >(
    "SELECT id, name, stage, url FROM projects WHERE user_id = ? ORDER BY name",
  ).all(userId);
}

export function getProjectOverviewText(
  userId: string,
  projectId: string,
  database: Database = defaultDb,
): string {
  const overview = getProjectOverview(userId, projectId, database);
  if (!overview) throw new Error("project not found");
  return projectOverviewToMarkdown(overview);
}

export function getBuildLog(
  userId: string,
  projectId: string,
  opts: { limit?: number; source?: "user" | "ai" },
  database: Database = defaultDb,
): Array<{ id: string; created_at: number; source: "user" | "ai"; content: string }> {
  assertOwnership(database, userId, projectId);
  const limit = clamp(opts.limit, 50, 500);
  if (opts.source) {
    return database.query<
      { id: string; created_at: number; source: "user" | "ai"; content: string },
      [string, "user" | "ai", number]
    >(
      `SELECT id, created_at, source, content FROM notes
       WHERE project_id = ? AND is_build_log = 1 AND source = ?
       ORDER BY created_at DESC LIMIT ?`,
    ).all(projectId, opts.source, limit);
  }
  return database.query<
    { id: string; created_at: number; source: "user" | "ai"; content: string },
    [string, number]
  >(
    `SELECT id, created_at, source, content FROM notes
     WHERE project_id = ? AND is_build_log = 1
     ORDER BY created_at DESC LIMIT ?`,
  ).all(projectId, limit);
}

export function getTechDebt(
  userId: string,
  projectId: string,
  opts: { status?: "open" | "resolved" | "all"; limit?: number },
  database: Database = defaultDb,
): Array<{
  id: string;
  note: string;
  resolved: 0 | 1;
  severity: string | null;
  category: string | null;
  effort: string | null;
  created_at: number;
}> {
  assertOwnership(database, userId, projectId);
  const limit = clamp(opts.limit, 200, 1000);
  const status = opts.status ?? "open";
  const whereStatus =
    status === "all" ? "" : status === "open" ? " AND resolved = 0" : " AND resolved = 1";
  return database.query(
    `SELECT id, note, resolved, severity, category, effort, created_at
     FROM tech_debt WHERE project_id = ?${whereStatus}
     ORDER BY created_at DESC LIMIT ?`,
  ).all(projectId, limit) as any;
}

export function getChecklist(
  userId: string,
  projectId: string,
  database: Database = defaultDb,
): Array<{
  id: string;
  item: string;
  completed: 0 | 1;
  category: string | null;
  priority: string | null;
  created_at: number;
}> {
  assertOwnership(database, userId, projectId);
  return database.query(
    `SELECT id, item, completed, category, priority, created_at
     FROM launch_checklist WHERE project_id = ?
     ORDER BY sort_order, created_at`,
  ).all(projectId) as any;
}

export function getLegal(
  userId: string,
  projectId: string,
  database: Database = defaultDb,
): Array<{ id: string; country_code: string; item: string; completed: 0 | 1; created_at: number }> {
  assertOwnership(database, userId, projectId);
  return database.query(
    `SELECT id, country_code, item, completed, created_at FROM legal_items
     WHERE project_id = ? ORDER BY country_code, created_at`,
  ).all(projectId) as any;
}

export function getGoals(
  userId: string,
  projectId: string,
  database: Database = defaultDb,
): Array<{
  id: string;
  description: string;
  target_value: number;
  current_value: number;
  unit: string | null;
  target_date: number | null;
  completed: 0 | 1;
  created_at: number;
}> {
  assertOwnership(database, userId, projectId);
  return database.query(
    `SELECT id, description, target_value, current_value, unit, target_date, completed, created_at
     FROM goals WHERE project_id = ? ORDER BY created_at DESC`,
  ).all(projectId) as any;
}

export function getMrr(
  userId: string,
  projectId: string,
  opts: { months?: number },
  database: Database = defaultDb,
): Array<{ recorded_at: number; mrr: number; user_count: number }> {
  assertOwnership(database, userId, projectId);
  if (opts.months && opts.months > 0) {
    const cutoff = Date.now() - opts.months * 30 * 24 * 60 * 60 * 1000;
    return database.query(
      `SELECT recorded_at, mrr, user_count FROM mrr_history
       WHERE project_id = ? AND recorded_at >= ?
       ORDER BY recorded_at DESC`,
    ).all(projectId, cutoff) as any;
  }
  return database.query(
    `SELECT recorded_at, mrr, user_count FROM mrr_history
     WHERE project_id = ? ORDER BY recorded_at DESC`,
  ).all(projectId) as any;
}

export async function getGithubCommits(
  userId: string,
  projectId: string,
  opts: { since?: string },
  database: Database = defaultDb,
): Promise<Array<{ sha: string; message: string; author: string; date: string }>> {
  assertOwnership(database, userId, projectId);
  const p = database.query<{ github_repo: string | null }, [string]>(
    "SELECT github_repo FROM projects WHERE id = ?",
  ).get(projectId);
  if (!p || !p.github_repo) return [];
  const { getCommits } = await import("./github.ts");
  const since = opts.since ?? new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
  return await getCommits(p.github_repo, since);
}

export function getSiteHealth(
  userId: string,
  projectId: string,
  database: Database = defaultDb,
): { status: "up" | "down" | "unknown"; last_check_at: number | null; last_error: string | null } {
  assertOwnership(database, userId, projectId);
  const row = database.query<
    { last_status: "up" | "down"; last_check_at: number; last_error: string | null },
    [string]
  >(
    "SELECT last_status, last_check_at, last_error FROM site_checks WHERE project_id = ?",
  ).get(projectId);
  if (!row) return { status: "unknown", last_check_at: null, last_error: null };
  return { status: row.last_status, last_check_at: row.last_check_at, last_error: row.last_error };
}
