import { Hono } from "hono";
import { db } from "../db/index.ts";
import { requireAuth } from "../middleware/auth.ts";
import { generateText, isLLMAvailable } from "../lib/llm.ts";
import { getCommits } from "../lib/github.ts";

const router = new Hono<{ Variables: { userId: string } }>();
router.use("*", requireAuth);

async function collectActivity(userId: string, dateStr: string) {
  const start = new Date(`${dateStr}T00:00:00`).getTime();
  const end = start + 86400000;

  const projectsUpdated = db.query<{ name: string; stage: string }, [string, number, number]>(
    "SELECT name, stage FROM projects WHERE user_id = ? AND updated_at >= ? AND updated_at < ?"
  ).all(userId, start, end);

  const checklistCompleted = db.query<{ item: string; project_name: string }, [string, number, number]>(`
    SELECT lc.item, p.name as project_name FROM launch_checklist lc
    JOIN projects p ON lc.project_id = p.id
    WHERE p.user_id = ? AND lc.completed = 1 AND lc.created_at >= ? AND lc.created_at < ?
  `).all(userId, start, end);

  const techDebtResolved = db.query<{ note: string; project_name: string }, [string, number, number]>(`
    SELECT td.note, p.name as project_name FROM tech_debt td
    JOIN projects p ON td.project_id = p.id
    WHERE p.user_id = ? AND td.resolved = 1 AND td.created_at >= ? AND td.created_at < ?
  `).all(userId, start, end);

  const notesAdded = db.query<{ content: string; is_build_log: number; project_name: string }, [string, number, number]>(`
    SELECT n.content, n.is_build_log, p.name as project_name FROM notes n
    JOIN projects p ON n.project_id = p.id
    WHERE p.user_id = ? AND n.created_at >= ? AND n.created_at < ?
  `).all(userId, start, end);

  const ideasCreated = db.query<{ title: string }, [string, number, number]>(
    "SELECT title FROM ideas WHERE user_id = ? AND created_at >= ? AND created_at < ?"
  ).all(userId, start, end);

  const ideasPromoted = db.query<{ title: string }, [string, number, number]>(
    "SELECT title FROM ideas WHERE user_id = ? AND status = 'promoted' AND updated_at >= ? AND updated_at < ?"
  ).all(userId, start, end);

  const goalsProgress = db.query<{ description: string; current_value: number; target_value: number; unit: string | null; project_name: string }, [string, number, number]>(`
    SELECT g.description, g.current_value, g.target_value, g.unit, p.name as project_name FROM goals g
    JOIN projects p ON g.project_id = p.id
    WHERE p.user_id = ? AND g.created_at >= ? AND g.created_at < ?
  `).all(userId, start, end);

  const mrrEntries = db.query<{ mrr: number; user_count: number; project_name: string }, [string, number, number]>(`
    SELECT m.mrr, m.user_count, p.name as project_name FROM mrr_history m
    JOIN projects p ON m.project_id = p.id
    WHERE p.user_id = ? AND m.recorded_at >= ? AND m.recorded_at < ?
  `).all(userId, start, end);

  const projectsWithGH = db.query<{ name: string; github_repo: string }, [string]>(
    "SELECT name, github_repo FROM projects WHERE user_id = ? AND github_repo IS NOT NULL"
  ).all(userId);

  const githubCommits: Array<{ project: string; message: string; author: string }> = [];
  for (const p of projectsWithGH) {
    try {
      const commits = await getCommits(p.github_repo, `${dateStr}T00:00:00Z`);
      for (const c of commits) {
        githubCommits.push({ project: p.name, message: c.message, author: c.author });
      }
    } catch {}
  }

  return { projectsUpdated, checklistCompleted, techDebtResolved, notesAdded, ideasCreated, ideasPromoted, goalsProgress, mrrEntries, githubCommits };
}

