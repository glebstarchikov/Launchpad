# LLM Provider + Daily Auto-Summary — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a self-hosted LLM abstraction (Ollama-first, OpenAI-compatible) and a daily auto-summary feature that aggregates user activity and generates a structured digest using the LLM.

**Architecture:** A thin LLM client (`server/src/lib/llm.ts`) talks to any OpenAI-compatible API (Ollama by default). A daily summary endpoint collects activity from all project-related tables for the past 24h, sends it to the LLM, and stores the result. The Dashboard gets a "Daily Summary" widget with a "Generate" button.

**Tech Stack:** Bun + Hono + bun:sqlite (server), Ollama (local LLM), React 18 + TypeScript + Tailwind CSS + React Query 5 (client)

---

## File Structure

| Action | Path | Responsibility |
|--------|------|---------------|
| Create | `server/src/lib/llm.ts` | LLM provider abstraction — `generateText()` function |
| Create | `server/src/routes/daily-summary.ts` | API routes: generate + list + get by date |
| Modify | `server/src/db/index.ts` | Add `daily_summaries` table |
| Modify | `server/src/index.ts` | Mount daily-summary router |
| Modify | `server/src/routes/misc.ts` | Add LLM health check to existing misc router |
| Modify | `client/src/lib/types.ts` | Add `DailySummary` type + extend `DashboardData` |
| Modify | `client/src/lib/api.ts` | Add `dailySummary` API namespace |
| Modify | `client/src/pages/Dashboard.tsx` | Add "Daily Summary" widget card |

---

### Task 1: LLM Provider Abstraction

**Files:**
- Create: `server/src/lib/llm.ts`
- Modify: `server/src/routes/misc.ts`

- [ ] **Step 1: Create the LLM client**

Create `server/src/lib/llm.ts`:

```typescript
const LLM_BASE_URL = process.env.LLM_BASE_URL ?? "http://localhost:11434/v1";
const LLM_MODEL = process.env.LLM_MODEL ?? "llama3.1";
const LLM_API_KEY = process.env.LLM_API_KEY ?? "ollama";

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface GenerateOptions {
  maxTokens?: number;
  temperature?: number;
}

export async function generateText(
  prompt: string,
  options: GenerateOptions = {}
): Promise<string> {
  const { maxTokens = 1024, temperature = 0.3 } = options;

  const messages: ChatMessage[] = [{ role: "user", content: prompt }];

  const res = await fetch(`${LLM_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(LLM_API_KEY !== "ollama" ? { Authorization: `Bearer ${LLM_API_KEY}` } : {}),
    },
    body: JSON.stringify({
      model: LLM_MODEL,
      messages,
      max_tokens: maxTokens,
      temperature,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`LLM request failed (${res.status}): ${body}`);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content?.trim() ?? "";
}

