# Dashboard Metrics Expansion (A4) — Design Spec

**Date:** 2026-04-15
**Scope:** Reframe the Dashboard from point-in-time stat cards into a triage-first founder cockpit. Primary: an Action Items punch list grouped by severity. Secondary: a "What moved" activity feed. Tertiary: a month-over-month growth scoreboard. Integrate UptimeRobot for real site-down detection. Add one new `launch_checklist.priority` column so launch blockers can be surfaced cleanly.

---

## 1. Goals and priority framing

User ranked the three ways to open the dashboard: **B > A > C**, meaning:

1. **B — Triage first** (primary): "What needs my attention right now?" A grouped punch list across projects. This is the hero of the page — the first thing the eye lands on.
2. **A — Activity second**: "What happened in the last 24h?" A single card showing commits, MRR changes, new ideas, news, tech debt additions. Calm, informational, below the hero.
3. **C — Growth third**: "How am I doing?" A small month-over-month scoreboard at the bottom. Deltas for MRR and projects shipped; current-value-only for compliance/checklist completion (full MoM deferred to a later history-table iteration).

No dismiss/snooze/notifications in V1 — just render what's true right now and let the user act.

---

## 2. Action Items punch list

### 2.1 Categories (V1)

Ten candidates, user accepted all except stage-transition items. Three severities:

**🔴 Critical (red dot):**
| Category | Query |
|---|---|
| `site-down` | UptimeRobot monitor for a project's URL returns status 8 (seems down) or 9 (down). Requires `UPTIMEROBOT_API_KEY` env var. Skipped silently if missing. |
| `compliance-blocker` | `legal_items WHERE priority='blocker' AND completed=0` — from A3 |
| `tech-debt-high` | `tech_debt WHERE severity='high' AND resolved=0` — from A1 |
| `launch-blocker` | `launch_checklist WHERE priority='blocker' AND completed=0` — requires new column (section 5.2) |

**🟡 Warning (amber dot):**
| Category | Query |
|---|---|
| `stale-project` | Projects with `stage IN ('building','beta','live')` and `updated_at < now - 14 days`. Idea-stage gets a 60-day grace. Sunset excluded. |
| `overdue-goal` | `goals WHERE target_date < now AND completed=0` |
| `needs-review` | `legal_items WHERE status_note IS NOT NULL AND completed=0` — from A3 Review Compliance output |
| `stale-mrr` | for-profit projects with `stage IN ('live','growing')` and no `mrr_history` entry in last 30 days |
| `compliance-important` | `legal_items WHERE priority='important' AND completed=0` |

**🔵 Info (blue dot):**
| Category | Query |
|---|---|
| `news-unread` | `news_items WHERE read=0 AND relevance_score > 0.7`, **hard-capped at top 3** to prevent flooding |

### 2.2 Response shape

```typescript
export interface ActionItem {
  id: string;                                // stable key for React; "category:scope-id"
  severity: "critical" | "warning" | "info";
  category:
    | "site-down" | "compliance-blocker" | "tech-debt-high" | "launch-blocker"
    | "stale-project" | "overdue-goal" | "needs-review" | "stale-mrr"
    | "compliance-important" | "news-unread";
  label: string;                             // short headline: "Site down: example.com"
  detail: string | null;                     // optional one-line extra
  project_id: string | null;                 // deep-link target; null for account-wide
  project_name: string | null;
  target: "project" | "legal" | "checklist" | "tech-debt" | "goals" | "news";
                                             // which tab to deep-link into
  created_at: number;                        // when this became an action item
}

export interface DashboardActionItemsResponse {
  items: ActionItem[];
  counts: { critical: number; warning: number; info: number };
  generated_at: number;
}
```

### 2.3 Ordering

Flat sorted list: critical → warning → info. Within each severity, newest `created_at` first.

### 2.4 Compaction rule

