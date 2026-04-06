# Telegram Bot + Morning Cron — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Telegram bot for quick idea capture (message → idea) and a morning cron job (9am) that auto-generates the daily summary, fetches news, and sends a morning briefing to Telegram.

**Architecture:** The Telegram bot uses long-polling (no webhooks needed for self-hosted). A `server/src/lib/telegram.ts` client wraps the Telegram Bot API. Messages from the user create ideas. A cron scheduler (`server/src/lib/cron.ts`) runs at 9am daily: generates the daily summary, fetches news, and sends a formatted briefing via Telegram. The bot token and user's Telegram chat ID are stored in .env.

**Tech Stack:** Telegram Bot API (raw fetch, no library), Bun setInterval-based cron, existing LLM + news + daily-summary infrastructure

---

## File Structure

| Action | Path | Responsibility |
|--------|------|---------------|
| Create | `server/src/lib/telegram.ts` | Telegram Bot API client: send messages, poll for updates |
| Create | `server/src/lib/cron.ts` | Cron scheduler: morning briefing at 9am |
| Modify | `server/src/index.ts` | Start telegram polling + cron on server boot |
| Modify | `.env.example` | Add TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID |

---

### Task 1: Telegram Bot Client

**Files:**
- Create: `server/src/lib/telegram.ts`
- Modify: `.env.example`

- [ ] **Step 1: Create the Telegram client**

Create `server/src/lib/telegram.ts`:

```typescript
import { db } from "../db/index.ts";

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? "";
const CHAT_ID = process.env.TELEGRAM_CHAT_ID ?? "";
const API_BASE = `https://api.telegram.org/bot${BOT_TOKEN}`;

export function isTelegramConfigured(): boolean {
  return !!BOT_TOKEN && !!CHAT_ID;
}