export async function isLLMAvailable(): Promise<{ available: boolean; model: string; error?: string }> {
  try {
    const res = await fetch(`${LLM_BASE_URL}/models`, {
      signal: AbortSignal.timeout(3000),
      headers: LLM_API_KEY !== "ollama" ? { Authorization: `Bearer ${LLM_API_KEY}` } : {},
    });
    if (!res.ok) return { available: false, model: LLM_MODEL, error: `HTTP ${res.status}` };
    return { available: true, model: LLM_MODEL };
  } catch (e: any) {
    return { available: false, model: LLM_MODEL, error: e.message };
  }
}
```

- [ ] **Step 2: Add LLM health check endpoint**

In `server/src/routes/misc.ts`, add at the top with other imports:

```typescript
import { isLLMAvailable } from "../lib/llm.ts";
```

Then add a new route before the `export default router` line:

```typescript
router.get("/health/llm", async (c) => {
  const status = await isLLMAvailable();
  return c.json(status);
});
```

- [ ] **Step 3: Build and verify**

```bash
cd /Users/glebstarcikov/Launchpad && bun build client/src/main.tsx --outdir client/dist --target browser 2>&1 | tail -5
```

- [ ] **Step 4: Commit**

```bash
git add server/src/lib/llm.ts server/src/routes/misc.ts
git commit -m "feat: add LLM provider abstraction (Ollama-first, OpenAI-compatible)"
```

---

### Task 2: Daily Summaries Database Table

**Files:**
- Modify: `server/src/db/index.ts`

- [ ] **Step 1: Add daily_summaries table**

In `server/src/db/index.ts`, after the `files` table creation (around line 122), add:

```typescript
db.run(`CREATE TABLE IF NOT EXISTS daily_summaries (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  summary TEXT NOT NULL,
  activity_data TEXT NOT NULL,
  date TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE(user_id, date)
)`);
```

And add an index after the existing index block (around line 135):

```typescript
db.run("CREATE INDEX IF NOT EXISTS idx_daily_summaries_user_id ON daily_summaries(user_id)");
```

- [ ] **Step 2: Commit**

```bash
git add server/src/db/index.ts
git commit -m "feat: add daily_summaries table"
```

---

### Task 3: Daily Summary API Routes

**Files:**
- Create: `server/src/routes/daily-summary.ts`
- Modify: `server/src/index.ts`

- [ ] **Step 1: Create the daily summary router**

Create `server/src/routes/daily-summary.ts`:

```typescript
import { Hono } from "hono";
import { db } from "../db/index.ts";
import { requireAuth } from "../middleware/auth.ts";
import { generateText, isLLMAvailable } from "../lib/llm.ts";

const router = new Hono<{ Variables: { userId: string } }>();
router.use("*", requireAuth);

function collectActivity(userId: string, dateStr: string) {
  // dateStr is "YYYY-MM-DD" — compute start/end timestamps
  const start = new Date(`${dateStr}T00:00:00`).getTime();
  const end = start + 86400000; // +24h

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

  return {
    projectsUpdated,
    checklistCompleted,
    techDebtResolved,
    notesAdded,
    ideasCreated,
    ideasPromoted,
    goalsProgress,
    mrrEntries,
  };
}

function buildPrompt(activity: ReturnType<typeof collectActivity>, dateStr: string): string {
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

  // Check if already generated for this date
  const existing = db.query<{ id: string; summary: string }, [string, string]>(
    "SELECT id, summary FROM daily_summaries WHERE user_id = ? AND date = ?"
  ).get(userId, dateStr);
  if (existing) {
    return c.json({ id: existing.id, summary: existing.summary, date: dateStr, cached: true });
  }

  // Check LLM availability
  const llmStatus = await isLLMAvailable();
  if (!llmStatus.available) {
    return c.json({ error: "LLM not available. Make sure Ollama is running.", details: llmStatus.error }, 503);
  }

  // Collect activity
  const activity = collectActivity(userId, dateStr);
  const prompt = buildPrompt(activity, dateStr);

  if (!prompt) {
    return c.json({ error: "No activity found for this date." }, 404);
  }

  // Generate summary
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
```

- [ ] **Step 2: Mount the router**

In `server/src/index.ts`, add the import after the existing imports:

```typescript
import dailySummaryRouter from "./routes/daily-summary.ts";
```

And add the route after the existing `app.route` calls:

```typescript
app.route("/api/daily-summary", dailySummaryRouter);
```

- [ ] **Step 3: Build and verify**

```bash
cd /Users/glebstarcikov/Launchpad && bun build client/src/main.tsx --outdir client/dist --target browser 2>&1 | tail -5
```

- [ ] **Step 4: Commit**

```bash
git add server/src/routes/daily-summary.ts server/src/index.ts
git commit -m "feat: add daily summary API routes (generate, list, get by date)"
```

---

### Task 4: Client Types and API

**Files:**
- Modify: `client/src/lib/types.ts`
- Modify: `client/src/lib/api.ts`

- [ ] **Step 1: Add DailySummary type**

In `client/src/lib/types.ts`, add after the `DashboardData` interface (at the end of the file):

```typescript
export interface DailySummary {
  id: string;
  summary: string;
  date: string;
  created_at: number;
  cached?: boolean;
  activity_data?: string;
}

export interface LLMHealth {
  available: boolean;
  model: string;
  error?: string;
}
```

- [ ] **Step 2: Add daily summary API methods**

In `client/src/lib/api.ts`, add the import of the new types. Change the import line at the top to include `DailySummary` and `LLMHealth`:

```typescript
import type { User, Project, ProjectLink, LaunchChecklistItem, TechDebtItem, MrrEntry, Goal, ProjectStage, ProjectType, DashboardData, ProjectCountry, LegalItem, Note, Idea, FileRecord, DailySummary, LLMHealth } from "./types";
```

Then add a new namespace inside the `api` object, after the `projects` block (before the closing `};`):

```typescript
  dailySummary: {
    generate: (date?: string) =>
      req<DailySummary>("/daily-summary/generate", {
        method: "POST",
        body: JSON.stringify(date ? { date } : {}),
      }),
    list: () => req<DailySummary[]>("/daily-summary"),
    get: (date: string) => req<DailySummary>(`/daily-summary/${date}`),
  },
  health: {
    llm: () => req<LLMHealth>("/health/llm"),
  },
