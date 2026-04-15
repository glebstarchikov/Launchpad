# Dashboard Metrics Expansion (A4) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reframe the Dashboard into a triage-first founder cockpit: hero Action Items punch list, secondary "What moved" activity feed, tertiary "This month" growth scoreboard. Integrate UptimeRobot for real site-down detection. Add `launch_checklist.priority` column so launch blockers can be surfaced cleanly.

**Architecture:** Three new dashboard endpoints (`action-items`, `activity`, `scoreboard`) in `server/src/routes/misc.ts`. UptimeRobot wrapper in `server/src/lib/uptimerobot.ts` with 90s in-memory cache and fail-open on errors. One additive schema migration (`launch_checklist.priority`). Client-side: Dashboard.tsx restructured with new components for MetricStrip, ActionItemsCard, ActivityFeedCard, ScoreboardCard. ProjectDetail.tsx gets deep-link support via `useSearchParams`.

**Tech Stack:** Bun, Hono, bun:sqlite, React 18, TanStack Query v5, React Router v6, Tailwind, shadcn/ui, lucide-react, UptimeRobot v2 API.

---

## File Structure

| Action | File | Purpose |
|---|---|---|
| Modify | `server/src/db/index.ts` | Add `launch_checklist.priority` ALTER TABLE |
| Modify | `server/src/lib/constants.ts` | Extend `ChecklistItem` type + tag 5 blocker items |
| Modify | `server/src/routes/projects.ts` | Update POST `/` seeding + POST `/launch-checklist` to accept priority |
| Modify | `server/src/routes/ideas.ts` | Update promote handler seeding to write priority |
| Create | `server/src/lib/uptimerobot.ts` | `getMonitorStatusMap()` with 90s cache, fail-open |
| Modify | `server/src/routes/misc.ts` | Add `/dashboard/action-items`, `/dashboard/activity`, `/dashboard/scoreboard` endpoints |
| Modify | `client/src/lib/types.ts` | Extend `LaunchChecklistItem`; add `ActionItem`, `DashboardActionItemsResponse`, `ActivityEvent`, `DashboardActivityResponse`, `DashboardScoreboardResponse` |
| Modify | `client/src/lib/api.ts` | Extend `api.projects.checklist.create`; add `api.dashboard.actionItems`, `api.dashboard.activity`, `api.dashboard.scoreboard` |
| Modify | `client/src/pages/ProjectDetail.tsx` | `useSearchParams` on tab state for deep-link support |
| Modify | `client/src/pages/Dashboard.tsx` | Full layout rework: MetricStrip, ActionItemsCard, ActivityFeedCard, ScoreboardCard; drop 4 stat cards and old GitHub commits card |
| Modify | `.env.example` | Add `UPTIMEROBOT_API_KEY=` line |

**Decomposition rationale:** All new dashboard endpoints live in `misc.ts` alongside the existing `/dashboard` endpoint (consistent with current organization; that file owns dashboard reads). UptimeRobot is its own wrapper file because it has distinct state (cache). Client-side, the new Dashboard components are defined inline in `Dashboard.tsx` initially — if the file grows past ~500 lines, a future pass can split them into `client/src/components/dashboard/*.tsx`, but V1 follows the codebase convention of inline component definitions.

---

## Task 1: DB Migration — Add `launch_checklist.priority` Column

**Files:**
- Modify: `server/src/db/index.ts` (append after existing `launch_checklist` migrations)

- [ ] **Step 1: Add the ALTER TABLE statement**

Open `server/src/db/index.ts`. Find the existing block of idempotent `launch_checklist` migrations (currently 3 lines, after the tech_debt migrations). They look like:

```typescript
try { db.run(`ALTER TABLE launch_checklist ADD COLUMN category TEXT`); } catch {}
try { db.run(`ALTER TABLE launch_checklist ADD COLUMN min_stage TEXT`); } catch {}
try { db.run(`ALTER TABLE launch_checklist ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0`); } catch {}
```

Append one new line immediately after:

```typescript
try { db.run(`ALTER TABLE launch_checklist ADD COLUMN priority TEXT`); } catch {}
```

- [ ] **Step 2: Verify the migration ran**

```bash
cd /Users/glebstarcikov/Launchpad && bun -e "import { db } from './server/src/db/index.ts'; const cols = db.query('PRAGMA table_info(launch_checklist)').all(); console.log(cols.map(c => c.name));"
```

Expected output includes `'priority'` in the array.

- [ ] **Step 3: Commit**

```bash
cd /Users/glebstarcikov/Launchpad && git add server/src/db/index.ts && git commit -m "feat(db): add priority column to launch_checklist"
```

---

## Task 2: Catalog — Extend `ChecklistItem` Type + Tag 5 Blocker Items

**Files:**
- Modify: `server/src/lib/constants.ts`

- [ ] **Step 1: Extend the ChecklistItem interface**

Find the interface definition (around line 22):

```typescript
export interface ChecklistItem {
  item: string;
  category: ChecklistCategory;
  min_stage: ChecklistStage;
  sort_order: number;
}
```

Replace with:

```typescript
export type ChecklistPriority = "blocker" | "important" | "recommended";

export interface ChecklistItem {
  item: string;
  category: ChecklistCategory;
  min_stage: ChecklistStage;
  sort_order: number;
  priority?: ChecklistPriority;
}
```

- [ ] **Step 2: Tag the 3 universal blocker items**

Find these 3 items in `CHECKLIST_UNIVERSAL`:

```typescript
{ item: "Build core feature #1 (the one thing)", category: "build", min_stage: "idea", sort_order: 230 },
```

Replace with:

```typescript
{ item: "Build core feature #1 (the one thing)", category: "build", min_stage: "idea", sort_order: 230, priority: "blocker" },
```

Find:

```typescript
{ item: "Configure custom domain", category: "infra", min_stage: "building", sort_order: 310 },
```

Replace with:

```typescript
{ item: "Configure custom domain", category: "infra", min_stage: "building", sort_order: 310, priority: "blocker" },
```

Find:

```typescript
{ item: "Install SSL certificate", category: "infra", min_stage: "building", sort_order: 320 },
```

Replace with:

```typescript
{ item: "Install SSL certificate", category: "infra", min_stage: "building", sort_order: 320, priority: "blocker" },
```

- [ ] **Step 3: Tag the 2 for-profit blocker items**

Find in `CHECKLIST_FOR_PROFIT`:

```typescript
{ item: "Draft Terms of Service", category: "legal", min_stage: "building", sort_order: 410 },
```

Replace with:

```typescript
{ item: "Draft Terms of Service", category: "legal", min_stage: "building", sort_order: 410, priority: "blocker" },
```

Find:

```typescript
{ item: "Draft Privacy Policy", category: "legal", min_stage: "building", sort_order: 420 },
```

Replace with:

```typescript
{ item: "Draft Privacy Policy", category: "legal", min_stage: "building", sort_order: 420, priority: "blocker" },
```

- [ ] **Step 4: Verify the type and counts**

```bash
cd /Users/glebstarcikov/Launchpad && bun -e "
import { CHECKLIST_UNIVERSAL, CHECKLIST_FOR_PROFIT } from './server/src/lib/constants.ts';
const universalBlockers = CHECKLIST_UNIVERSAL.filter(i => i.priority === 'blocker');
const forProfitBlockers = CHECKLIST_FOR_PROFIT.filter(i => i.priority === 'blocker');
console.log('universal blockers:', universalBlockers.length, universalBlockers.map(i => i.item));
console.log('for-profit blockers:', forProfitBlockers.length, forProfitBlockers.map(i => i.item));
"
```