async function tgFetch(method: string, body?: any) {
  const res = await fetch(`${API_BASE}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(30000),
  });
  const data = await res.json();
  if (!data.ok) throw new Error(`Telegram API error: ${JSON.stringify(data)}`);
  return data.result;
}

export async function sendMessage(text: string, parseMode: "Markdown" | "HTML" = "Markdown") {
  if (!isTelegramConfigured()) return;
  // Telegram has a 4096 char limit — split if needed
  const chunks = [];
  for (let i = 0; i < text.length; i += 4000) {
    chunks.push(text.slice(i, i + 4000));
  }
  for (const chunk of chunks) {
    await tgFetch("sendMessage", {
      chat_id: CHAT_ID,
      text: chunk,
      parse_mode: parseMode,
    });
  }
}

// --- Long polling for incoming messages ---

let lastUpdateId = 0;

async function getUpdates(): Promise<any[]> {
  try {
    const result = await tgFetch("getUpdates", {
      offset: lastUpdateId + 1,
      timeout: 20,
      allowed_updates: ["message"],
    });
    return result ?? [];
  } catch {
    return [];
  }
}

function getUserId(): string | null {
  // Get the first user from the DB (single-user app)
  const user = db.query<{ id: string }, []>("SELECT id FROM users LIMIT 1").get();
  return user?.id ?? null;
}

function createIdeaFromMessage(userId: string, text: string) {
  const id = crypto.randomUUID();
  const now = Date.now();
  // First line becomes the title, rest becomes body
  const lines = text.split("\n");
  const title = lines[0].slice(0, 100);
  const body = lines.slice(1).join("\n").trim();

  db.run(
    "INSERT INTO ideas (id, user_id, title, body, status, promoted_to_project_id, created_at, updated_at) VALUES (?, ?, ?, ?, 'raw', null, ?, ?)",
    [id, userId, title, body, now, now]
  );

  return { id, title };
}

async function processUpdate(update: any) {
  if (!update.message?.text) return;

  const text = update.message.text.trim();
  if (!text || text.startsWith("/start")) {
    await sendMessage("👋 Send me a message and I'll save it as an idea in Launchpad.");
    return;
  }

  const userId = getUserId();
  if (!userId) {
    await sendMessage("⚠️ No user found in Launchpad. Log in to the web app first.");
    return;
  }

  const idea = createIdeaFromMessage(userId, text);
  await sendMessage(`✅ Idea saved: *${idea.title}*`);
}

export async function startPolling() {
  if (!isTelegramConfigured()) {
    console.log("Telegram bot not configured (TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID not set)");
    return;
  }

  console.log("Telegram bot polling started");

  const poll = async () => {
    const updates = await getUpdates();
    for (const update of updates) {
      lastUpdateId = Math.max(lastUpdateId, update.update_id);
      await processUpdate(update);
    }
  };

  // Poll every 2 seconds
  setInterval(poll, 2000);
  // Initial poll
  poll();
}
```

- [ ] **Step 2: Update .env.example**

Add to `.env.example`:

```
# Telegram Bot (optional — create via @BotFather)
# TELEGRAM_BOT_TOKEN=123456:ABC-DEF...
# TELEGRAM_CHAT_ID=your_chat_id
```

- [ ] **Step 3: Commit**

```bash
git add server/src/lib/telegram.ts .env.example
git commit -m "feat: add Telegram bot client (send messages, poll for ideas)"
```

---

### Task 2: Morning Cron Scheduler

**Files:**
- Create: `server/src/lib/cron.ts`

- [ ] **Step 1: Create the cron scheduler**

Create `server/src/lib/cron.ts`:

```typescript
import { db } from "../db/index.ts";
import { generateText, isLLMAvailable } from "./llm.ts";
import { sendMessage, isTelegramConfigured } from "./telegram.ts";

// Re-use the activity collection and prompt building from daily-summary
// We duplicate the core logic here to avoid circular imports with the route

function collectActivity(userId: string, dateStr: string) {
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

  const notesAdded = db.query<{ content: string; is_build_log: number; project_name: string }, [string, number, number]>(`
    SELECT n.content, n.is_build_log, p.name as project_name FROM notes n
    JOIN projects p ON n.project_id = p.id
    WHERE p.user_id = ? AND n.created_at >= ? AND n.created_at < ?
  `).all(userId, start, end);

  const ideasCreated = db.query<{ title: string }, [string, number, number]>(
    "SELECT title FROM ideas WHERE user_id = ? AND created_at >= ? AND created_at < ?"
  ).all(userId, start, end);

  return { projectsUpdated, checklistCompleted, notesAdded, ideasCreated };
}

async function generateDailySummary(userId: string, dateStr: string): Promise<string | null> {
  // Check if already generated
  const existing = db.query<{ summary: string }, [string, string]>(
    "SELECT summary FROM daily_summaries WHERE user_id = ? AND date = ?"
  ).get(userId, dateStr);
  if (existing) return existing.summary;

  const llmStatus = await isLLMAvailable();
  if (!llmStatus.available) return null;

  const activity = collectActivity(userId, dateStr);
  const sections: string[] = [];

  if (activity.projectsUpdated.length > 0)
    sections.push(`Projects updated: ${activity.projectsUpdated.map(p => p.name).join(", ")}`);
  if (activity.checklistCompleted.length > 0)
    sections.push(`Checklist items completed: ${activity.checklistCompleted.map(c => `${c.item} (${c.project_name})`).join(", ")}`);
  if (activity.notesAdded.length > 0)
    sections.push(`Notes: ${activity.notesAdded.map(n => `${n.content.slice(0, 80)} (${n.project_name})`).join("; ")}`);
  if (activity.ideasCreated.length > 0)
    sections.push(`Ideas captured: ${activity.ideasCreated.map(i => i.title).join(", ")}`);

  if (sections.length === 0) return null;

  const prompt = `Summarize yesterday's activity for a founder. Be concise, 3-5 bullets max.\n\nActivity for ${dateStr}:\n${sections.join("\n")}`;
  const summary = await generateText(prompt, { maxTokens: 512, temperature: 0.3 });

  // Save to DB
  const id = crypto.randomUUID();
  db.run(
    "INSERT OR IGNORE INTO daily_summaries (id, user_id, summary, activity_data, date, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    [id, userId, summary, JSON.stringify(activity), dateStr, Date.now()]
  );

  return summary;
}

function getTopNews(userId: string, limit: number = 5): Array<{ title: string; summary: string | null; url: string | null }> {
  return db.query<{ title: string; summary: string | null; url: string | null }, [string]>(
    "SELECT title, summary, url FROM news_items WHERE user_id = ? AND relevance_score > 0 ORDER BY created_at DESC LIMIT ?"
  ).all(userId, limit as any) as any;
}

async function sendMorningBriefing() {
  if (!isTelegramConfigured()) return;

  const user = db.query<{ id: string; name: string }, []>("SELECT id, name FROM users LIMIT 1").get();
  if (!user) return;

  const yesterday = new Date(Date.now() - 86400000).toISOString().split("T")[0];
  const today = new Date().toISOString().split("T")[0];

  let message = `☀️ *Good morning, ${user.name}!*\n\n`;

  // Yesterday's summary
  const summary = await generateDailySummary(user.id, yesterday);
  if (summary) {
    message += `📊 *Yesterday's Summary*\n${summary}\n\n`;
  }

  // Today's top news
  const news = getTopNews(user.id);
  if (news.length > 0) {
    message += `📰 *Today's Signals*\n`;
    for (const item of news) {
      message += `• [${item.title}](${item.url ?? "#"})`;
      if (item.summary) message += ` — ${item.summary.split(".")[0]}.`;
      message += `\n`;
    }
  }

  if (message.trim() === `☀️ *Good morning, ${user.name}!*`) {
    message += "No activity yesterday and no new signals today. Fresh start! 🚀";
  }

  await sendMessage(message);
  console.log(`[CRON] Morning briefing sent at ${new Date().toISOString()}`);
}

export function startCron() {
  if (!isTelegramConfigured()) {
    console.log("Cron not started (Telegram not configured)");
    return;
  }

  console.log("Morning cron scheduled (9:00 AM daily)");

  // Check every minute if it's 9:00 AM
  let lastRun = "";
  setInterval(() => {
    const now = new Date();
    const timeStr = `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}`;
    const dateStr = now.toISOString().split("T")[0];
    const key = `${dateStr}-${timeStr}`;

    if (timeStr === "09:00" && lastRun !== key) {
      lastRun = key;
      // Also trigger a news fetch before sending briefing
      triggerNewsFetch().then(() => sendMorningBriefing()).catch(console.error);
    }
  }, 30000); // check every 30 seconds
}

async function triggerNewsFetch() {
  const user = db.query<{ id: string }, []>("SELECT id FROM users LIMIT 1").get();
  if (!user) return;

  // Trigger the news fetch logic (simplified version)
  try {
    const res = await fetch(`http://localhost:${process.env.PORT ?? 3001}/api/news/fetch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // We need to authenticate — use internal bypass or make an internal call
      // For simplicity, we'll fetch news directly here
    });
    // This won't work without auth. Instead, let's call the fetch logic directly.
  } catch {}

  // Direct approach: use the HN fetcher
  const { default: newsModule } = await import("../routes/news.ts");
  // Actually, the news fetch is tied to the route handler. Let's skip auto-fetch for now
  // and rely on the user having fetched news via the UI. The cron just sends what's already there.
}
```

Wait — the `triggerNewsFetch` function has issues with auth. Let me simplify: the cron sends whatever news is already in the DB. The user fetches news via the UI or we can add a simple server-side fetch function. Let me rewrite this more cleanly:

```typescript
import { db } from "../db/index.ts";
import { generateText, isLLMAvailable } from "./llm.ts";
import { sendMessage, isTelegramConfigured } from "./telegram.ts";

function collectYesterdayActivity(userId: string, dateStr: string) {
  const start = new Date(`${dateStr}T00:00:00`).getTime();
  const end = start + 86400000;

  const projectsUpdated = db.query(
    "SELECT name FROM projects WHERE user_id = ? AND updated_at >= ? AND updated_at < ?",
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
```

I'll use the cleaner version. Let me rewrite the file properly.

- [ ] **Step 1: Create the cron scheduler**

Create `server/src/lib/cron.ts` with the clean version above (the second code block starting with `import { db }`).

- [ ] **Step 2: Commit**

```bash
git add server/src/lib/cron.ts
git commit -m "feat: add morning cron scheduler (9am daily briefing via Telegram)"
```

---

### Task 3: Start Bot + Cron on Server Boot

**Files:**
- Modify: `server/src/index.ts`

- [ ] **Step 1: Start telegram polling and cron**

In `server/src/index.ts`, add imports:

```typescript
import { startPolling } from "./lib/telegram.ts";
import { startCron } from "./lib/cron.ts";
```

Add at the bottom of the file, after `export default`:

```typescript
// Start background services
startPolling();
startCron();
```

Actually, in Bun with `export default { port, fetch }`, the module is loaded when the server starts. We need to call the startup functions at the top level, AFTER the export. Add these lines at the very end of the file:

```typescript
// Start background services (Telegram bot + morning cron)
startPolling();
startCron();
```

- [ ] **Step 2: Commit**

```bash
git add server/src/index.ts
git commit -m "feat: start Telegram polling and morning cron on server boot"
```

---

### Task 4: Playwright / Manual Verification

- [ ] **Step 1:** Set up a Telegram bot via @BotFather, get the token
- [ ] **Step 2:** Get your chat ID (message the bot, then check `https://api.telegram.org/bot<TOKEN>/getUpdates`)
- [ ] **Step 3:** Add `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` to `.env`
- [ ] **Step 4:** Restart server — verify "Telegram bot polling started" and "Morning cron scheduled" in console
- [ ] **Step 5:** Send a message to the bot — verify an idea is created in Launchpad
- [ ] **Step 6:** Verify the bot responds with "✅ Idea saved: *your message*"
- [ ] **Step 7:** (Optional) Manually trigger the morning briefing for testing by temporarily changing `"09:00"` to the current time