```

- [ ] **Step 3: Build and verify**

```bash
cd /Users/glebstarcikov/Launchpad && bun build client/src/main.tsx --outdir client/dist --target browser 2>&1 | tail -5
```

- [ ] **Step 4: Commit**

```bash
git add client/src/lib/types.ts client/src/lib/api.ts
git commit -m "feat: add daily summary types and API client"
```

---

### Task 5: Dashboard Daily Summary Widget

**Files:**
- Modify: `client/src/pages/Dashboard.tsx`

- [ ] **Step 1: Add daily summary widget to Dashboard**

In `client/src/pages/Dashboard.tsx`, add these imports at the top:

```typescript
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Sparkles, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
```

Update the existing `useQuery` import to also include `useMutation` and `useQueryClient` (they may already be imported via React Query — check and merge).

Add a new query and mutation inside the `Dashboard` component, after the existing `data` destructuring:

```typescript
  const queryClient = useQueryClient();

  const today = new Date().toISOString().split("T")[0];
  const { data: todaySummary } = useQuery({
    queryKey: ["daily-summary", today],
    queryFn: () => api.dailySummary.get(today),
    retry: false,
  });

  const { data: llmHealth } = useQuery({
    queryKey: ["health", "llm"],
    queryFn: api.health.llm,
    staleTime: 60_000,
  });

  const generateSummary = useMutation({
    mutationFn: () => api.dailySummary.generate(today),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["daily-summary", today] });
    },
  });
