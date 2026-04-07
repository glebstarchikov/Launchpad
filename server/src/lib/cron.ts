import { db } from "../db/index.ts";
import { generateText, isLLMAvailable } from "./llm.ts";
import { sendMessage, isTelegramConfigured } from "./telegram.ts";

function collectYesterdayActivity(userId: string, dateStr: string) {
  const start = new Date(`${dateStr}T00:00:00`).getTime();
  const end = start + 86400000;

  const projectsUpdated = db.query(
    "SELECT name FROM projects WHERE user_id = ? AND updated_at >= ? AND updated_at < ?"
  ).all(userId, start, end) as { name: string }[];

  const checklistCompleted = db.query(
    `SELECT lc.item, p.name as project_name FROM launch_checklist lc
     JOIN projects p ON lc.project_id = p.id
     WHERE p.user_id = ? AND lc.completed = 1 AND lc.created_at >= ? AND lc.created_at < ?`
  ).all(userId, start, end) as { item: string; project_name: string }[];

  const ideasCreated = db.query(
    "SELECT title FROM ideas WHERE user_id = ? AND created_at >= ? AND created_at < ?"
  ).all(userId, start, end) as { title: string }[];

  return { projectsUpdated, checklistCompleted, ideasCreated };
}

async function getOrGenerateSummary(userId: string, dateStr: string): Promise<string | null> {
  const existing = db.query("SELECT summary FROM daily_summaries WHERE user_id = ? AND date = ?").get(userId, dateStr) as { summary: string } | null;
  if (existing) return existing.summary;

  const llmStatus = await isLLMAvailable();
  if (!llmStatus.available) return null;

  const activity = collectYesterdayActivity(userId, dateStr);
  const parts: string[] = [];
  if (activity.projectsUpdated.length > 0) parts.push(`Projects: ${activity.projectsUpdated.map(p => p.name).join(", ")}`);
  if (activity.checklistCompleted.length > 0) parts.push(`Completed: ${activity.checklistCompleted.map(c => c.item).join(", ")}`);
  if (activity.ideasCreated.length > 0) parts.push(`Ideas: ${activity.ideasCreated.map(i => i.title).join(", ")}`);
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
  return db.query(
    "SELECT title, summary, url FROM news_items WHERE user_id = ? AND relevance_score > 0 ORDER BY created_at DESC LIMIT 5"
  ).all(userId) as any[];
}

async function sendMorningBriefing() {
  if (!isTelegramConfigured()) return;

  const user = db.query("SELECT id, name FROM users LIMIT 1").get() as { id: string; name: string } | null;
  if (!user) return;

  const yesterday = new Date(Date.now() - 86400000).toISOString().split("T")[0];
  let msg = `☀️ *Good morning, ${user.name}!*\n\n`;

  const summary = await getOrGenerateSummary(user.id, yesterday);
  if (summary) {
    msg += `📊 *Yesterday*\n${summary}\n\n`;
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

  console.log("Morning cron scheduled (9:00 AM daily)");

  let lastRun = "";
  setInterval(() => {
    const now = new Date();
    const time = `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}`;
    const key = `${now.toISOString().split("T")[0]}-${time}`;

    if (time === "09:00" && lastRun !== key) {
      lastRun = key;
      sendMorningBriefing().catch(console.error);
    }
  }, 30000);
}
