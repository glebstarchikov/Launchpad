import { Hono } from "hono";
import { db } from "../db/index.ts";
import { requireAuth } from "../middleware/auth.ts";
import { generateText } from "../lib/llm.ts";

const router = new Hono<{ Variables: { userId: string } }>();
router.use("*", requireAuth);

// --- HN Fetcher ---

interface HNHit {
  objectID: string;
  title: string;
  url: string | null;
  points: number;
  num_comments: number;
}

async function fetchHNStories(): Promise<HNHit[]> {
  const res = await fetch(
    "https://hn.algolia.com/api/v1/search?tags=front_page&hitsPerPage=30",
    { signal: AbortSignal.timeout(10000) }
  );
  if (!res.ok) throw new Error(`HN API error: ${res.status}`);
  const data = await res.json();
  return (data.hits ?? []).filter((h: HNHit) => h.title);
}

// --- RSS Fetcher ---

interface RSSItem {
  title: string;
  link: string | null;
  guid: string | null;
}

async function fetchRSSFeed(feedUrl: string): Promise<RSSItem[]> {
  const res = await fetch(feedUrl, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`RSS fetch error: ${res.status}`);
  const xml = await res.text();
  const items: RSSItem[] = [];
  const itemRegex = /<(?:item|entry)[\s>]([\s\S]*?)<\/(?:item|entry)>/gi;
  let match;
  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1];
    const title = block.match(/<title[^>]*>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/title>/i)?.[1]?.trim() ?? "";
    const link = block.match(/<link[^>]*href="([^"]*)"[^>]*\/?>/i)?.[1]
      ?? block.match(/<link[^>]*>(.*?)<\/link>/i)?.[1]?.trim()
      ?? null;
    const guid = block.match(/<(?:guid|id)[^>]*>(.*?)<\/(?:guid|id)>/i)?.[1]?.trim() ?? null;
    if (title) items.push({ title, link, guid });
  }
  return items;
}

// --- Article Content Fetcher ---

async function fetchArticleText(url: string): Promise<string> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(8000),
      headers: { "User-Agent": "Launchpad/1.0 (news reader)" },
    });
    if (!res.ok) return "";
    const html = await res.text();
    // Strip HTML tags, scripts, styles to get plain text
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    // Return first 2000 chars to keep LLM prompt reasonable
    return text.slice(0, 2000);
  } catch {
    return "";
  }
}

// --- Relevance Scoring ---

function getUserKeywords(userId: string): string[] {
  const projects = db.query<{ name: string; description: string | null; tech_stack: string }, [string]>(
    "SELECT name, description, tech_stack FROM projects WHERE user_id = ?"
  ).all(userId);

  const keywords = new Set<string>();
  for (const p of projects) {
    p.name.toLowerCase().split(/\s+/).forEach(w => { if (w.length > 2) keywords.add(w); });
    if (p.description) {
      p.description.toLowerCase().split(/\s+/).forEach(w => { if (w.length > 3) keywords.add(w); });
    }
    try {
      const stack = JSON.parse(p.tech_stack) as string[];
      stack.forEach(t => keywords.add(t.toLowerCase()));
    } catch {}
  }
  return [...keywords];
}

function scoreRelevance(title: string, url: string | null, keywords: string[]): { score: number; reason: string } {
  const text = `${title} ${url ?? ""}`.toLowerCase();
  const matches = keywords.filter(k => text.includes(k));
  if (matches.length === 0) return { score: 0, reason: "" };
  const score = Math.min(matches.length / 3, 1.0);
  return { score, reason: `matches: ${matches.join(", ")}` };
}

// --- Shared fetch logic (used by route + cron) ---