```

Then add a new Card widget after the Idea Inbox card (before the closing `</div>` of the main wrapper):

```tsx
      {/* Daily Summary */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Sparkles size={14} className="text-purple" />
              Daily Summary
            </CardTitle>
            {!todaySummary && llmHealth?.available && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => generateSummary.mutate()}
                disabled={generateSummary.isPending}
                className="h-7 text-xs"
              >
                {generateSummary.isPending ? (
                  <><Loader2 size={12} className="animate-spin mr-1" /> Generating...</>
                ) : (
                  "Generate"
                )}
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {todaySummary ? (
            <div className="prose prose-sm prose-invert max-w-none text-[13px] leading-relaxed [&_h2]:text-sm [&_h2]:font-semibold [&_h2]:mt-0 [&_h2]:mb-2 [&_h3]:text-xs [&_h3]:font-medium [&_h3]:text-muted-foreground [&_h3]:uppercase [&_h3]:tracking-wider [&_h3]:mt-4 [&_h3]:mb-1 [&_ul]:mt-1 [&_ul]:space-y-0.5 [&_li]:text-muted-foreground">
              <div dangerouslySetInnerHTML={{ __html: todaySummary.summary.replace(/^## .*\n?/m, "").replace(/### /g, "#### ") }} />
            </div>
          ) : llmHealth?.available === false ? (
            <div className="text-[12px] text-muted-foreground">
              <p>LLM not available. Start Ollama to enable daily summaries.</p>
              <p className="text-[11px] mt-1 font-mono text-muted-foreground/60">ollama serve && ollama pull llama3.1</p>
            </div>
          ) : generateSummary.isError ? (
            <p className="text-[12px] text-destructive">
              {(generateSummary.error as any)?.message ?? "Failed to generate summary."}
            </p>
          ) : (
            <Empty
              icon={<Sparkles size={20} />}
              title="No summary yet"
              sub={llmHealth?.available ? "Click Generate to create today's digest." : "Checking LLM availability..."}
            />
          )}
        </CardContent>
      </Card>
```

**Note:** The `dangerouslySetInnerHTML` is used here to render the markdown summary. For a safer approach, you could use a simple markdown-to-HTML converter. However, since the content is LLM-generated from our own data (not user-submitted), the risk is minimal. If you want to be safer, install a tiny markdown renderer and parse the summary string. For now, keep it simple — the LLM returns markdown which we display as-is using prose styling.

Actually, let's use a simpler approach — just display the raw markdown text with `whitespace-pre-wrap`:

Replace the `dangerouslySetInnerHTML` section with:

```tsx
          {todaySummary ? (
            <div className="text-[13px] text-muted-foreground whitespace-pre-wrap leading-relaxed">
              {todaySummary.summary}
            </div>
          ) : llmHealth?.available === false ? (
```

This renders the markdown as plain text with preserved formatting. Good enough for a v1 — proper markdown rendering can be added later.

- [ ] **Step 2: Build and verify**

```bash
cd /Users/glebstarcikov/Launchpad && bun build client/src/main.tsx --outdir client/dist --target browser 2>&1 | tail -5
```

- [ ] **Step 3: Build CSS**

```bash
cd /Users/glebstarcikov/Launchpad/client && npx tailwindcss -i src/index.css -o dist/index.css 2>&1 | tail -3
```

- [ ] **Step 4: Commit**

```bash
git add client/src/pages/Dashboard.tsx
git commit -m "feat: add daily summary widget to Dashboard with LLM generate button"
```

---

### Task 6: Playwright E2E Verification

**Files:**
- No new files — uses Playwright MCP tools

- [ ] **Step 1: Restart dev server**

```bash
cd /Users/glebstarcikov/Launchpad && lsof -ti:3001 | xargs kill -9 2>/dev/null; bun run dev &
```

- [ ] **Step 2: Log in and navigate to Dashboard**

Navigate to `http://localhost:3001`, log in if needed.

- [ ] **Step 3: Verify Daily Summary widget exists**

Take screenshot. Verify:
- "Daily Summary" card is visible on Dashboard below the Idea Inbox card
- Has a sparkles icon and "Daily Summary" title
- Shows either "Generate" button (if Ollama is running) or "LLM not available" message (if Ollama is not running)
- No errors in console

- [ ] **Step 4: Test LLM health endpoint**

Use browser to navigate to `http://localhost:3001/api/health/llm` (or use fetch in console). Verify it returns `{ available: true/false, model: "llama3.1" }`.

- [ ] **Step 5: Test generate (if Ollama available)**

If Ollama is running, click "Generate". Verify:
- Button shows "Generating..." with spinner
- After completion, summary text appears in the card
- Summary has markdown-formatted sections

If Ollama is NOT running, verify:
- "LLM not available" message is shown
- No "Generate" button visible
- Instructions to start Ollama are displayed

- [ ] **Step 6: Take final screenshot**

Take screenshot of Dashboard with the Daily Summary widget for visual verification.