Expected output:
```
universal blockers: 3 [ "Build core feature #1 (the one thing)", "Configure custom domain", "Install SSL certificate" ]
for-profit blockers: 2 [ "Draft Terms of Service", "Draft Privacy Policy" ]
```

- [ ] **Step 5: Commit**

```bash
cd /Users/glebstarcikov/Launchpad && git add server/src/lib/constants.ts && git commit -m "feat(checklist): tag 5 launch checklist items as blocker priority"
```

---

## Task 3: Server — Write Priority Into Seeding Handlers

**Files:**
- Modify: `server/src/routes/projects.ts` (POST `/` handler)
- Modify: `server/src/routes/ideas.ts` (promote handler)

- [ ] **Step 1: Update projects.ts seeding loop**

Open `server/src/routes/projects.ts`. Find the POST `/` handler. The checklist seeding block looks like:

```typescript
const projectType = (type ?? "for-profit") as "for-profit" | "open-source";
const insertItem = db.prepare(
  "INSERT INTO launch_checklist (id, project_id, item, completed, category, min_stage, sort_order, created_at) VALUES (?, ?, ?, 0, ?, ?, ?, ?)"
);
for (const entry of getDefaultChecklist(projectType)) {
  insertItem.run(crypto.randomUUID(), id, entry.item, entry.category, entry.min_stage, entry.sort_order, now);
}
```

Replace with:

```typescript
const projectType = (type ?? "for-profit") as "for-profit" | "open-source";
const insertItem = db.prepare(
  "INSERT INTO launch_checklist (id, project_id, item, completed, category, min_stage, sort_order, priority, created_at) VALUES (?, ?, ?, 0, ?, ?, ?, ?, ?)"
);
for (const entry of getDefaultChecklist(projectType)) {
  insertItem.run(crypto.randomUUID(), id, entry.item, entry.category, entry.min_stage, entry.sort_order, entry.priority ?? null, now);
}
```

- [ ] **Step 2: Update ideas.ts promote handler seeding**

Open `server/src/routes/ideas.ts`. Find the promote handler seeding block:

```typescript
// Seed default checklist for new project (promoted ideas default to for-profit)
const insertItem = db.prepare(
  "INSERT INTO launch_checklist (id, project_id, item, completed, category, min_stage, sort_order, created_at) VALUES (?, ?, ?, 0, ?, ?, ?, ?)"
);
for (const entry of getDefaultChecklist("for-profit")) {
  insertItem.run(crypto.randomUUID(), projectId, entry.item, entry.category, entry.min_stage, entry.sort_order, now);
}
```

Replace with:

```typescript
// Seed default checklist for new project (promoted ideas default to for-profit)
const insertItem = db.prepare(
  "INSERT INTO launch_checklist (id, project_id, item, completed, category, min_stage, sort_order, priority, created_at) VALUES (?, ?, ?, 0, ?, ?, ?, ?, ?)"
);
for (const entry of getDefaultChecklist("for-profit")) {
  insertItem.run(crypto.randomUUID(), projectId, entry.item, entry.category, entry.min_stage, entry.sort_order, entry.priority ?? null, now);
}
```

- [ ] **Step 3: Verify imports compile**

```bash
cd /Users/glebstarcikov/Launchpad && bun -e "import './server/src/routes/projects.ts'; import './server/src/routes/ideas.ts'; console.log('OK');"
```

Expected output: `OK`

- [ ] **Step 4: Commit**

```bash
cd /Users/glebstarcikov/Launchpad && git add server/src/routes/projects.ts server/src/routes/ideas.ts && git commit -m "feat(checklist): seed priority from catalog in project create + idea promote"
```

---

## Task 4: Server — Extend POST /launch-checklist to Accept Priority

**Files:**
- Modify: `server/src/routes/projects.ts` (POST `/launch-checklist` handler)

- [ ] **Step 1: Replace the POST handler**

Open `server/src/routes/projects.ts`. Find the POST `/:id/launch-checklist` handler:

```typescript
// POST /api/projects/:id/launch-checklist
router.post("/:id/launch-checklist", async (c) => {
  if (!ownsProject(c.req.param("id"), c.get("userId"))) {
    return c.json({ error: "Not found" }, 404);
  }
  const { item, category, min_stage } = await c.req.json();
  if (!item) return c.json({ error: "item required" }, 400);
  const id = crypto.randomUUID();
  const now = Date.now();
  db.run(
    "INSERT INTO launch_checklist (id, project_id, item, completed, category, min_stage, sort_order, created_at) VALUES (?, ?, ?, 0, ?, ?, ?, ?)",
    [id, c.req.param("id"), item, category ?? null, min_stage ?? null, 9999, now]
  );
  return c.json(
    db.query<LaunchChecklistItem, [string]>("SELECT * FROM launch_checklist WHERE id = ?").get(id),
    201
  );
});
```

Replace with:

```typescript
// POST /api/projects/:id/launch-checklist
router.post("/:id/launch-checklist", async (c) => {
  if (!ownsProject(c.req.param("id"), c.get("userId"))) {
    return c.json({ error: "Not found" }, 404);
  }
  const { item, category, min_stage, priority } = await c.req.json();
  if (!item) return c.json({ error: "item required" }, 400);
  const id = crypto.randomUUID();
  const now = Date.now();
  db.run(
    "INSERT INTO launch_checklist (id, project_id, item, completed, category, min_stage, sort_order, priority, created_at) VALUES (?, ?, ?, 0, ?, ?, ?, ?, ?)",
    [id, c.req.param("id"), item, category ?? null, min_stage ?? null, 9999, priority ?? null, now]
  );
  return c.json(
    db.query<LaunchChecklistItem, [string]>("SELECT * FROM launch_checklist WHERE id = ?").get(id),
    201
  );
});
```

- [ ] **Step 2: Also extend the PUT handler to allow updating `priority`**

Find the PUT `/:id/launch-checklist/:itemId` handler. It uses a dynamic SET-builder (added in the A1+A2 plan). Locate the block that reads body fields:

```typescript
const { completed, item, category, min_stage } = await c.req.json();
const sets: string[] = [];
const params: (string | number | null)[] = [];
if (completed !== undefined) { sets.push("completed = ?"); params.push(completed ? 1 : 0); }
if (item !== undefined) { sets.push("item = ?"); params.push(item); }
if (category !== undefined) { sets.push("category = ?"); params.push(category); }
if (min_stage !== undefined) { sets.push("min_stage = ?"); params.push(min_stage); }
```

Replace with:

```typescript
const { completed, item, category, min_stage, priority } = await c.req.json();
const sets: string[] = [];
const params: (string | number | null)[] = [];
if (completed !== undefined) { sets.push("completed = ?"); params.push(completed ? 1 : 0); }
if (item !== undefined) { sets.push("item = ?"); params.push(item); }
if (category !== undefined) { sets.push("category = ?"); params.push(category); }
if (min_stage !== undefined) { sets.push("min_stage = ?"); params.push(min_stage); }
if (priority !== undefined) { sets.push("priority = ?"); params.push(priority); }
```

- [ ] **Step 3: Verify the route file parses**

```bash
cd /Users/glebstarcikov/Launchpad && bun -e "import './server/src/routes/projects.ts'; console.log('OK');"
```

Expected: `OK`

- [ ] **Step 4: Commit**