If a severity section has more than 6 items in the UI, collapse after the first 6 with a "+ N more" expand button. Prevents one noisy category from pushing everything else off-screen.

---

## 3. UptimeRobot integration

### 3.1 Wrapper module

New file: `server/src/lib/uptimerobot.ts`

```typescript
export async function getMonitorStatusMap(): Promise<Map<string, "up" | "down" | "paused">>;
```

Returns a Map keyed by **normalized URL** — lowercased, trailing slash stripped, protocol stripped (`https://example.com/` and `http://example.com` both map to `example.com`). Values are `"up"` (status 2), `"down"` (status 8 or 9), or `"paused"` (status 0).

### 3.2 API call

```
POST https://api.uptimerobot.com/v2/getMonitors
Content-Type: application/x-www-form-urlencoded
Body: api_key=<UPTIMEROBOT_API_KEY>&format=json
```

Returns `{ stat: "ok", monitors: [{ id, friendly_name, url, status, ... }, ...] }`.

### 3.3 Caching

Module-scope in-memory cache: `{ data: Map, fetched_at: number }`. TTL = 90 seconds. Any caller past TTL triggers a refresh; concurrent callers during a refresh share the in-flight promise. Cache is process-local — acceptable for a single-node Bun process.

### 3.4 Failure behavior (fail-open)

- No `UPTIMEROBOT_API_KEY` env var → `getMonitorStatusMap()` returns an empty Map. No errors.
- HTTP error or timeout (5s via `AbortSignal.timeout(5000)`) → log warning, return empty Map. The action-items endpoint continues building the other 8 categories.
- Malformed response → same as HTTP error.

### 3.5 Matching logic in action-items endpoint

