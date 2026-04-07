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
  const user = db.query<{ id: string }, []>("SELECT id FROM users LIMIT 1").get();
  return user?.id ?? null;
}

function createIdeaFromMessage(userId: string, text: string) {
  const id = crypto.randomUUID();
  const now = Date.now();
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

  setInterval(poll, 2000);
  poll();
}