```bash
cd /Users/glebstarcikov/Launchpad && git add server/src/routes/projects.ts && git commit -m "feat(checklist): accept priority in POST and PUT /launch-checklist"
```

---

## Task 5: Client — Extend `LaunchChecklistItem` + API Signature

**Files:**
- Modify: `client/src/lib/types.ts`
- Modify: `client/src/lib/api.ts`

- [ ] **Step 1: Extend the type**

Open `client/src/lib/types.ts`. Find the existing `ChecklistCategory` type (added in A2) and the `LaunchChecklistItem` interface:

```typescript
export type ChecklistCategory = "validation" | "build" | "infra" | "legal" | "marketing" | "launch" | "growth";

export interface LaunchChecklistItem {
  id: string;
  project_id: string;
  item: string;
  completed: 0 | 1;
  category: ChecklistCategory | null;
  min_stage: ProjectStage | null;
  sort_order: number;
  created_at: number;
}
```

Replace with:

```typescript
export type ChecklistCategory = "validation" | "build" | "infra" | "legal" | "marketing" | "launch" | "growth";
export type ChecklistPriority = "blocker" | "important" | "recommended";

export interface LaunchChecklistItem {
  id: string;
  project_id: string;
  item: string;
  completed: 0 | 1;
  category: ChecklistCategory | null;
  min_stage: ProjectStage | null;
  sort_order: number;
  priority: ChecklistPriority | null;
  created_at: number;
}
```

- [ ] **Step 2: Add ChecklistPriority to the api.ts type import**

Open `client/src/lib/api.ts`. Find the large type import line at the top. It currently includes `ChecklistCategory`. Add `ChecklistPriority`:

Find:
```typescript
import type { User, Project, ProjectLink, LaunchChecklistItem, ChecklistCategory, TechDebtItem, ...
```

Add `ChecklistPriority` after `ChecklistCategory`:
```typescript
import type { User, Project, ProjectLink, LaunchChecklistItem, ChecklistCategory, ChecklistPriority, TechDebtItem, ...
```

- [ ] **Step 3: Extend the checklist create + update signatures**

Find the `checklist` namespace in api.ts. The existing block (after A2 rework):

```typescript
checklist: {
  list: (id: string) => req<LaunchChecklistItem[]>(`/projects/${id}/launch-checklist`),
  create: (id: string, data: { item: string; category?: ChecklistCategory; min_stage?: ProjectStage }) =>
    req<LaunchChecklistItem>(`/projects/${id}/launch-checklist`, { method: "POST", body: JSON.stringify(data) }),
  update: (id: string, itemId: string, data: { completed?: boolean; item?: string; category?: ChecklistCategory; min_stage?: ProjectStage }) =>
    req<{ ok: true }>(`/projects/${id}/launch-checklist/${itemId}`, { method: "PUT", body: JSON.stringify(data) }),
  delete: (id: string, itemId: string) =>
    req<{ ok: true }>(`/projects/${id}/launch-checklist/${itemId}`, { method: "DELETE" }),
},
```

Replace with:

```typescript
checklist: {
  list: (id: string) => req<LaunchChecklistItem[]>(`/projects/${id}/launch-checklist`),
  create: (id: string, data: { item: string; category?: ChecklistCategory; min_stage?: ProjectStage; priority?: ChecklistPriority }) =>
    req<LaunchChecklistItem>(`/projects/${id}/launch-checklist`, { method: "POST", body: JSON.stringify(data) }),
  update: (id: string, itemId: string, data: { completed?: boolean; item?: string; category?: ChecklistCategory; min_stage?: ProjectStage; priority?: ChecklistPriority }) =>
    req<{ ok: true }>(`/projects/${id}/launch-checklist/${itemId}`, { method: "PUT", body: JSON.stringify(data) }),
  delete: (id: string, itemId: string) =>
    req<{ ok: true }>(`/projects/${id}/launch-checklist/${itemId}`, { method: "DELETE" }),
},
```

- [ ] **Step 4: Verify the client builds**

```bash
cd /Users/glebstarcikov/Launchpad && bun build client/src/main.tsx --outdir client/dist --target browser 2>&1 | grep -E "error|Bundled"
```

Expected: `Bundled NNN modules in NNms` — no errors.

- [ ] **Step 5: Commit**

```bash
cd /Users/glebstarcikov/Launchpad && git add client/src/lib/types.ts client/src/lib/api.ts && git commit -m "feat(checklist): extend LaunchChecklistItem + api.checklist with priority"
```

---

## Task 6: UptimeRobot Wrapper Module

**Files:**
- Create: `server/src/lib/uptimerobot.ts`
- Modify: `.env.example`

- [ ] **Step 1: Create the wrapper file**

Write this content to `server/src/lib/uptimerobot.ts`:

```typescript
// UptimeRobot v2 API wrapper with 90-second in-memory cache.
// Fail-open: all errors return an empty map so the caller can skip the site-down category silently.

const API_URL = "https://api.uptimerobot.com/v2/getMonitors";
const CACHE_TTL_MS = 90_000;
const REQUEST_TIMEOUT_MS = 5_000;

export type MonitorStatus = "up" | "down" | "paused";

interface CacheEntry {
  data: Map<string, MonitorStatus>;
  fetched_at: number;
}

let cache: CacheEntry | null = null;
let inFlight: Promise<Map<string, MonitorStatus>> | null = null;

/**
 * Normalizes a URL for matching: lowercased, protocol stripped, trailing slash stripped.
 * Example: "https://Example.com/" → "example.com"
 */
export function normalizeUrl(url: string): string {
  return url
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/$/, "");
}

/**
 * Returns a Map of normalized URL → status. Empty map if API key missing,
 * API fails, or cache is cold and refresh fails.
 */
export async function getMonitorStatusMap(): Promise<Map<string, MonitorStatus>> {
  const apiKey = process.env.UPTIMEROBOT_API_KEY;
  if (!apiKey) return new Map();

  // Return fresh cache
  if (cache && Date.now() - cache.fetched_at < CACHE_TTL_MS) {
    return cache.data;
  }

  // Share in-flight refresh
  if (inFlight) return inFlight;

  inFlight = fetchAndCache(apiKey).finally(() => {
    inFlight = null;
  });
  return inFlight;
}

async function fetchAndCache(apiKey: string): Promise<Map<string, MonitorStatus>> {
  try {
    const body = new URLSearchParams({ api_key: apiKey, format: "json" });
    const res = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!res.ok) {
      console.warn(`[uptimerobot] HTTP ${res.status}, returning empty map`);
      return returnOrStale();
    }
    const json = await res.json() as { stat: string; monitors?: Array<{ url: string; status: number }> };
    if (json.stat !== "ok" || !Array.isArray(json.monitors)) {
      console.warn("[uptimerobot] API returned non-ok stat, returning empty map");
      return returnOrStale();
    }
    const map = new Map<string, MonitorStatus>();
    for (const m of json.monitors) {
      if (!m.url) continue;
      const status: MonitorStatus =
        m.status === 2 ? "up" :
        m.status === 8 || m.status === 9 ? "down" :
        "paused";
      map.set(normalizeUrl(m.url), status);
    }
    cache = { data: map, fetched_at: Date.now() };
    return map;
  } catch (err) {
    console.warn("[uptimerobot] fetch failed:", (err as Error).message);
    return returnOrStale();
  }
}

function returnOrStale(): Map<string, MonitorStatus> {
  // If we have stale cache, return it rather than nothing
  if (cache) return cache.data;
  return new Map();
}
```

