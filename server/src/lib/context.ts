import type { Database } from "bun:sqlite";
import { db as defaultDb } from "../db/index.ts";

export interface ProjectOverview {
  project: {
    id: string;
    name: string;
    description: string | null;
    url: string | null;
    type: string;
    stage: string;
    tech_stack: string[];
  };
  counts: {
    tech_debt_open: number;
    tech_debt_resolved: number;
    checklist_complete: number;
    checklist_total: number;
    legal_open: number;
    legal_total: number;
    goals_active: number;
    goals_met: number;
  };
  recent_build_log: Array<{
    created_at: number;
    source: "user" | "ai";
    content: string;
  }>;
  site_health: {
    status: "up" | "down" | "unknown";
    last_check_at: number | null;
    last_error: string | null;
  };
}

interface ProjectRow {
  id: string;
  name: string;
  description: string | null;
  url: string | null;
  type: string;
  stage: string;
  tech_stack: string;
}

function countOne(database: Database, sql: string, params: unknown[]): number {
  const row = database.query<{ c: number }, unknown[]>(sql).get(...params);
  return row?.c ?? 0;
}

export function getProjectOverview(
  userId: string,
  projectId: string,
  database: Database = defaultDb,
): ProjectOverview | null {
  const p = database.query<ProjectRow, [string, string]>(
    "SELECT id, name, description, url, type, stage, tech_stack FROM projects WHERE id = ? AND user_id = ?",
  ).get(projectId, userId);
  if (!p) return null;

  let tech_stack: string[] = [];
  try { tech_stack = JSON.parse(p.tech_stack); } catch { tech_stack = []; }
  if (!Array.isArray(tech_stack)) tech_stack = [];

  const tech_debt_open = countOne(database, "SELECT COUNT(*) as c FROM tech_debt WHERE project_id = ? AND resolved = 0", [projectId]);
  const tech_debt_resolved = countOne(database, "SELECT COUNT(*) as c FROM tech_debt WHERE project_id = ? AND resolved = 1", [projectId]);
  const checklist_complete = countOne(database, "SELECT COUNT(*) as c FROM launch_checklist WHERE project_id = ? AND completed = 1", [projectId]);
  const checklist_total = countOne(database, "SELECT COUNT(*) as c FROM launch_checklist WHERE project_id = ?", [projectId]);
  const legal_open = countOne(database, "SELECT COUNT(*) as c FROM legal_items WHERE project_id = ? AND completed = 0", [projectId]);
  const legal_total = countOne(database, "SELECT COUNT(*) as c FROM legal_items WHERE project_id = ?", [projectId]);
  const goals_active = countOne(database, "SELECT COUNT(*) as c FROM goals WHERE project_id = ? AND completed = 0 AND current_value < target_value", [projectId]);
  const goals_met = countOne(database, "SELECT COUNT(*) as c FROM goals WHERE project_id = ? AND (completed = 1 OR current_value >= target_value)", [projectId]);

  const recent_build_log = database.query<
    { created_at: number; source: "user" | "ai"; content: string },
    [string]
  >(
    `SELECT created_at, source, content FROM notes
     WHERE project_id = ? AND is_build_log = 1
     ORDER BY created_at DESC LIMIT 3`,
  ).all(projectId);

  const sc = database.query<
    { last_status: "up" | "down"; last_check_at: number; last_error: string | null },
    [string]
  >(
    "SELECT last_status, last_check_at, last_error FROM site_checks WHERE project_id = ?",
  ).get(projectId);

  const site_health: ProjectOverview["site_health"] = sc
    ? { status: sc.last_status, last_check_at: sc.last_check_at, last_error: sc.last_error }
    : { status: "unknown", last_check_at: null, last_error: null };

  return {
    project: {
      id: p.id,
      name: p.name,
      description: p.description,
      url: p.url,
      type: p.type,
      stage: p.stage,
      tech_stack,
    },
    counts: {
      tech_debt_open,
      tech_debt_resolved,
      checklist_complete,
      checklist_total,
      legal_open,
      legal_total,
      goals_active,
      goals_met,
    },
    recent_build_log,
    site_health,
  };
}

export function projectOverviewToMarkdown(o: ProjectOverview): string {
  const p = o.project;
  const techLine = `Tech: ${p.tech_stack.length > 0 ? p.tech_stack.join(", ") : "(none)"}`;
  const urlLine = p.url ? `URL: ${p.url}\n` : "";
  const descBlock = p.description ? `\nDescription:\n${p.description}\n` : "";

  const logBlock =
    o.recent_build_log.length === 0
      ? "(no build log entries)"
      : o.recent_build_log
          .map((e) => {
            const date = new Date(e.created_at).toISOString().split("T")[0];
            return `${date} [${e.source}]: ${e.content}`;
          })
          .join("\n");

  let healthBlock: string;
  if (o.site_health.status === "unknown") {
    healthBlock = "Status: unknown (project not monitored or never pinged)";
  } else {
    const ts = o.site_health.last_check_at
      ? new Date(o.site_health.last_check_at).toISOString()
      : "never";
    const errLine =
      o.site_health.status === "down" && o.site_health.last_error
        ? `\nLast error: ${o.site_health.last_error}`
        : "";
    healthBlock = `Status: ${o.site_health.status}\nLast check: ${ts}${errLine}`;
  }

  return `# Project: ${p.name}

<project>
ID: ${p.id}
Stage: ${p.stage}
${urlLine}Type: ${p.type}
${techLine}
${descBlock}</project>

<counts>
Tech debt: ${o.counts.tech_debt_open} open · ${o.counts.tech_debt_resolved} resolved
Checklist: ${o.counts.checklist_complete}/${o.counts.checklist_total} complete
Legal: ${o.counts.legal_open} open · ${o.counts.legal_total} total
Goals: ${o.counts.goals_active} active · ${o.counts.goals_met} met
</counts>

<recent_build_log>
${logBlock}
</recent_build_log>

<site_health>
${healthBlock}
</site_health>
`;
}