function buildPrompt(activity: Awaited<ReturnType<typeof collectActivity>>, dateStr: string): string {
  const sections: string[] = [];

  if (activity.projectsUpdated.length > 0)
    sections.push(`Projects updated: ${activity.projectsUpdated.map(p => p.name).join(", ")}`);
  if (activity.checklistCompleted.length > 0)
    sections.push(`Checklist items completed: ${activity.checklistCompleted.map(c => `${c.item} (${c.project_name})`).join(", ")}`);
  if (activity.techDebtResolved.length > 0)
    sections.push(`Tech debt resolved: ${activity.techDebtResolved.map(t => `${t.note} (${t.project_name})`).join(", ")}`);
  if (activity.notesAdded.length > 0)
    sections.push(`Notes added: ${activity.notesAdded.map(n => `${n.is_build_log ? "[build log] " : ""}${n.content.slice(0, 100)} (${n.project_name})`).join("; ")}`);
  if (activity.ideasCreated.length > 0)
    sections.push(`Ideas captured: ${activity.ideasCreated.map(i => i.title).join(", ")}`);
  if (activity.ideasPromoted.length > 0)
    sections.push(`Ideas promoted to projects: ${activity.ideasPromoted.map(i => i.title).join(", ")}`);
  if (activity.goalsProgress.length > 0)
    sections.push(`Goals: ${activity.goalsProgress.map(g => `${g.description}: ${g.current_value}/${g.target_value}${g.unit ? ` ${g.unit}` : ""} (${g.project_name})`).join(", ")}`);
  if (activity.mrrEntries.length > 0)
    sections.push(`MRR logged: ${activity.mrrEntries.map(m => `$${m.mrr} / ${m.user_count} users (${m.project_name})`).join(", ")}`);
  if (activity.githubCommits.length > 0)
    sections.push(`GitHub commits: ${activity.githubCommits.map(c => `${c.message} (${c.project}, by ${c.author})`).join("; ")}`);

  if (sections.length === 0) return "";

  return `Based on today's activity in my projects, generate a concise daily summary.

Activity for ${dateStr}:
${sections.join("\n")}

Format your response as markdown:
## Daily Summary — ${dateStr}
### What shipped
- bullet points of completed work
### What moved forward
- bullet points of progress
### Open items
- things that are in progress but not done

Keep it concise. 3-5 bullets per section max. Skip empty sections. Do not add any preamble or explanation — just the formatted summary.`;
}

// POST /api/daily-summary/generate
router.post("/generate", async (c) => {
  const userId = c.get("userId");
  const body = await c.req.json().catch(() => ({}));
  const dateStr = (body as any).date ?? new Date().toISOString().split("T")[0];

  const existing = db.query<{ id: string; summary: string }, [string, string]>(
    "SELECT id, summary FROM daily_summaries WHERE user_id = ? AND date = ?"
  ).get(userId, dateStr);
  if (existing) {
    return c.json({ id: existing.id, summary: existing.summary, date: dateStr, cached: true });
  }

  const llmStatus = await isLLMAvailable();
  if (!llmStatus.available) {
    return c.json({ error: "LLM not available. Make sure Ollama is running.", details: llmStatus.error }, 503);
  }

  const activity = await collectActivity(userId, dateStr);
  const prompt = buildPrompt(activity, dateStr);

  if (!prompt) {
    return c.json({ error: "No activity found for this date." }, 404);
  }

  const summary = await generateText(prompt, { maxTokens: 1024, temperature: 0.3 });
  const id = crypto.randomUUID();
  const now = Date.now();

  db.run(
    "INSERT INTO daily_summaries (id, user_id, summary, activity_data, date, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    [id, userId, summary, JSON.stringify(activity), dateStr, now]
  );

  return c.json({ id, summary, date: dateStr, cached: false });
});

// GET /api/daily-summary — list summaries
router.get("/", (c) => {
  const userId = c.get("userId");
  const summaries = db.query<{ id: string; summary: string; date: string; created_at: number }, [string]>(
    "SELECT id, summary, date, created_at FROM daily_summaries WHERE user_id = ? ORDER BY date DESC LIMIT 30"
  ).all(userId);
  return c.json(summaries);
});

// GET /api/daily-summary/:date
router.get("/:date", (c) => {
  const userId = c.get("userId");
  const dateStr = c.req.param("date");
  const summary = db.query<{ id: string; summary: string; activity_data: string; date: string; created_at: number }, [string, string]>(
    "SELECT id, summary, activity_data, date, created_at FROM daily_summaries WHERE user_id = ? AND date = ?"
  ).get(userId, dateStr);
  if (!summary) return c.json({ error: "Not found" }, 404);
  return c.json(summary);
});

export default router;