- [ ] **Step 2: Add env var to `.env.example`**

Open `.env.example` and append:

```
UPTIMEROBOT_API_KEY=    # optional; enables dashboard site-down action items
```

- [ ] **Step 3: Verify the module imports cleanly**

```bash
cd /Users/glebstarcikov/Launchpad && bun -e "import { getMonitorStatusMap, normalizeUrl } from './server/src/lib/uptimerobot.ts'; console.log('norm:', normalizeUrl('https://Example.com/')); const m = await getMonitorStatusMap(); console.log('map size:', m.size);"
```

Expected output:
```
norm: example.com
map size: 0
```

(The map size will be 0 if `UPTIMEROBOT_API_KEY` is not set, or the actual monitor count if it is.)

- [ ] **Step 4: Commit**

```bash
cd /Users/glebstarcikov/Launchpad && git add server/src/lib/uptimerobot.ts .env.example && git commit -m "feat(uptime): UptimeRobot wrapper with 90s cache and fail-open"
```

---

## Task 7: Server — GET /dashboard/action-items Endpoint

**Files:**
- Modify: `server/src/routes/misc.ts`

- [ ] **Step 1: Add imports at top of misc.ts**

Open `server/src/routes/misc.ts`. Find the existing imports at the top:

```typescript
import { Hono } from "hono";
import { db } from "../db/index.ts";
import { requireAuth } from "../middleware/auth.ts";
import type { Project, Idea } from "../types/index.ts";
import { isLLMAvailable } from "../lib/llm.ts";
import { isWhisperAvailable } from "../lib/whisper.ts";
```

Add immediately after:

```typescript
import { getMonitorStatusMap, normalizeUrl } from "../lib/uptimerobot.ts";
```

- [ ] **Step 2: Add the ActionItem type definitions in misc.ts**

Below the imports, before the router declaration, add:

```typescript
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
```

- [ ] **Step 3: Add the endpoint after the existing `/dashboard` handler**

Find the existing `router.get("/dashboard", ...)` handler. Immediately after it (before the `/ping` handler), insert:

```typescript
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

  // 5. stale-project (warning) — building/beta/live projects untouched 14+ days; idea-stage 60 days
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

  // 7. needs-review (warning) — legal items with status_note
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

  // 8. stale-mrr (warning) — for-profit + live/growing with no MRR entry in 30 days
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
```

- [ ] **Step 4: Verify the route file still parses**

```bash
cd /Users/glebstarcikov/Launchpad && bun -e "import './server/src/routes/misc.ts'; console.log('OK');"
```

Expected: `OK`

- [ ] **Step 5: Quick integration test via curl**

Restart the dev server:

```bash
cd /Users/glebstarcikov/Launchpad && lsof -ti:3001 | xargs kill -9 2>/dev/null; bun run dev > /tmp/launchpad-dev.log 2>&1 &
sleep 3
```

Then log in via browser to get a cookie, and check the endpoint:

```bash
# You can't easily curl an authenticated endpoint without a cookie, but you can verify the route is registered:
curl -s http://localhost:3001/api/dashboard/action-items -w "\n%{http_code}\n"
```

Expected: `401` status code (auth required) — confirms the route is registered and reachable. Getting `404` would mean the route didn't mount.

- [ ] **Step 6: Commit**

```bash
cd /Users/glebstarcikov/Launchpad && git add server/src/routes/misc.ts && git commit -m "feat(dashboard): GET /dashboard/action-items with 10 triage categories"
```

---

## Task 8: Server — GET /dashboard/activity Endpoint

**Files:**
- Modify: `server/src/routes/misc.ts`

- [ ] **Step 1: Add imports for the GitHub client**

Open `server/src/routes/misc.ts`. Find the existing imports and add:

```typescript
import { getCommits } from "../lib/github.ts";
```

(Place after the `uptimerobot` import from Task 7.)

- [ ] **Step 2: Add the ActivityEvent type**

Below the `ActionItem` interface from Task 7, add:

```typescript
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
```

- [ ] **Step 3: Add the endpoint after the action-items handler**

Insert this handler immediately after the `/dashboard/action-items` handler (before the `/ping` handler):

```typescript
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

  // news (grouped)
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
```

- [ ] **Step 4: Verify the route file parses**

```bash
cd /Users/glebstarcikov/Launchpad && bun -e "import './server/src/routes/misc.ts'; console.log('OK');"
```

Expected: `OK`

- [ ] **Step 5: Commit**

```bash
cd /Users/glebstarcikov/Launchpad && git add server/src/routes/misc.ts && git commit -m "feat(dashboard): GET /dashboard/activity with 5 event sources"
```

---

## Task 9: Server — GET /dashboard/scoreboard Endpoint

**Files:**
- Modify: `server/src/routes/misc.ts`

- [ ] **Step 1: Add the endpoint after the activity handler**

Insert this handler immediately after the `/dashboard/activity` handler:

```typescript
router.get("/dashboard/scoreboard", (c) => {
  const userId = c.get("userId");
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).getTime();

  // MRR current: sum of latest mrr_history entry per project
  const mrrCurrent = db.query<{ total: number | null }, [string]>(
    `SELECT COALESCE(SUM(m.mrr), 0) as total
     FROM mrr_history m
     INNER JOIN (SELECT project_id, MAX(recorded_at) as max_at FROM mrr_history GROUP BY project_id) latest
       ON m.project_id = latest.project_id AND m.recorded_at = latest.max_at
     INNER JOIN projects p ON m.project_id = p.id
     WHERE p.user_id = ?`
  ).get(userId)?.total ?? 0;

  // MRR previous: sum of latest mrr_history entry per project as-of month start
  const mrrPrevious = db.query<{ total: number | null }, [string, number]>(
    `SELECT COALESCE(SUM(m.mrr), 0) as total
     FROM mrr_history m
     INNER JOIN (SELECT project_id, MAX(recorded_at) as max_at FROM mrr_history WHERE recorded_at < ? GROUP BY project_id) latest
       ON m.project_id = latest.project_id AND m.recorded_at = latest.max_at
     INNER JOIN projects p ON m.project_id = p.id
     WHERE p.user_id = ?`
  ).get(userId, monthStart)?.total ?? 0;

  const mrrDelta = mrrCurrent - mrrPrevious;
  const mrrDeltaPct = mrrPrevious > 0 ? Math.round((mrrDelta / mrrPrevious) * 100) : null;

  // Projects shipped this month: live stage + updated_at this month
  const projectsShippedCurrent = db.query<{ n: number }, [string, number]>(
    "SELECT COUNT(*) as n FROM projects WHERE user_id = ? AND stage = 'live' AND updated_at >= ?"
  ).get(userId, monthStart)?.n ?? 0;

  const projectsShippedPrevious = db.query<{ n: number }, [string, number, number]>(
    "SELECT COUNT(*) as n FROM projects WHERE user_id = ? AND stage = 'live' AND updated_at >= ? AND updated_at < ?"
  ).get(userId, prevMonthStart, monthStart)?.n ?? 0;

  const projectsShippedDelta = projectsShippedCurrent - projectsShippedPrevious;

  // Legal complete ratio (current only)
  const legalStats = db.query<{ total: number; done: number }, [string]>(
    `SELECT COUNT(*) as total, SUM(CASE WHEN li.completed = 1 THEN 1 ELSE 0 END) as done
     FROM legal_items li INNER JOIN projects p ON li.project_id = p.id
     WHERE p.user_id = ?`
  ).get(userId);
  const legalCompletePct = legalStats && legalStats.total > 0
    ? Math.round((legalStats.done / legalStats.total) * 100)
    : 0;

  // Checklist complete ratio (current only)
  const checklistStats = db.query<{ total: number; done: number }, [string]>(
    `SELECT COUNT(*) as total, SUM(CASE WHEN lc.completed = 1 THEN 1 ELSE 0 END) as done
     FROM launch_checklist lc INNER JOIN projects p ON lc.project_id = p.id
     WHERE p.user_id = ?`
  ).get(userId);
  const checklistCompletePct = checklistStats && checklistStats.total > 0
    ? Math.round((checklistStats.done / checklistStats.total) * 100)
    : 0;

  return c.json({
    mrr: { current: mrrCurrent, previous: mrrPrevious, delta: mrrDelta, delta_pct: mrrDeltaPct },
    projectsShipped: { current: projectsShippedCurrent, previous: projectsShippedPrevious, delta: projectsShippedDelta },
    legalComplete: { current_pct: legalCompletePct },
    checklistComplete: { current_pct: checklistCompletePct },
  });
});
```

