import { Hono } from "hono";
import { db } from "../db/index.ts";
import { requireAuth } from "../middleware/auth.ts";
import type { Project, Idea } from "../types/index.ts";
import { isLLMAvailable } from "../lib/llm.ts";
import { isWhisperAvailable } from "../lib/whisper.ts";
import { getMonitorStatusMap, normalizeUrl } from "../lib/uptimerobot.ts";
import { getCommits } from "../lib/github.ts";

interface ActionItem {
  id: string;
  severity: "critical" | "warning" | "info";
  category:
    | "site-down" | "compliance-blocker" | "tech-debt-high" | "launch-blocker"
    | "stale-project" | "overdue-goal" | "needs-review" | "stale-mrr"
    | "compliance-important" | "news-unread";
  label: string;
  detail: string | null;
  project_id: string | null;
  project_name: string | null;
  target: "project" | "legal" | "checklist" | "tech-debt" | "goals" | "news";
  created_at: number;
}

interface ActivityEvent {
  id: string;
  kind: "commit" | "mrr-update" | "new-idea" | "news" | "tech-debt-added";
  icon: string;
  label: string;
  project_id: string | null;
  project_name: string | null;
  timestamp: number;
  deep_link: string | null;
}

const router = new Hono<{ Variables: { userId: string } }>();

router.get("/health/llm", async (c) => {
  const status = await isLLMAvailable();
  return c.json(status);
});

router.get("/health/whisper", async (c) => {
  const status = await isWhisperAvailable();
  return c.json(status);
});

router.use("*", requireAuth);

router.get("/dashboard", (c) => {
  const userId = c.get("userId");

  // Total MRR: sum of latest mrr entry per project
  const mrrRow = db.query<{ total: number }, [string]>(`
    SELECT COALESCE(SUM(m.mrr), 0) as total
    FROM mrr_history m
    INNER JOIN (
      SELECT project_id, MAX(recorded_at) as max_at
      FROM mrr_history GROUP BY project_id
    ) latest ON m.project_id = latest.project_id AND m.recorded_at = latest.max_at
    INNER JOIN projects p ON m.project_id = p.id
    WHERE p.user_id = ?
  `).get(userId);

  const projectCount = (db.query<{ n: number }, [string]>(
    "SELECT COUNT(*) as n FROM projects WHERE user_id = ?"
  ).get(userId))?.n ?? 0;

  const ideaCount = (db.query<{ n: number }, [string]>(
    "SELECT COUNT(*) as n FROM ideas WHERE user_id = ? AND status = 'raw'"
  ).get(userId))?.n ?? 0;

  const legalPending = (db.query<{ n: number }, [string]>(`
    SELECT COUNT(*) as n FROM legal_items li
    INNER JOIN projects p ON li.project_id = p.id
    WHERE p.user_id = ? AND li.completed = 0
  `).get(userId))?.n ?? 0;

  const stageDist = db.query<{ stage: string; count: number }, [string]>(
    "SELECT stage, COUNT(*) as count FROM projects WHERE user_id = ? GROUP BY stage"
  ).all(userId);

  const recentProjects = db.query<Pick<Project, "id"|"name"|"stage"|"type"|"url"|"updated_at">, [string]>(
    "SELECT id, name, stage, type, url, updated_at FROM projects WHERE user_id = ? ORDER BY updated_at DESC LIMIT 5"
  ).all(userId);

  const recentIdeas = db.query<Pick<Idea, "id"|"title"|"body"|"created_at">, [string]>(
    "SELECT id, title, body, created_at FROM ideas WHERE user_id = ? AND status = 'raw' ORDER BY created_at DESC LIMIT 5"
  ).all(userId);

  return c.json({
    mrr: mrrRow?.total ?? 0,
    projectCount,
    ideaCount,
    legalPending,
    stageDist,
    recentProjects,
    recentIdeas,
  });
});

