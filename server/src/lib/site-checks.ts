import type { Database } from "bun:sqlite";
import { db as defaultDb } from "../db/index.ts";
import { sendMessage } from "./telegram.ts";
import { pingProject, type PingResult } from "./pinger.ts";

type PingFn = (url: string) => Promise<PingResult>;
type AlertFn = (msg: string) => Promise<void>;

// Escape Telegram legacy-Markdown reserved chars (_ * ` [) in user-controlled
// strings like project names/URLs — unescaped markdown causes Telegram to
// reject the message with HTTP 400, which then gets silently swallowed.
function escapeMd(s: string): string {
  return s.replace(/([_*`\[])/g, "\\$1");
}

interface ExistingCheck {
  consecutive_failures: number;
  is_alerting: number;
  went_down_at: number | null;
}

interface ProjectToCheck {
  id: string;
  name: string;
  url: string;
}

export async function runSiteChecks(
  database: Database = defaultDb,
  ping: PingFn = pingProject,
  alert: AlertFn = sendMessage,
): Promise<void> {
  // Drop stale rows for projects that are no longer monitored (stage moved out
  // of live/growing). Next time a project returns to live/growing, the state
  // machine starts fresh rather than resurrecting a stale is_alerting=1 flag.
  database.run(
    `DELETE FROM site_checks
     WHERE project_id IN (
       SELECT id FROM projects WHERE stage NOT IN ('live', 'growing')
     )`,
  );

  const projects = database.query<ProjectToCheck, []>(
    `SELECT id, name, url FROM projects
     WHERE stage IN ('live', 'growing')
       AND url IS NOT NULL
       AND url != ''`,
  ).all();

  // Run pings in parallel. Each project's state is independent, so parallel
  // execution is safe and keeps the 30-min tick fast (bounded by the slowest
  // single ping instead of the sum of all ping durations).
  await Promise.allSettled(projects.map(async (project) => {
    const result = await ping(project.url);
    const now = Date.now();
    const existing = database.query<ExistingCheck, [string]>(
      `SELECT consecutive_failures, is_alerting, went_down_at
       FROM site_checks WHERE project_id = ?`,
    ).get(project.id);

    let consecutive_failures = existing?.consecutive_failures ?? 0;
    let is_alerting = existing?.is_alerting ?? 0;
    let went_down_at = existing?.went_down_at ?? null;
    let last_status: "up" | "down";

    if (result.ok) {
      last_status = "up";
      if (is_alerting === 1 && went_down_at !== null) {
        const duration_min = Math.round((now - went_down_at) / 60000);
        await alert(`🟢 *${escapeMd(project.name)}* is back up (was down ${duration_min} min)`);
        is_alerting = 0;
        went_down_at = null;
      }
      consecutive_failures = 0;
    } else {
      last_status = "down";
      consecutive_failures += 1;
      if (consecutive_failures >= 2 && is_alerting === 0) {
        const reason = result.error ?? `HTTP ${result.status_code}`;
        await alert(`🔴 *${escapeMd(project.name)}* is down\n${escapeMd(reason)}\n${escapeMd(project.url)}`);
        is_alerting = 1;
        went_down_at = now;
      }
    }

    database.run(
      `INSERT INTO site_checks
         (project_id, last_check_at, last_status, last_status_code,
          last_response_time_ms, last_error, consecutive_failures,
          is_alerting, went_down_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(project_id) DO UPDATE SET
         last_check_at = excluded.last_check_at,
         last_status = excluded.last_status,
         last_status_code = excluded.last_status_code,
         last_response_time_ms = excluded.last_response_time_ms,
         last_error = excluded.last_error,
         consecutive_failures = excluded.consecutive_failures,
         is_alerting = excluded.is_alerting,
         went_down_at = excluded.went_down_at,
         updated_at = excluded.updated_at`,
      [
        project.id,
        now,
        last_status,
        result.status_code ?? null,
        result.response_time_ms ?? null,
        result.error ?? null,
        consecutive_failures,
        is_alerting,
        went_down_at,
        now,
      ],
    );
  }));
}
