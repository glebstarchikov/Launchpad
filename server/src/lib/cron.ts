import { db } from "../db/index.ts";
import type { Database } from "bun:sqlite";
import { generateText, isLLMAvailable } from "./llm.ts";
import { sendMessage, isTelegramConfigured } from "./telegram.ts";
import { fetchNewsForUser } from "../routes/news.ts";

const BRIEF_HOUR = Number(process.env.TELEGRAM_BRIEF_HOUR ?? "9");

export interface YesterdayActivity {
  projectsUpdated: { name: string }[];
  checklistCompleted: { item: string; project_name: string }[];
  ideasCreated: { title: string }[];
  techDebtAdded: { note: string; project_name: string }[];
  notesAdded: { content: string; project_name: string }[];
}

export function collectYesterdayActivity(
  userId: string,
  dateStr: string,
  database: Database = db
): YesterdayActivity {
  const start = new Date(`${dateStr}T00:00:00`).getTime();
  const end = start + 86400000;

  const projectsUpdated = database.query<{ name: string }, [string, number, number]>(
    "SELECT name FROM projects WHERE user_id = ? AND updated_at >= ? AND updated_at < ?"
  ).all(userId, start, end);

  const checklistCompleted = database.query<{ item: string; project_name: string }, [string, number, number]>(
    `SELECT lc.item, p.name as project_name FROM launch_checklist lc
     JOIN projects p ON lc.project_id = p.id
     WHERE p.user_id = ? AND lc.completed = 1 AND lc.created_at >= ? AND lc.created_at < ?`
  ).all(userId, start, end);

  const ideasCreated = database.query<{ title: string }, [string, number, number]>(
    "SELECT title FROM ideas WHERE user_id = ? AND created_at >= ? AND created_at < ?"
  ).all(userId, start, end);

  const techDebtAdded = database.query<{ note: string; project_name: string }, [string, number, number]>(
    `SELECT td.note, p.name as project_name FROM tech_debt td
     JOIN projects p ON td.project_id = p.id
     WHERE p.user_id = ? AND td.created_at >= ? AND td.created_at < ?`
  ).all(userId, start, end);

  const notesAdded = database.query<{ content: string; project_name: string }, [string, number, number]>(
    `SELECT n.content, p.name as project_name FROM notes n
     JOIN projects p ON n.project_id = p.id
     WHERE p.user_id = ? AND n.is_build_log = 1 AND n.created_at >= ? AND n.created_at < ?`
  ).all(userId, start, end);

  return { projectsUpdated, checklistCompleted, ideasCreated, techDebtAdded, notesAdded };
}

async function getOrGenerateSummary(userId: string, dateStr: string): Promise<string | null> {
  const existing = db.query<{ summary: string }, [string, string]>(
    "SELECT summary FROM daily_summaries WHERE user_id = ? AND date = ?"
  ).get(userId, dateStr);
  if (existing) return existing.summary;

  const llmStatus = await isLLMAvailable();
  if (!llmStatus.available) return null;

  const activity = collectYesterdayActivity(userId, dateStr);
  const parts: string[] = [];
  if (activity.projectsUpdated.length > 0)
    parts.push(`Projects touched: ${activity.projectsUpdated.map(p => p.name).join(", ")}`);
  if (activity.checklistCompleted.length > 0)
    parts.push(`Checklist done: ${activity.checklistCompleted.map(c => c.item).join(", ")}`);
  if (activity.ideasCreated.length > 0)
    parts.push(`Ideas captured: ${activity.ideasCreated.map(i => i.title).join(", ")}`);
  if (activity.techDebtAdded.length > 0)
    parts.push(`Tech debt logged: ${activity.techDebtAdded.map(t => t.note.slice(0, 60)).join(", ")}`);
  if (activity.notesAdded.length > 0)
    parts.push(`Build log entries: ${activity.notesAdded.map(n => n.content.slice(0, 60)).join(", ")}`);
  if (parts.length === 0) return null;

  const summary = await generateText(
    `Summarize yesterday's founder activity in 3-5 concise bullets:\n${parts.join("\n")}`,
    { maxTokens: 512, temperature: 0.3 }
  );

  db.run(
    "INSERT OR IGNORE INTO daily_summaries (id, user_id, summary, activity_data, date, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    [crypto.randomUUID(), userId, summary, JSON.stringify(activity), dateStr, Date.now()]
  );

  return summary;
}