router.get("/dashboard/action-items", async (c) => {
  const userId = c.get("userId");
  const now = Date.now();
  const items: ActionItem[] = [];

  // Helper to try each category and swallow errors
  const run = (name: string, fn: () => void) => {
    try { fn(); } catch (e) { console.warn(`[action-items] ${name} failed:`, (e as Error).message); }
  };

  // 1. compliance-blocker (critical)
  run("compliance-blocker", () => {
    const rows = db.query<{ id: string; item: string; project_id: string; project_name: string; created_at: number }, [string]>(
      `SELECT li.id, li.item, p.id as project_id, p.name as project_name, li.created_at
       FROM legal_items li INNER JOIN projects p ON li.project_id = p.id
       WHERE p.user_id = ? AND li.priority = 'blocker' AND li.completed = 0`
    ).all(userId);
    for (const r of rows) {
      items.push({
        id: `compliance-blocker:${r.id}`,
        severity: "critical",
        category: "compliance-blocker",
        label: r.item,
        detail: null,
        project_id: r.project_id,
        project_name: r.project_name,
        target: "legal",
        created_at: r.created_at,
      });
    }
  });

  // 2. tech-debt-high (critical)
  run("tech-debt-high", () => {
    const rows = db.query<{ id: string; note: string; project_id: string; project_name: string; created_at: number }, [string]>(
      `SELECT td.id, td.note, p.id as project_id, p.name as project_name, td.created_at
       FROM tech_debt td INNER JOIN projects p ON td.project_id = p.id
       WHERE p.user_id = ? AND td.severity = 'high' AND td.resolved = 0`
    ).all(userId);
    for (const r of rows) {
      items.push({
        id: `tech-debt-high:${r.id}`,
        severity: "critical",
        category: "tech-debt-high",
        label: r.note.slice(0, 80),
        detail: null,
        project_id: r.project_id,
        project_name: r.project_name,
        target: "tech-debt",
        created_at: r.created_at,
      });
    }
  });

  // 3. launch-blocker (critical)
  run("launch-blocker", () => {
    const rows = db.query<{ id: string; item: string; project_id: string; project_name: string; created_at: number }, [string]>(
      `SELECT lc.id, lc.item, p.id as project_id, p.name as project_name, lc.created_at
       FROM launch_checklist lc INNER JOIN projects p ON lc.project_id = p.id
       WHERE p.user_id = ? AND lc.priority = 'blocker' AND lc.completed = 0`
    ).all(userId);
    for (const r of rows) {
      items.push({
        id: `launch-blocker:${r.id}`,
        severity: "critical",
        category: "launch-blocker",
        label: r.item,
        detail: null,
        project_id: r.project_id,
        project_name: r.project_name,
        target: "checklist",
        created_at: r.created_at,
      });
    }
  });

  // 4. site-down (critical) — requires UptimeRobot
  try {
    const statusMap = await getMonitorStatusMap();
    if (statusMap.size > 0) {
      const projects = db.query<{ id: string; name: string; url: string | null }, [string]>(
        "SELECT id, name, url FROM projects WHERE user_id = ? AND url IS NOT NULL AND url != ''"
      ).all(userId);
      for (const p of projects) {
        if (!p.url) continue;
        const status = statusMap.get(normalizeUrl(p.url));
        if (status === "down") {
          items.push({
            id: `site-down:${p.id}`,
            severity: "critical",
            category: "site-down",
            label: `Site down: ${p.url}`,
            detail: null,
            project_id: p.id,
            project_name: p.name,
            target: "project",
            created_at: now,
          });
        }
      }
    }
  } catch (e) {
    console.warn("[action-items] site-down failed:", (e as Error).message);
  }

  // 5. stale-project (warning)
  run("stale-project", () => {
    const fourteenDaysAgo = now - 14 * 86400000;
    const sixtyDaysAgo = now - 60 * 86400000;
    const rows = db.query<{ id: string; name: string; stage: string; updated_at: number }, [string, number, number]>(
      `SELECT id, name, stage, updated_at FROM projects
       WHERE user_id = ?
         AND ((stage IN ('building','beta','live') AND updated_at < ?) OR (stage = 'idea' AND updated_at < ?))
         AND stage != 'sunset'`
    ).all(userId, fourteenDaysAgo, sixtyDaysAgo);
    for (const r of rows) {
      const days = Math.floor((now - r.updated_at) / 86400000);
      items.push({
        id: `stale-project:${r.id}`,
        severity: "warning",
        category: "stale-project",
        label: `Stale: ${r.stage} for ${days} days`,
        detail: null,
        project_id: r.id,
        project_name: r.name,
        target: "project",
        created_at: r.updated_at,
      });
    }
  });

  // 6. overdue-goal (warning)
  run("overdue-goal", () => {
    const rows = db.query<{ id: string; description: string; project_id: string; project_name: string; created_at: number }, [string, number]>(
      `SELECT g.id, g.description, p.id as project_id, p.name as project_name, g.created_at
       FROM goals g INNER JOIN projects p ON g.project_id = p.id
       WHERE p.user_id = ? AND g.target_date < ? AND g.completed = 0 AND g.target_date IS NOT NULL`
    ).all(userId, now);
    for (const r of rows) {
      items.push({
        id: `overdue-goal:${r.id}`,
        severity: "warning",
        category: "overdue-goal",
        label: `Overdue goal: ${r.description.slice(0, 80)}`,
        detail: null,
        project_id: r.project_id,
        project_name: r.project_name,
        target: "goals",
        created_at: r.created_at,
      });
    }
  });

  // 7. needs-review (warning)
  run("needs-review", () => {
    const rows = db.query<{ project_id: string; project_name: string; cnt: number; max_created: number }, [string]>(
      `SELECT p.id as project_id, p.name as project_name, COUNT(*) as cnt, MAX(li.created_at) as max_created
       FROM legal_items li INNER JOIN projects p ON li.project_id = p.id
       WHERE p.user_id = ? AND li.status_note IS NOT NULL AND li.completed = 0
       GROUP BY p.id, p.name`
    ).all(userId);
    for (const r of rows) {
      items.push({
        id: `needs-review:${r.project_id}`,
        severity: "warning",
        category: "needs-review",
        label: `${r.cnt} compliance items need review`,
        detail: null,
        project_id: r.project_id,
        project_name: r.project_name,
        target: "legal",
        created_at: r.max_created ?? now,
      });
    }
  });

  // 8. stale-mrr (warning)
  run("stale-mrr", () => {
    const thirtyDaysAgo = now - 30 * 86400000;
    const rows = db.query<{ id: string; name: string; latest: number | null }, [string, number]>(
      `SELECT p.id, p.name, (SELECT MAX(recorded_at) FROM mrr_history WHERE project_id = p.id) as latest
       FROM projects p
       WHERE p.user_id = ? AND p.type = 'for-profit' AND p.stage IN ('live','growing')
         AND (latest IS NULL OR latest < ?)`
    ).all(userId, thirtyDaysAgo);
    for (const r of rows) {
      items.push({
        id: `stale-mrr:${r.id}`,
        severity: "warning",
        category: "stale-mrr",
        label: r.latest
          ? `MRR not updated in ${Math.floor((now - r.latest) / 86400000)} days`
          : "MRR never recorded",
        detail: null,
        project_id: r.id,
        project_name: r.name,
        target: "project",
        created_at: r.latest ?? now,
      });
    }
  });

  // 9. compliance-important (warning)
  run("compliance-important", () => {
    const rows = db.query<{ id: string; item: string; project_id: string; project_name: string; created_at: number }, [string]>(
      `SELECT li.id, li.item, p.id as project_id, p.name as project_name, li.created_at
       FROM legal_items li INNER JOIN projects p ON li.project_id = p.id
       WHERE p.user_id = ? AND li.priority = 'important' AND li.completed = 0`
    ).all(userId);
    for (const r of rows) {
      items.push({
        id: `compliance-important:${r.id}`,
        severity: "warning",
        category: "compliance-important",
        label: r.item,
        detail: null,
        project_id: r.project_id,
        project_name: r.project_name,
        target: "legal",
        created_at: r.created_at,
      });
    }
  });

  // 10. news-unread (info) — top 3
  run("news-unread", () => {
    const rows = db.query<{ id: string; title: string; created_at: number; relevance_score: number }, [string]>(
      `SELECT id, title, created_at, relevance_score FROM news_items
       WHERE user_id = ? AND read = 0 AND relevance_score > 0.7
       ORDER BY relevance_score DESC, created_at DESC LIMIT 3`
    ).all(userId);
    for (const r of rows) {
      items.push({
        id: `news-unread:${r.id}`,
        severity: "info",
        category: "news-unread",
        label: r.title.slice(0, 80),
        detail: `${Math.round(r.relevance_score * 100)}% relevant`,
        project_id: null,
        project_name: null,
        target: "news",
        created_at: r.created_at,
      });
    }
  });

  // Sort: critical → warning → info; within severity, newest first
  const sevOrder: Record<string, number> = { critical: 0, warning: 1, info: 2 };
  items.sort((a, b) => {
    const diff = sevOrder[a.severity] - sevOrder[b.severity];
    if (diff !== 0) return diff;
    return b.created_at - a.created_at;
  });

  const counts = {
    critical: items.filter(i => i.severity === "critical").length,
    warning: items.filter(i => i.severity === "warning").length,
    info: items.filter(i => i.severity === "info").length,
  };

  return c.json({ items, counts, generated_at: now });
});