For each user project with a non-null `url`:
1. Normalize the project URL the same way as the monitor URLs
2. Look up in the Map
3. If status is `"down"` → emit a `site-down` action item with label `"Site down: {project.url}"` and `target: "project"` (deep-links to the project's Health tab via `?tab=health`)
4. If status is `"up"`, `"paused"`, or not found → skip (we don't complain about unmonitored projects)

### 3.6 Env var

Add to `.env.example`:
```
UPTIMEROBOT_API_KEY=    # optional; enables dashboard site-down action items
```

### 3.7 Out of scope (future)

- Creating/deleting UptimeRobot monitors from Launchpad UI
- Per-project uptime widget on the Health tab (7-day uptime %, incident history from `getMonitorLogs`)
- Alerts/notifications on new incidents

---

## 4. Activity feed — "What moved (last 24h)"

### 4.1 Response shape

```typescript
export interface ActivityEvent {
  id: string;                          // stable key: "commit-${sha}" / "mrr-${mrrId}" / etc.
  kind: "commit" | "mrr-update" | "new-idea" | "news" | "tech-debt-added";
  icon: string;                        // emoji for quick rendering
  label: string;                       // "Pushed 3 commits" / "MRR $120 → $180"
  project_id: string | null;
  project_name: string | null;
  timestamp: number;
  deep_link: string | null;            // e.g., "/projects/${id}?tab=overview"
}

export interface DashboardActivityResponse {
  events: ActivityEvent[];
}
```

### 4.2 Event sources (V1)

All SQL against existing columns — no new schema needed:

| Kind | Source | Label format |
|---|---|---|
| `commit` | `github_activity` | `"Pushed N commits"` (grouped by project + day, so 3 commits in one day on one project → 1 event) |
| `mrr-update` | `mrr_history` entries in last 24h | `"MRR $X → $Y"` (diff against prior entry for same project) |
| `new-idea` | `ideas` where `created_at >= now - 24h` | `"New idea: {title}"` |
| `news` | `news_items` where `relevance_score > 0.5 AND created_at >= now - 24h` | `"N relevant news items"` (grouped into one event) |
| `tech-debt-added` | `tech_debt` where `created_at >= now - 24h` | `"N tech debt items added"` (grouped by project) |

### 4.3 Explicitly deferred

- **Launch checklist completions** — requires tracking `completed_at`, not a simple boolean, which means a schema migration. Skipped for V1; can add `completed_at` in a future pass.
- **Stage transitions** — requires a `project_stage_history` table to be done cleanly. Not in V1.
- **Legal items completions** — same issue. Not in V1.

V1 covers the 5 kinds where timestamps already exist. That's enough for a useful "what moved" card.

### 4.4 Limits and ordering

- Hard limit: 50 events
- Time window: last 24 hours
- Order: `timestamp DESC`
- Client UI shows 8 by default with a "show more" expand

---

## 5. Growth scoreboard — "This month"

### 5.1 Response shape

```typescript
export interface DashboardScoreboardResponse {
  mrr: { current: number; previous: number; delta: number; delta_pct: number | null };
  projectsShipped: { current: number; previous: number; delta: number };
  legalComplete: { current_pct: number };     // 0-100
  checklistComplete: { current_pct: number }; // 0-100
}
```

### 5.2 Computation

- **`mrr`:** sum of latest `mrr_history` entries per project (current) vs. sum of latest entries as-of the first day of this month (previous). `delta = current - previous`. `delta_pct = null` if previous is 0.
- **`projectsShipped.current`:** `COUNT(*) FROM projects WHERE stage='live' AND updated_at >= month_start`. Approximate — a project going live in the middle of the month AND then being edited further is still counted; a project that went live before the month started but was edited this month is NOT counted. Accept the imprecision.
- **`projectsShipped.previous`:** same formula for the prior month.
- **`legalComplete.current_pct`:** `(completed_legal_items / total_legal_items) * 100` across all user's projects. No prior-month comparison (requires history table).
- **`checklistComplete.current_pct`:** same formula on `launch_checklist`. No prior-month comparison.

### 5.3 Edge cases

- No `mrr_history` → `{ current: 0, previous: 0, delta: 0, delta_pct: null }`
- No legal items → `legalComplete.current_pct = 0`
- No checklist items → `checklistComplete.current_pct = 0`
- First month of using Launchpad → `previous = 0, delta = current, delta_pct = null`

### 5.4 Deferred

Proper month-over-month for legal/checklist ratios needs a monthly snapshots table. Not in V1. The card renders "This month" values without deltas for those two metrics.

---

## 6. Schema changes

### 6.1 `launch_checklist.priority` column

One additive migration in `server/src/db/index.ts`:

```sql
ALTER TABLE launch_checklist ADD COLUMN priority TEXT;   -- 'blocker' | 'important' | 'recommended' | null
```

Same idempotent `try { db.run(...) } catch {}` pattern as the other migrations.

Legacy items have `NULL` priority. UI treats NULL as `"recommended"` (same backward-compat trick as tech debt and legal items from A1 and A3).

### 6.2 Catalog seeding updates

Update `server/src/lib/constants.ts` to tag these 5 items with `priority: "blocker"` in the `CHECKLIST_UNIVERSAL` / `CHECKLIST_FOR_PROFIT` arrays:

1. **"Configure custom domain"** (UNIVERSAL, infra)
2. **"Install SSL certificate"** (UNIVERSAL, infra)
3. **"Build core feature #1 (the one thing)"** (UNIVERSAL, build)
4. **"Draft Privacy Policy"** (FOR_PROFIT, legal)
5. **"Draft Terms of Service"** (FOR_PROFIT, legal)

Everything else stays at NULL. The `ChecklistItem` interface in constants.ts gets a new optional `priority?: "blocker" | "important" | "recommended"` field.

### 6.3 API changes required by the new priority column

- `server/src/routes/projects.ts` POST `/launch-checklist` — extend to accept optional `priority` field
- `server/src/routes/projects.ts` POST `/` (project create) and `server/src/routes/ideas.ts` (idea promote) — update the seeding INSERT to write `priority` from the catalog item
- Client types `LaunchChecklistItem` — add `priority: "blocker" | "important" | "recommended" | null`
- Client api `api.projects.checklist.create` — accept optional priority

---

## 7. UI restructure

### 7.1 New layout (top to bottom)

```
┌─ Dashboard [page title] ·  MRR $X · Projects N · Ideas N · Legal N ⚠  ┐
│                                                                        │
│  ┌─────────────────── Action Items card (hero) ──────────────────┐   │
│  │  🔴 Critical (3)                                               │   │
│  │  🟡 Warning (7)                                                │   │
│  │  🔵 Info (1)                                                   │   │
│  └───────────────────────────────────────────────────────────────┘   │
│                                                                        │
│  ┌──────────────── What moved (last 24h) ─────────────────────┐     │
│  │  14:32  💻 Pushed 3 commits                   Launchpad    │     │
│  │  12:15  📈 MRR $120 → $180                    SaaS X       │     │
│  └───────────────────────────────────────────────────────────┘     │
│                                                                        │
│  ┌──── Pipeline ────┐  ┌──── Recent Projects ────┐                  │
│  │                   │  │                          │                  │
│  └───────────────────┘  └──────────────────────────┘                  │
│                                                                        │
│  ┌──────────────── Idea Inbox ──────────────────┐                   │
│  └──────────────────────────────────────────────┘                   │
│                                                                        │
│  ┌──────────────── Today's Signals ─────────────┐                   │
│  └──────────────────────────────────────────────┘                   │
│                                                                        │
│  ┌──────────────── This month ──────────────────┐                   │
│  │  MRR         $1,240   ↑$180 (+17%)            │                   │
│  │  Shipped          2   ↑1                      │                   │
│  │  Legal        78%                             │                   │
│  │  Checklist    62%                             │                   │
│  └──────────────────────────────────────────────┘                   │
│                                                                        │
│  ┌──────────────── Daily Summary ───────────────┐                   │
│  └──────────────────────────────────────────────┘                   │
└───────────────────────────────────────────────────────────────────────┘
```

### 7.2 Metric strip (replaces 4 stat cards)

In the header row next to the "Dashboard" title:

- Single line, `text-xs`, monospace numbers
- Labels: `MRR $X · Projects N · Ideas N · Legal N`
- Same severity coloring as before: MRR green if > 0, Legal red + warning icon if > 0, rest neutral
- Each segment is clickable and navigates:
  - MRR → `/projects` filtered by for-profit
  - Projects → `/projects`
  - Ideas → `/ideas`
  - Legal → first project with pending legal items (or `/projects` if none)

### 7.3 Action Items card

New component `ActionItemsCard` in `client/src/pages/Dashboard.tsx` (or split into `client/src/components/dashboard/ActionItemsCard.tsx` if Dashboard.tsx gets too large — recommended threshold: >500 lines).

**Layout:**

- CardHeader: "Action Items" title + compact count summary `"3 critical · 7 warning · 1 info"` + small `RefreshCw` button (manual refresh, otherwise React Query 60s stale)
- CardContent: three severity sections, rendered only if non-empty

**Row anatomy:**

```tsx
<button
  onClick={() => navigate(deepLinkFor(item))}
  className="flex items-center gap-3 px-3 py-2 rounded-md hover:bg-secondary/50 group w-full text-left"
>
  <span className={cn("h-2 w-2 rounded-full shrink-0", severityDotClass)} />
  <span className="text-[13px] flex-1 truncate">{item.label}</span>
  {item.project_name && (
    <span className="text-[11px] text-muted-foreground shrink-0">{item.project_name}</span>
  )}
  <ArrowUpRight size={12} className="text-muted-foreground opacity-0 group-hover:opacity-100 shrink-0" />
</button>
```

**Severity dot colors:**
- critical → `bg-destructive`
- warning → `bg-warning`
- info → `bg-info`

**Empty state:**
```tsx
<div className="flex items-center gap-2 py-6 justify-center text-success">
  <Check size={14} /> All clear — nothing needs attention
</div>
```

**Per-section compaction:** If `items.length > 6` in a section, show first 6 with `"+ N more"` button revealing the rest.

### 7.4 "What moved" card

New component `ActivityFeedCard`. Replaces the existing "Today's Commits" card. Renders events grouped by time: "Today" (last 24h, reverse chronological), each row showing `HH:MM · emoji · label · project_name`. Click → deep-link.

**Empty state:** `"No activity yet today"` centered in the card body.

### 7.5 "This month" scoreboard card

New component `ScoreboardCard`. Four rows:

```tsx
<div className="flex items-center justify-between py-2">
  <span className="text-sm text-muted-foreground">MRR</span>
  <div className="flex items-center gap-3">
    <span className="font-mono text-sm">{fmt(mrr.current)}</span>
    {mrr.delta !== 0 && (
      <span className={cn("text-xs", mrr.delta > 0 ? "text-success" : "text-destructive")}>
        {mrr.delta > 0 ? "↑" : "↓"} {fmt(Math.abs(mrr.delta))}
        {mrr.delta_pct !== null && ` (${mrr.delta_pct > 0 ? "+" : ""}${mrr.delta_pct}%)`}
      </span>
    )}
  </div>
</div>
```

Same pattern for `projectsShipped`. `legalComplete` and `checklistComplete` render without the delta column.

### 7.6 Deep-link handling on ProjectDetail

The Project Detail page uses shadcn Radix Tabs. It needs to honor a `?tab=` URL search param:

- Read `useSearchParams()` on mount, map to the Tabs `value`
- Accept values: `overview`, `health`, `checklist`, `legal`, `goals`, `links`, `notes`, `files`
- Fall back to `overview` on unknown values
- Optionally: update the URL when the user manually changes tabs (not strictly required for V1 deep-linking to work)

---

## 8. API changes summary

### 8.1 New endpoints

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/dashboard/action-items` | Returns `DashboardActionItemsResponse` |
| GET | `/api/dashboard/activity` | Returns `DashboardActivityResponse` |
| GET | `/api/dashboard/scoreboard` | Returns `DashboardScoreboardResponse` |

All three are user-scoped (auth middleware already applied at the router level in `misc.ts`).

### 8.2 Modified endpoints

- `POST /api/projects/:id/launch-checklist` — accepts optional `priority` field
- Launch checklist GET ordering — no change (still by `sort_order, created_at`)
- Project create handler (`POST /api/projects`) — seeds `priority` from catalog items
- Idea promote handler (`POST /api/ideas/:id/promote`) — same

### 8.3 New server files

- `server/src/lib/uptimerobot.ts` — UptimeRobot client wrapper with caching
- (Optional split, not required) `server/src/routes/dashboard.ts` — could move the new endpoints out of `misc.ts` if it grows unwieldy. V1 adds them to `misc.ts` alongside the existing `/dashboard` endpoint.

### 8.4 Client changes

- `client/src/lib/types.ts` — add `ActionItem`, `DashboardActionItemsResponse`, `ActivityEvent`, `DashboardActivityResponse`, `DashboardScoreboardResponse`
- `client/src/lib/api.ts` — add `api.dashboard.actionItems`, `api.dashboard.activity`, `api.dashboard.scoreboard`. Extend `api.projects.checklist.create` to accept `priority`
- `client/src/pages/Dashboard.tsx` — restructure layout; add `ActionItemsCard`, `ActivityFeedCard`, `ScoreboardCard`, `MetricStrip` components (inline or split into `client/src/components/dashboard/` if the file grows beyond ~500 lines)
- `client/src/pages/ProjectDetail.tsx` — add `useSearchParams` deep-link handling on the Tabs

---

## 9. Error handling and edge cases

### 9.1 Action Items endpoint

- UptimeRobot failure → skip `site-down` category silently, log warning
- Individual category SQL error → wrap each category in try/catch, skip failed category
- No projects (new user) → return `{ items: [], counts: { critical: 0, warning: 0, info: 0 }, generated_at: now }`
- All categories empty → same empty response, client shows "All clear" empty state

### 9.2 Activity feed endpoint

- No events in last 24h → `{ events: [] }`, client shows "No activity yet today"
- Individual event-source query error → skip that source, continue

### 9.3 Scoreboard endpoint

- Division by zero on ratios → return 0
- First month of usage → `previous = 0, delta = current, delta_pct = null`

### 9.4 Deep-link edge cases

- Deleted project between fetch and click → 404 on navigation, next refetch (60s) drops the stale item
- Unknown `?tab=` value → fall back to overview silently

### 9.5 Stage heuristics

- **Stale-project false positives:** a user legitimately in a 3-week deep work cycle gets flagged. V1 accepts this; the user touches any project field (edit description, add a note, update MRR) to reset `updated_at`. No explicit "dismiss" button.
- **Stale-MRR applies only to for-profit + live/growing stages.** Idea/building/beta for-profit projects aren't flagged.

### 9.6 Compaction rule

Per-severity 6-item cap in the UI with "+ N more" expand. Applied client-side; the server returns all items.

---

## 10. Out of scope (V1)

- **Dismiss/snooze** individual action items
- **Per-user customizable thresholds** (14-day stale, 30-day MRR staleness)
- **Email/Telegram notifications** for critical action items
- **Project stage change history table** (needed for accurate month-over-month "projects shipped" delta)
- **Monthly snapshots table** for legal/checklist completion ratios (needed for MoM deltas on those two metrics)
- **Launch checklist `completed_at` column** (needed for checklist completion events in the activity feed)
- **Legal items `completed_at` column** (same)
- **Creating/deleting UptimeRobot monitors from Launchpad**
- **Per-project uptime widget** on the Health tab with 7-day uptime % and incident history
- **Alerts on new UptimeRobot incidents**
- **Heatmap or weekly/quarterly views** — V1 is monthly only for the scoreboard

---

## 11. Migration / rollout

- **Existing projects:** launch checklist items keep `priority = NULL`, which the UI treats as "recommended". `launch-blocker` action items only fire once the catalog seeding updates run on NEW projects — existing projects won't retroactively get blockers unless the user re-runs seeding (not exposed in V1). Acceptable.
- **No backfill script** — the 5 blocker items already exist in the CHECKLIST arrays; only the `priority` tag is new. Catalog changes take effect for all new project creations the moment the code ships.
- **UptimeRobot:** zero-config. Users who don't set `UPTIMEROBOT_API_KEY` get the dashboard with 8 categories instead of 9. Users who do set it get the full 9 automatically.

---

## 12. Risks

| Risk | Mitigation |
|---|---|
| Action items endpoint slow with 100+ projects | 9 simple SQL queries, all user-scoped, hit well-indexed columns. Budget: <200ms. If we see >500ms in practice, add per-category query timing logs. |
| UptimeRobot rate limits (10 req/min) | 90-second cache means at most ~7 calls per 10 minutes per process. Well under limit. |
| Noise: too many warning items drown the signal | Per-severity 6-item cap + compaction. If we find a heavy user regularly has 20+ warnings, we add thresholds or category toggles in a future iteration. |
| Stale heuristic too aggressive | Accept for V1. User reset is cheap (any project edit). If false positives become annoying, add a `snooze_until` column on `projects` in a follow-up. |
| Deep-links break when ProjectDetail Tabs don't read search params | Explicit requirement in section 7.6; implementer verifies this works. |
| Month-over-month numbers are imprecise for legal/checklist | Render "this month" only, not a delta. No false precision. |