function getRecentNews(userId: string): Array<{ title: string; summary: string | null; url: string | null }> {
  return db.query<{ title: string; summary: string | null; url: string | null }, [string]>(
    "SELECT title, summary, url FROM news_items WHERE user_id = ? AND relevance_score > 0 ORDER BY created_at DESC LIMIT 5"
  ).all(userId);
}

async function sendMorningBriefing() {
  if (!isTelegramConfigured()) return;

  const email = process.env.LAUNCHPAD_USER_EMAIL;
  const user = (email
    ? db.query<{ id: string; name: string }, [string]>("SELECT id, name FROM users WHERE email = ?").get(email)
    : db.query<{ id: string; name: string }, []>("SELECT id, name FROM users LIMIT 1").get()
  );
  if (!user) return;

  try {
    await fetchNewsForUser(user.id);
    console.log("[CRON] News fetched successfully");
  } catch (e: any) {
    console.error("[CRON] News fetch failed:", e.message);
  }

  const yesterday = new Date(Date.now() - 86400000).toISOString().split("T")[0];
  let msg = `☀️ *Good morning, ${user.name}!*\n\n`;

  const llmStatus = await isLLMAvailable();
  const summary = llmStatus.available ? await getOrGenerateSummary(user.id, yesterday) : null;

  if (summary) {
    msg += `📊 *Yesterday*\n${summary}\n\n`;
  } else {
    const activity = collectYesterdayActivity(user.id, yesterday);
    const totalActions =
      activity.projectsUpdated.length +
      activity.checklistCompleted.length +
      activity.ideasCreated.length +
      activity.techDebtAdded.length +
      activity.notesAdded.length;
    if (totalActions > 0 && !llmStatus.available) {
      msg += `📊 *Yesterday* _(LLM unavailable — raw data)_\n`;
      if (activity.projectsUpdated.length > 0)
        msg += `• Projects: ${activity.projectsUpdated.map(p => p.name).join(", ")}\n`;
      if (activity.checklistCompleted.length > 0)
        msg += `• Checklist: ${activity.checklistCompleted.length} item(s) done\n`;
      if (activity.ideasCreated.length > 0)
        msg += `• Ideas: ${activity.ideasCreated.map(i => i.title).join(", ")}\n`;
      if (activity.techDebtAdded.length > 0)
        msg += `• Tech debt: ${activity.techDebtAdded.length} item(s) logged\n`;
      if (activity.notesAdded.length > 0)
        msg += `• Build log: ${activity.notesAdded.length} note(s)\n`;
      msg += "\n";
    }
  }

  const news = getRecentNews(user.id);
  if (news.length > 0) {
    msg += `📰 *Signals*\n`;
    for (const n of news) {
      msg += `• [${n.title}](${n.url ?? "#"})`;
      if (n.summary) msg += ` — ${n.summary.split(".")[0]}.`;
      msg += `\n`;
    }
  }

  if (!summary && news.length === 0) {
    msg += "No activity yesterday and no signals. Fresh start! 🚀";
  }

  await sendMessage(msg);
  console.log(`[CRON] Morning briefing sent at ${new Date().toISOString()}`);
}

export function startCron() {
  if (!isTelegramConfigured()) {
    console.log("Cron not started (Telegram not configured)");
    return;
  }

  const hourStr = String(BRIEF_HOUR).padStart(2, "0");
  console.log(`Morning cron scheduled (${hourStr}:00 daily)`);

  let lastRun = "";
  setInterval(() => {
    const now = new Date();
    const time = `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}`;
    const key = `${now.toISOString().split("T")[0]}-${time}`;

    if (time === `${hourStr}:00` && lastRun !== key) {
      lastRun = key;
      sendMorningBriefing().catch(console.error);
    }
  }, 30000);
}