router.get("/dashboard/activity", async (c) => {
  const userId = c.get("userId");
  const now = Date.now();
  const since = now - 24 * 3600 * 1000;
  const events: ActivityEvent[] = [];

  const run = (name: string, fn: () => void) => {
    try { fn(); } catch (e) { console.warn(`[activity] ${name} failed:`, (e as Error).message); }
  };

  // mrr-update
  run("mrr-update", () => {
    const rows = db.query<{ id: string; project_id: string; project_name: string; mrr: number; recorded_at: number; prev: number | null }, [string, number]>(
      `SELECT m.id, m.project_id, p.name as project_name, m.mrr, m.recorded_at,
         (SELECT m2.mrr FROM mrr_history m2 WHERE m2.project_id = m.project_id AND m2.recorded_at < m.recorded_at ORDER BY m2.recorded_at DESC LIMIT 1) as prev
       FROM mrr_history m INNER JOIN projects p ON m.project_id = p.id
       WHERE p.user_id = ? AND m.recorded_at >= ?`
    ).all(userId, since);
    for (const r of rows) {
      const prev = r.prev ?? 0;
      events.push({
        id: `mrr-${r.id}`,
        kind: "mrr-update",
        icon: "📈",
        label: `MRR $${prev} → $${r.mrr}`,
        project_id: r.project_id,
        project_name: r.project_name,
        timestamp: r.recorded_at,
        deep_link: `/projects/${r.project_id}?tab=revenue`,
      });
    }
  });

  // new-idea
  run("new-idea", () => {
    const rows = db.query<{ id: string; title: string; created_at: number }, [string, number]>(
      `SELECT id, title, created_at FROM ideas WHERE user_id = ? AND created_at >= ?`
    ).all(userId, since);
    for (const r of rows) {
      events.push({
        id: `idea-${r.id}`,
        kind: "new-idea",
        icon: "💡",
        label: `New idea: ${r.title.slice(0, 60)}`,
        project_id: null,
        project_name: null,
        timestamp: r.created_at,
        deep_link: "/ideas",
      });
    }
  });

  // news (grouped into one event)
  run("news", () => {
    const row = db.query<{ cnt: number; max_created: number | null }, [string, number]>(
      `SELECT COUNT(*) as cnt, MAX(created_at) as max_created
       FROM news_items WHERE user_id = ? AND relevance_score > 0.5 AND created_at >= ?`
    ).get(userId, since);
    if (row && row.cnt > 0) {
      events.push({
        id: `news-${row.max_created}`,
        kind: "news",
        icon: "📰",
        label: `${row.cnt} relevant news items`,
        project_id: null,
        project_name: null,
        timestamp: row.max_created ?? now,
        deep_link: "/news",
      });
    }
  });

  // tech-debt-added (grouped by project)
  run("tech-debt-added", () => {
    const rows = db.query<{ project_id: string; project_name: string; cnt: number; max_created: number }, [string, number]>(
      `SELECT td.project_id, p.name as project_name, COUNT(*) as cnt, MAX(td.created_at) as max_created
       FROM tech_debt td INNER JOIN projects p ON td.project_id = p.id
       WHERE p.user_id = ? AND td.created_at >= ?
       GROUP BY td.project_id, p.name`
    ).all(userId, since);
    for (const r of rows) {
      events.push({
        id: `debt-${r.project_id}-${r.max_created}`,
        kind: "tech-debt-added",
        icon: "📝",
        label: `${r.cnt} tech debt item${r.cnt === 1 ? "" : "s"} added`,
        project_id: r.project_id,
        project_name: r.project_name,
        timestamp: r.max_created,
        deep_link: `/projects/${r.project_id}?tab=health`,
      });
    }
  });

  // commits — live fetch from GitHub for projects with github_repo
  try {
    const projects = db.query<{ id: string; name: string; github_repo: string }, [string]>(
      "SELECT id, name, github_repo FROM projects WHERE user_id = ? AND github_repo IS NOT NULL"
    ).all(userId);
    const sinceIso = new Date(since).toISOString();
    for (const p of projects) {
      try {
        const commits = await getCommits(p.github_repo, sinceIso);
        if (commits.length === 0) continue;
        const latest = commits[0];
        events.push({
          id: `commit-${p.id}-${latest.sha}`,
          kind: "commit",
          icon: "💻",
          label: `Pushed ${commits.length} commit${commits.length === 1 ? "" : "s"}`,
          project_id: p.id,
          project_name: p.name,
          timestamp: new Date(latest.date).getTime() || now,
          deep_link: `/projects/${p.id}?tab=github`,
        });
      } catch (e) {
        // Individual GitHub fetch failed; skip this project silently
      }
    }
  } catch (e) {
    console.warn("[activity] commits failed:", (e as Error).message);
  }

  // Sort newest first, cap at 50
  events.sort((a, b) => b.timestamp - a.timestamp);
  return c.json({ events: events.slice(0, 50) });
});

router.post("/ping", async (c) => {
  const { url } = await c.req.json();
  if (!url) return c.json({ error: "url required" }, 400);
  try {
    const parsed = new URL(url as string);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return c.json({ error: "Only http/https URLs are supported" }, 400);
    }
  } catch {
    return c.json({ error: "Invalid URL" }, 400);
  }
  const start = Date.now();
  try {
    const res = await fetch(url, { method: "HEAD", signal: AbortSignal.timeout(8000) });
    return c.json({ status: res.ok ? "up" : "down", latencyMs: Date.now() - start });
  } catch {
    return c.json({ status: "down", latencyMs: Date.now() - start });
  }
});

export default router;