- [ ] **Step 2: Verify the route file parses**

```bash
cd /Users/glebstarcikov/Launchpad && bun -e "import './server/src/routes/misc.ts'; console.log('OK');"
```

Expected: `OK`

- [ ] **Step 3: Commit**

```bash
cd /Users/glebstarcikov/Launchpad && git add server/src/routes/misc.ts && git commit -m "feat(dashboard): GET /dashboard/scoreboard with MRR + projects shipped MoM"
```

---

## Task 10: Client — Dashboard Types and API Methods

**Files:**
- Modify: `client/src/lib/types.ts`
- Modify: `client/src/lib/api.ts`

- [ ] **Step 1: Add the new types**

Open `client/src/lib/types.ts`. Append at the bottom of the file:

```typescript
export type ActionItemSeverity = "critical" | "warning" | "info";
export type ActionItemCategory =
  | "site-down" | "compliance-blocker" | "tech-debt-high" | "launch-blocker"
  | "stale-project" | "overdue-goal" | "needs-review" | "stale-mrr"
  | "compliance-important" | "news-unread";
export type ActionItemTarget = "project" | "legal" | "checklist" | "tech-debt" | "goals" | "news";

export interface ActionItem {
  id: string;
  severity: ActionItemSeverity;
  category: ActionItemCategory;
  label: string;
  detail: string | null;
  project_id: string | null;
  project_name: string | null;
  target: ActionItemTarget;
  created_at: number;
}

export interface DashboardActionItemsResponse {
  items: ActionItem[];
  counts: { critical: number; warning: number; info: number };
  generated_at: number;
}

export interface ActivityEvent {
  id: string;
  kind: "commit" | "mrr-update" | "new-idea" | "news" | "tech-debt-added";
  icon: string;
  label: string;
  project_id: string | null;
  project_name: string | null;
  timestamp: number;
  deep_link: string | null;
}

export interface DashboardActivityResponse {
  events: ActivityEvent[];
}

export interface DashboardScoreboardResponse {
  mrr: { current: number; previous: number; delta: number; delta_pct: number | null };
  projectsShipped: { current: number; previous: number; delta: number };
  legalComplete: { current_pct: number };
  checklistComplete: { current_pct: number };
}
```

- [ ] **Step 2: Extend the api.ts type import**

Open `client/src/lib/api.ts`. Find the type import line. Add `DashboardActionItemsResponse`, `DashboardActivityResponse`, `DashboardScoreboardResponse` to the import list (place them alongside the existing `DashboardData`).

Find the existing import fragment: `..., DashboardData, ProjectCountry, ...`

Replace with: `..., DashboardData, DashboardActionItemsResponse, DashboardActivityResponse, DashboardScoreboardResponse, ProjectCountry, ...`

- [ ] **Step 3: Extend the `api.dashboard` namespace**

Find the existing `dashboard` namespace:

```typescript
dashboard: {
  get: () => req<DashboardData>("/dashboard"),
},
```

Replace with:

```typescript
dashboard: {
  get: () => req<DashboardData>("/dashboard"),
  actionItems: () => req<DashboardActionItemsResponse>("/dashboard/action-items"),
  activity: () => req<DashboardActivityResponse>("/dashboard/activity"),
  scoreboard: () => req<DashboardScoreboardResponse>("/dashboard/scoreboard"),
},
```

- [ ] **Step 4: Verify the client builds**

```bash
cd /Users/glebstarcikov/Launchpad && bun build client/src/main.tsx --outdir client/dist --target browser 2>&1 | grep -E "error|Bundled"
```

Expected: `Bundled NNN modules in NNms` — no errors.

- [ ] **Step 5: Commit**

```bash
cd /Users/glebstarcikov/Launchpad && git add client/src/lib/types.ts client/src/lib/api.ts && git commit -m "feat(dashboard): client types + api for action-items, activity, scoreboard"
```

---

## Task 11: Client — ProjectDetail Deep-Link Support via useSearchParams

**Files:**
- Modify: `client/src/pages/ProjectDetail.tsx`

- [ ] **Step 1: Import useSearchParams**

Find the existing react-router-dom import at the top of the file. It currently looks like:

```typescript
import { useNavigate, useParams } from "react-router-dom";
```

Replace with:

```typescript
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
```

- [ ] **Step 2: Replace the tab state with search-params-synced state**

Find the existing tab state declaration (around line 38):

```typescript
const [tab, setTab] = useState("overview");
```

Replace with:

```typescript
const [searchParams, setSearchParams] = useSearchParams();
const VALID_TABS = ["overview", "health", "revenue", "compliance", "buildlog", "github", "files"];
const rawTab = searchParams.get("tab");
const tab = rawTab && VALID_TABS.includes(rawTab) ? rawTab : "overview";
const setTab = (next: string) => {
  const nextParams = new URLSearchParams(searchParams);
  if (next === "overview") {
    nextParams.delete("tab");
  } else {
    nextParams.set("tab", next);
  }
  setSearchParams(nextParams, { replace: true });
};
```

This reads the `?tab=` param on mount and whenever the URL changes. Invalid tab values silently fall back to `overview`. Clicking a Tabs trigger updates the URL (`replace: true` to avoid cluttering browser history).

- [ ] **Step 3: Verify the build**

```bash
cd /Users/glebstarcikov/Launchpad && bun build client/src/main.tsx --outdir client/dist --target browser 2>&1 | grep -E "error|Bundled"
```

Expected: `Bundled NNN modules in NNms`

- [ ] **Step 4: Manual smoke test**

Restart the dev server, open any project, and navigate directly to `http://localhost:3001/projects/<id>?tab=health`. Expected: the Health tab is active. Click other tabs and verify the URL updates (`?tab=...`). Click Overview and verify the `?tab=` param disappears.

- [ ] **Step 5: Commit**

```bash
cd /Users/glebstarcikov/Launchpad && git add client/src/pages/ProjectDetail.tsx && git commit -m "feat(project-detail): deep-link tabs via ?tab= search param"
```

---

## Task 12: Client — MetricStrip Replaces 4 Stat Cards

**Files:**
- Modify: `client/src/pages/Dashboard.tsx`

- [ ] **Step 1: Remove the 4 stat cards and replace with a MetricStrip**