export async function fetchNewsForUser(userId: string) {
  const keywords = getUserKeywords(userId);

  // Ensure default HN source exists
  const hnSource = db.query<{ id: string }, [string]>(
    "SELECT id FROM news_sources WHERE user_id = ? AND type = 'hackernews'"
  ).get(userId);
  if (!hnSource) {
    db.run(
      "INSERT INTO news_sources (id, user_id, type, name, url, enabled, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [crypto.randomUUID(), userId, "hackernews", "Hacker News", null, 1, Date.now()]
    );
  }

  // Fetch HN stories
  let stories: HNHit[];
  try {
    stories = await fetchHNStories();
  } catch (e: any) {
    throw new Error(`Failed to fetch HN: ${e.message}`);
  }

  let added = 0;
  const now = Date.now();

  for (const story of stories) {
    const existing = db.query<{ id: string }, [string, string]>(
      "SELECT id FROM news_items WHERE user_id = ? AND source_id = ?"
    ).get(userId, story.objectID);
    if (existing) continue;

    const { score, reason } = scoreRelevance(story.title, story.url, keywords);
    if (score === 0 && story.points < 100) continue;

    const id = crypto.randomUUID();
    db.run(
      `INSERT INTO news_items (id, user_id, source, source_id, title, url, relevance_score, relevance_reason, read, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`,
      [id, userId, "hackernews", story.objectID, story.title, story.url, score, reason, now]
    );
    added++;
  }

  // Fetch RSS sources
  const rssSources = db.query<{ id: string; name: string; url: string }, [string]>(
    "SELECT id, name, url FROM news_sources WHERE user_id = ? AND type = 'rss' AND enabled = 1 AND url IS NOT NULL"
  ).all(userId);

  for (const source of rssSources) {
    try {
      const rssItems = await fetchRSSFeed(source.url);
      for (const item of rssItems) {
        const sourceId = item.guid ?? item.link ?? item.title;
        const existing = db.query<{ id: string }, [string, string]>(
          "SELECT id FROM news_items WHERE user_id = ? AND source_id = ?"
        ).get(userId, sourceId);
        if (existing) continue;

        const { score, reason } = scoreRelevance(item.title, item.link, keywords);
        const id = crypto.randomUUID();
        db.run(
          `INSERT INTO news_items (id, user_id, source, source_id, title, url, relevance_score, relevance_reason, read, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`,
          [id, userId, source.name, sourceId, item.title, item.link, score, reason, now]
        );
        added++;
      }
    } catch {
      // RSS fetch failed for this source — skip and continue
    }
  }

  // Generate LLM summaries for top relevant items that don't have one yet
  const unsummarized = db.query<{ id: string; title: string; url: string | null }, [string]>(
    "SELECT id, title, url FROM news_items WHERE user_id = ? AND summary IS NULL AND relevance_score > 0 ORDER BY relevance_score DESC LIMIT 10"
  ).all(userId);

  for (const item of unsummarized) {
    try {
      const articleText = item.url ? await fetchArticleText(item.url) : "";
      const prompt = articleText
        ? `Summarize this article in 2-3 sentences for a software founder. Title: "${item.title}". Article content: ${articleText}. Focus on why this matters for someone building software products.`
        : `Summarize this article in 2-3 sentences for a software founder based on the title. Title: "${item.title}". Focus on why this matters for someone building software products.`;
      const summary = await generateText(prompt, { maxTokens: 200, temperature: 0.3 });
      db.run("UPDATE news_items SET summary = ? WHERE id = ?", [summary, item.id]);
    } catch {
      // LLM failed — skip summary, item still shows without it
    }
  }

  return { fetched: stories.length, added, summarized: unsummarized.length };
}

// --- Routes ---

// POST /api/news/fetch
router.post("/fetch", async (c) => {
  const userId = c.get("userId");
  try {
    const result = await fetchNewsForUser(userId);
    return c.json(result);
  } catch (e: any) {
    return c.json({ error: e.message }, 502);
  }
});

// GET /api/news — list news items
router.get("/", (c) => {
  const userId = c.get("userId");
  const readFilter = c.req.query("read");
  const source = c.req.query("source");

  let sql = "SELECT * FROM news_items WHERE user_id = ?";
  const params: any[] = [userId];

  if (readFilter === "0" || readFilter === "1") {
    sql += " AND read = ?";
    params.push(Number(readFilter));
  }
  if (source) {
    sql += " AND source = ?";
    params.push(source);
  }

  sql += " ORDER BY relevance_score DESC, created_at DESC LIMIT 50";

  const items = db.query(sql).all(...params);
  return c.json(items);
});

// PUT /api/news/:id/read — mark as read
router.put("/:id/read", (c) => {
  const userId = c.get("userId");
  const id = c.req.param("id");
  db.run("UPDATE news_items SET read = 1 WHERE id = ? AND user_id = ?", [id, userId]);
  return c.json({ ok: true });
});

// GET /api/news/sources — list sources
router.get("/sources", (c) => {
  const userId = c.get("userId");
  const sources = db.query("SELECT * FROM news_sources WHERE user_id = ? ORDER BY created_at").all(userId);
  return c.json(sources);
});

// POST /api/news/sources — add source
router.post("/sources", async (c) => {
  const userId = c.get("userId");
  const { type, name, url } = await c.req.json();
  if (!type || !name) return c.json({ error: "type and name required" }, 400);
  const id = crypto.randomUUID();
  db.run(
    "INSERT INTO news_sources (id, user_id, type, name, url, enabled, created_at) VALUES (?, ?, ?, ?, ?, 1, ?)",
    [id, userId, type, name, url ?? null, Date.now()]
  );
  const source = db.query("SELECT * FROM news_sources WHERE id = ?").get(id);
  return c.json(source, 201);
});

// DELETE /api/news/sources/:id
router.delete("/sources/:id", (c) => {
  const userId = c.get("userId");
  const id = c.req.param("id");
  db.run("DELETE FROM news_sources WHERE id = ? AND user_id = ?", [id, userId]);
  return c.json({ ok: true });
});

export default router;