Open `client/src/pages/Dashboard.tsx`. Find the block containing the 4 stat cards (Total MRR, Projects, Idea Inbox, Legal Pending). It starts with `{/* Stat cards */}` and ends just before `<div className="grid grid-cols-1 lg:grid-cols-3 gap-4">` (the Pipeline row).

The entire block currently looks like:

```tsx
{/* Stat cards */}
<div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
  <Card>
    <CardContent className="p-5">
      {/* ... Total MRR ... */}
    </CardContent>
  </Card>
  <Card>
    <CardContent className="p-5">
      {/* ... Projects ... */}
    </CardContent>
  </Card>
  <Card>
    <CardContent className="p-5">
      {/* ... Idea Inbox ... */}
    </CardContent>
  </Card>
  <Card>
    <CardContent className="p-5">
      {/* ... Legal Pending ... */}
    </CardContent>
  </Card>
</div>
```

(4 Cards inside a 4-column grid.)

Delete the entire `{/* Stat cards */} ... </div>` block.

- [ ] **Step 2: Update the dashboard header to include the metric strip**

Find the existing header block:

```tsx
<div className="flex items-center justify-between">
  <h1 className="text-lg font-semibold">Dashboard</h1>
</div>
```

Replace with:

```tsx
<div className="flex items-center justify-between flex-wrap gap-3">
  <h1 className="text-lg font-semibold">Dashboard</h1>
  <div className="flex items-center gap-4 text-xs font-mono tabular-nums">
    <button
      onClick={() => navigate("/projects")}
      className={cn(
        "hover:text-foreground transition-colors",
        mrr > 0 ? "text-success" : "text-muted-foreground"
      )}
    >
      MRR {fmt(mrr)}
    </button>
    <button
      onClick={() => navigate("/projects")}
      className="text-muted-foreground hover:text-foreground transition-colors"
    >
      Projects {projectCount}
    </button>
    <button
      onClick={() => navigate("/ideas")}
      className="text-muted-foreground hover:text-foreground transition-colors"
    >
      Ideas {ideaCount}
    </button>
    <button
      onClick={() => navigate("/projects")}
      className={cn(
        "transition-colors hover:text-foreground",
        legalPending > 0 ? "text-destructive" : "text-muted-foreground"
      )}
    >
      Legal {legalPending}{legalPending > 0 && " ⚠"}
    </button>
  </div>
</div>
```

- [ ] **Step 3: Verify the build**

```bash
cd /Users/glebstarcikov/Launchpad && bun build client/src/main.tsx --outdir client/dist --target browser 2>&1 | grep -E "error|Bundled"
```

Expected: `Bundled NNN modules in NNms`

- [ ] **Step 4: Commit**

```bash
cd /Users/glebstarcikov/Launchpad && git add client/src/pages/Dashboard.tsx && git commit -m "feat(dashboard): replace 4 stat cards with compact metric strip in header"
```

---

## Task 13: Client — ActionItemsCard Component

**Files:**
- Modify: `client/src/pages/Dashboard.tsx`

- [ ] **Step 1: Add the ActionItemsCard component above the `Dashboard()` function**

Open `client/src/pages/Dashboard.tsx`. Find the `export default function Dashboard()` declaration. Immediately BEFORE it, add the component:

```typescript
const SEVERITY_DOT_CLASS: Record<string, string> = {
  critical: "bg-destructive",
  warning: "bg-warning",
  info: "bg-info",
};

const SEVERITY_LABEL: Record<string, string> = {
  critical: "Critical",
  warning: "Warning",
  info: "Info",
};

function deepLinkFor(item: import("@/lib/types").ActionItem): string {
  if (item.target === "news") return "/news";
  if (!item.project_id) return "/projects";
  const tabMap: Record<string, string> = {
    project: "",                    // overview
    legal: "compliance",
    checklist: "overview",
    "tech-debt": "health",
    goals: "revenue",
  };
  const tab = tabMap[item.target] ?? "";
  return tab ? `/projects/${item.project_id}?tab=${tab}` : `/projects/${item.project_id}`;
}

function ActionItemsCard() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const { data, isLoading, isError } = useQuery({
    queryKey: ["dashboard", "action-items"],
    queryFn: api.dashboard.actionItems,
    staleTime: 60_000,
  });

  const items = data?.items ?? [];
  const counts = data?.counts ?? { critical: 0, warning: 0, info: 0 };

  const bySeverity = {
    critical: items.filter((i) => i.severity === "critical"),
    warning: items.filter((i) => i.severity === "warning"),
    info: items.filter((i) => i.severity === "info"),
  };

  const renderSection = (severity: "critical" | "warning" | "info") => {
    const list = bySeverity[severity];
    if (list.length === 0) return null;
    const isExpanded = expanded[severity] ?? false;
    const visible = isExpanded ? list : list.slice(0, 6);
    const hidden = list.length - visible.length;

    return (
      <div key={severity}>
        <h4 className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium mb-1.5 flex items-center gap-1.5">
          <span className={cn("h-1.5 w-1.5 rounded-full", SEVERITY_DOT_CLASS[severity])} />
          {SEVERITY_LABEL[severity]} ({list.length})
        </h4>
        <div className="space-y-1">
          {visible.map((item) => (
            <button
              key={item.id}
              onClick={() => navigate(deepLinkFor(item))}
              className="flex items-center gap-3 px-3 py-2 rounded-md hover:bg-secondary/50 group w-full text-left"
            >
              <span className={cn("h-2 w-2 rounded-full shrink-0", SEVERITY_DOT_CLASS[severity])} />
              <span className="text-[13px] flex-1 truncate">{item.label}</span>
              {item.project_name && (
                <span className="text-[11px] text-muted-foreground shrink-0">{item.project_name}</span>
              )}
              <ArrowUpRight size={12} className="text-muted-foreground opacity-0 group-hover:opacity-100 shrink-0" />
            </button>
          ))}
          {hidden > 0 && (
            <button
              onClick={() => setExpanded((e) => ({ ...e, [severity]: true }))}
              className="text-[11px] text-muted-foreground hover:text-foreground pl-3 py-1"
            >
              + {hidden} more
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium">Action Items</CardTitle>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-mono text-muted-foreground tabular-nums">
              {counts.critical} critical · {counts.warning} warning · {counts.info} info
            </span>
            <Button
              size="sm"
              variant="ghost"
              className="h-6 w-6 p-0"
              onClick={() => queryClient.invalidateQueries({ queryKey: ["dashboard", "action-items"] })}
              title="Refresh"
            >
              <RefreshCw size={11} />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="py-4 space-y-2">
            <div className="h-6 bg-card rounded border border-border animate-pulse" />
            <div className="h-6 bg-card rounded border border-border animate-pulse" />
          </div>
        ) : isError ? (
          <p className="text-xs text-destructive py-2">Failed to load action items.</p>
        ) : items.length === 0 ? (
          <div className="flex items-center gap-2 py-6 justify-center text-success">
            <span className="h-2 w-2 rounded-full bg-success" />
            <span className="text-sm">All clear — nothing needs attention</span>
          </div>
        ) : (
          <div className="space-y-4">
            {renderSection("critical")}
            {renderSection("warning")}
            {renderSection("info")}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Render ActionItemsCard at the top of the Dashboard content**

Find the `return (...)` of the `Dashboard` function. Inside the outer `<div className="px-8 py-6 space-y-6">`, after the header row (containing the metric strip), and BEFORE the `<div className="grid grid-cols-1 lg:grid-cols-3 gap-4">` (Pipeline row), add:

```tsx
<ActionItemsCard />
```

- [ ] **Step 3: Verify the build**

```bash
cd /Users/glebstarcikov/Launchpad && bun build client/src/main.tsx --outdir client/dist --target browser 2>&1 | grep -E "error|Bundled"
```

Expected: `Bundled NNN modules in NNms`

- [ ] **Step 4: Commit**

```bash
cd /Users/glebstarcikov/Launchpad && git add client/src/pages/Dashboard.tsx && git commit -m "feat(dashboard): ActionItemsCard with severity sections + deep-link navigation"
```

---

## Task 14: Client — ActivityFeedCard Replaces GitHub Commits Card

**Files:**
- Modify: `client/src/pages/Dashboard.tsx`

- [ ] **Step 1: Remove the existing GitHub commits card**

Find the block that starts with `{/* GitHub Activity */}` and ends with `</Card>` followed by `)}`. It currently looks like:

```tsx
{/* GitHub Activity */}
{githubActivity && githubActivity.length > 0 && (
  <Card>
    <CardHeader className="pb-3">
      {/* ... Today's Commits ... */}
    </CardHeader>
    <CardContent>
      {/* ... commit list ... */}
    </CardContent>
  </Card>
)}
```

Delete the entire block.

- [ ] **Step 2: Remove the now-unused `githubActivity` query**

Find this block near the top of `Dashboard()`:

```typescript
const { data: githubActivity } = useQuery({
  queryKey: ["github", "activity"],
  queryFn: api.github.activity,
  staleTime: 60_000,
});
```

Delete it. Also remove `GitCommit` from the lucide-react import if it's not used anywhere else on the page. Check first:

```bash
grep -n "GitCommit" client/src/pages/Dashboard.tsx
```

If only the import line shows (no other usages), remove `GitCommit` from the import list.

- [ ] **Step 3: Add the ActivityFeedCard component**

Immediately below the `ActionItemsCard` component (still above `Dashboard()`), add:

```typescript
function formatRelativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function ActivityFeedCard() {
  const navigate = useNavigate();
  const [showAll, setShowAll] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["dashboard", "activity"],
    queryFn: api.dashboard.activity,
    staleTime: 60_000,
  });

  const events = data?.events ?? [];
  const visible = showAll ? events : events.slice(0, 8);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium">What moved (last 24h)</CardTitle>
          <span className="text-[11px] font-mono text-muted-foreground tabular-nums">
            {events.length} event{events.length === 1 ? "" : "s"}
          </span>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="py-2 space-y-2">
            <div className="h-5 bg-card rounded border border-border animate-pulse" />
            <div className="h-5 bg-card rounded border border-border animate-pulse" />
          </div>
        ) : events.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-4">No activity yet today</p>
        ) : (
          <div className="space-y-1.5">
            {visible.map((event) => (
              <button
                key={event.id}
                onClick={() => event.deep_link && navigate(event.deep_link)}
                disabled={!event.deep_link}
                className="flex items-center gap-3 px-2 py-1.5 rounded-md hover:bg-secondary/50 group w-full text-left disabled:cursor-default disabled:hover:bg-transparent"
              >
                <span className="text-[11px] text-muted-foreground font-mono tabular-nums shrink-0 w-14">
                  {formatRelativeTime(event.timestamp)}
                </span>
                <span className="text-base shrink-0">{event.icon}</span>
                <span className="text-[13px] flex-1 truncate">{event.label}</span>
                {event.project_name && (
                  <span className="text-[11px] text-muted-foreground shrink-0">{event.project_name}</span>
                )}
              </button>
            ))}
            {events.length > 8 && !showAll && (
              <button
                onClick={() => setShowAll(true)}
                className="text-[11px] text-muted-foreground hover:text-foreground pl-2 py-1 w-full text-left"
              >
                Show {events.length - 8} more
              </button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 4: Render ActivityFeedCard between ActionItemsCard and the Pipeline row**

In the `Dashboard` return JSX, add `<ActivityFeedCard />` immediately after `<ActionItemsCard />` and before the Pipeline row.

- [ ] **Step 5: Verify the build**

```bash
cd /Users/glebstarcikov/Launchpad && bun build client/src/main.tsx --outdir client/dist --target browser 2>&1 | grep -E "error|Bundled"
```

Expected: `Bundled NNN modules in NNms`

- [ ] **Step 6: Commit**

```bash
cd /Users/glebstarcikov/Launchpad && git add client/src/pages/Dashboard.tsx && git commit -m "feat(dashboard): ActivityFeedCard replacing old GitHub commits card"
```

---

## Task 15: Client — ScoreboardCard Component

**Files:**
- Modify: `client/src/pages/Dashboard.tsx`

- [ ] **Step 1: Add the ScoreboardCard component**

Below the `ActivityFeedCard` definition (still above `Dashboard()`), add:

```typescript
function ScoreboardCard() {
  const { data, isLoading } = useQuery({
    queryKey: ["dashboard", "scoreboard"],
    queryFn: api.dashboard.scoreboard,
    staleTime: 60_000,
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-sm font-medium">This month</CardTitle></CardHeader>
        <CardContent>
          <div className="h-24 bg-card rounded border border-border animate-pulse" />
        </CardContent>
      </Card>
    );
  }

  if (!data) return null;

  const renderDeltaRow = (
    label: string,
    current: string,
    delta: number,
    formatDelta: (n: number) => string,
    deltaPct: number | null = null,
  ) => (
    <div className="flex items-center justify-between py-2">
      <span className="text-sm text-muted-foreground">{label}</span>
      <div className="flex items-center gap-3">
        <span className="font-mono text-sm tabular-nums">{current}</span>
        {delta !== 0 && (
          <span className={cn("text-xs font-mono tabular-nums", delta > 0 ? "text-success" : "text-destructive")}>
            {delta > 0 ? "↑" : "↓"} {formatDelta(Math.abs(delta))}
            {deltaPct !== null && ` (${deltaPct > 0 ? "+" : ""}${deltaPct}%)`}
          </span>
        )}
      </div>
    </div>
  );

  const renderStaticRow = (label: string, value: string) => (
    <div className="flex items-center justify-between py-2">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="font-mono text-sm tabular-nums">{value}</span>
    </div>
  );

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium">This month</CardTitle>
      </CardHeader>
      <CardContent className="divide-y divide-border">
        {renderDeltaRow("MRR", fmt(data.mrr.current), data.mrr.delta, fmt, data.mrr.delta_pct)}
        {renderDeltaRow("Projects shipped", String(data.projectsShipped.current), data.projectsShipped.delta, String)}
        {renderStaticRow("Legal complete", `${data.legalComplete.current_pct}%`)}
        {renderStaticRow("Launch checklist", `${data.checklistComplete.current_pct}%`)}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Render ScoreboardCard near the bottom of the Dashboard**

In the `Dashboard` return JSX, add `<ScoreboardCard />` AFTER the "Today's Signals" ExpandableCard and BEFORE the "Daily Summary" ExpandableCard. The final top-to-bottom order should match section 7.1 of the spec:

1. Header row with metric strip
2. ActionItemsCard
3. ActivityFeedCard
4. Pipeline + Recent Projects row
5. Idea Inbox ExpandableCard
6. Today's Signals ExpandableCard
7. **ScoreboardCard** ← new
8. Daily Summary ExpandableCard

- [ ] **Step 3: Verify the build**

```bash
cd /Users/glebstarcikov/Launchpad && bun build client/src/main.tsx --outdir client/dist --target browser 2>&1 | grep -E "error|Bundled"
```

Expected: `Bundled NNN modules in NNms`

- [ ] **Step 4: Commit**

```bash
cd /Users/glebstarcikov/Launchpad && git add client/src/pages/Dashboard.tsx && git commit -m "feat(dashboard): ScoreboardCard showing month-over-month MRR + projects shipped"
```

---

## Task 16: Manual Verification Pass

**Files:** none (browser + DB verification only)

- [ ] **Step 1: Restart the dev server cleanly**

```bash
cd /Users/glebstarcikov/Launchpad && lsof -ti:3001 | xargs kill -9 2>/dev/null; bun run dev > /tmp/launchpad-dev.log 2>&1 &
sleep 3
tail -10 /tmp/launchpad-dev.log
```

Expected: `Started development server: http://localhost:3001` and `Bundled NNN modules`.

- [ ] **Step 2: Verify the new endpoints are reachable (auth required)**

```bash
curl -s http://localhost:3001/api/dashboard/action-items -w "\n%{http_code}\n"
curl -s http://localhost:3001/api/dashboard/activity -w "\n%{http_code}\n"
curl -s http://localhost:3001/api/dashboard/scoreboard -w "\n%{http_code}\n"
```

Expected: all three return HTTP 401 (not 404). Confirms the routes are registered.

- [ ] **Step 3: Open the Dashboard in the browser**

Open http://localhost:3001 in a browser, log in. Verify the new layout top-to-bottom:
- **Header row:** "Dashboard" title on the left, compact metric strip on the right (MRR / Projects / Ideas / Legal, colored conditionally)
- **Action Items card:** hero card with severity sections (or "All clear" if no items)
- **What moved (last 24h) card:** activity feed (or "No activity yet today")
- **Pipeline + Recent Projects row:** unchanged from before
- **Idea Inbox:** unchanged
- **Today's Signals:** unchanged
- **This month scoreboard:** MRR row with delta (or just `$0`), Projects shipped row, Legal complete %, Launch checklist %
- **Daily Summary:** unchanged

- [ ] **Step 4: Verify action items include the expected categories**

Create test conditions to force specific action items, or use an existing project:

**Test compliance-blocker:**
1. Go to any for-profit project → Compliance tab → add US
2. Reload Dashboard → should see `GDPR-compliant Privacy Policy` (or similar blocker items) under Critical
3. Click one → verify it navigates to the Compliance tab of that project

**Test launch-blocker (requires a fresh project to get seeded priority):**
1. Create a NEW for-profit project (old projects don't have priority-tagged items)
2. Reload Dashboard → should see `Build core feature #1` / `Configure custom domain` / `Install SSL certificate` etc. under Critical
3. Click one → verify it navigates to the Overview tab

**Test tech-debt-high:**
1. Go to any project → Health tab → add a tech debt item with severity "High"
2. Reload Dashboard → should see the item under Critical
3. Click it → verify it navigates to the Health tab

**Test stale-project:**
1. If any project has `updated_at < now - 14 days` (and isn't sunset/idea-stage), it should appear under Warning
2. Otherwise, manually update a project's DB row to make it stale:
   ```bash
   bun -e "
   import { db } from './server/src/db/index.ts';
   db.run('UPDATE projects SET updated_at = ? WHERE name = ? LIMIT 1', [Date.now() - 20*86400000, 'YourTestProject']);
   console.log('done');
   "
   ```
3. Reload Dashboard → should see "Stale: building/beta/live for 20 days" under Warning

- [ ] **Step 5: Verify UptimeRobot integration (optional, only if API key set)**

If `UPTIMEROBOT_API_KEY` is set in `.env`:

```bash
bun -e "
import { getMonitorStatusMap } from './server/src/lib/uptimerobot.ts';
const m = await getMonitorStatusMap();
console.log('monitor count:', m.size);
for (const [url, status] of m) console.log(url, '->', status);
"
```

Expected: non-zero monitor count if you have monitors set up in UptimeRobot. If any of your project URLs match a monitor with status `down`, you should see a "Site down: <url>" action item under Critical.

If `UPTIMEROBOT_API_KEY` is NOT set:
- The endpoint still works
- The dev log should NOT show any UptimeRobot errors
- The `site-down` category is silently skipped

- [ ] **Step 6: Verify activity feed**

1. Update MRR on a project → "MRR $X → $Y" event appears
2. Create a new idea → "New idea: ..." event appears
3. Add a tech debt item → "N tech debt items added" event appears
4. If you have a project with `github_repo` set, commits in the last 24h should show (requires GitHub API reachable)
5. If there's no activity, the card shows "No activity yet today"

- [ ] **Step 7: Verify deep-linking from action items**

Click each severity of action item and confirm the URL updates with `?tab=...` and the correct tab is active. Go back to Dashboard via browser back button — confirm the state is preserved.

- [ ] **Step 8: Mark Task 16 complete**

No commit needed. Manual verification only.

---

## Spec Coverage Self-Review Checklist

Before declaring the plan complete, scan the spec one more time against this checklist:

- [x] **Spec 1 (goals and priority framing)** → tasks address triage-first via ActionItemsCard (Task 13), activity via ActivityFeedCard (Task 14), growth via ScoreboardCard (Task 15)
- [x] **Spec 2.1 (10 triage categories)** → Task 7 implements 9 directly + UptimeRobot for site-down
- [x] **Spec 2.2 (response shape)** → Task 7 matches the ActionItem interface
- [x] **Spec 2.3 (ordering)** → Task 7 sorts by severity then created_at DESC
- [x] **Spec 2.4 (6-item compaction)** → Task 13 ActionItemsCard applies `slice(0, 6)` with "+ N more" expand
- [x] **Spec 3 (UptimeRobot integration)** → Task 6 wrapper module, Task 7 uses it with fail-open
- [x] **Spec 4 (activity feed with 5 sources)** → Task 8 endpoint + Task 14 UI
- [x] **Spec 5 (scoreboard with MRR/shipped deltas + legal/checklist ratios)** → Task 9 endpoint + Task 15 UI
- [x] **Spec 6.1 (priority column migration)** → Task 1
- [x] **Spec 6.2 (5 blocker items in catalog)** → Task 2
- [x] **Spec 6.3 (API changes for priority)** → Tasks 3, 4, 5
- [x] **Spec 7.1 (new layout order)** → Tasks 12, 13, 14, 15 restructure Dashboard.tsx
- [x] **Spec 7.2 (metric strip)** → Task 12
- [x] **Spec 7.3 (ActionItemsCard)** → Task 13
- [x] **Spec 7.4 (ActivityFeedCard)** → Task 14
- [x] **Spec 7.5 (ScoreboardCard)** → Task 15
- [x] **Spec 7.6 (deep-link via useSearchParams)** → Task 11
- [x] **Spec 8 (API surface summary)** → Tasks 7, 8, 9, 10
- [x] **Spec 9 (error handling)** → Task 7 wraps each category in try/catch; Task 6 UptimeRobot fails open; Task 9 handles division by zero
- [x] **Spec 10 (V1 out of scope)** → respected (no dismiss, no snooze, no notifications, no completed_at history)
- [x] **Spec 11 (migration / rollout)** → Task 1 is additive, no data migration; Task 2 only affects future seeding
- [x] **Spec 12 (risks)** → acknowledged; implementation uses bounded queries and caches

All spec sections have at least one corresponding task.
