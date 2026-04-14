# Polish Fixes + Launch Checklist Refinement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship A1 polish fixes (dashboard color standardization, URL overflow, tech debt UI) and A2 launch checklist refinement (7 categories, stage-aware, type-specific, ~55–65 default items).

**Architecture:** Additive migrations on `launch_checklist` and `tech_debt` tables (nullable columns, backward-compatible). New constants file exports typed checklist arrays split by project type. Server routes extended to accept the new fields. Client UI reworked for the Overview tab checklist (collapsible categories with stage-based muting) and Health tab tech debt card (creation form with severity/category/effort dropdowns, filter bar, badges). Dashboard number colors standardized via a single zero/non-zero rule.

**Tech Stack:** Bun + Hono + bun:sqlite (server), React 18 + TypeScript + Tailwind CSS + React Query v5 (client), shadcn/ui primitives.

---

## File Structure

| Action | Path | Responsibility |
|--------|------|---------------|
| Modify | `client/src/pages/Dashboard.tsx` | Remove `text-warning` from Idea Inbox card |
| Modify | `client/src/pages/ProjectDetail.tsx` | Fix Site Status URL overflow; rework Tech Debt UI; rework Launch Checklist card |
| Modify | `server/src/db/index.ts` | Add nullable columns to `launch_checklist` + `tech_debt` via idempotent ALTER TABLE |
| Rewrite | `server/src/lib/constants.ts` | Replace `DEFAULT_CHECKLIST` with typed `CHECKLIST_UNIVERSAL`, `CHECKLIST_FOR_PROFIT`, `CHECKLIST_OPEN_SOURCE` + helper to seed by type |
| Modify | `server/src/routes/projects.ts` | Seed new checklist on create; extend checklist + tech debt endpoints to accept new fields |
| Modify | `server/src/routes/ideas.ts` | Seed new checklist on idea promotion |
| Modify | `client/src/lib/types.ts` | Add new fields to `LaunchChecklistItem` + `TechDebtItem` |
| Modify | `client/src/lib/api.ts` | Extend `checklist` + `techDebt` namespaces to pass new fields |

---

### Task 1: Dashboard Color Standardization (A1.1)

**Files:**
- Modify: `client/src/pages/Dashboard.tsx:196`

- [ ] **Step 1: Remove `text-warning` from Idea Inbox card**

Open `client/src/pages/Dashboard.tsx`. Find the Idea Inbox card block (around line 190–198). The current `<p>` tag is:

```tsx
<p className="font-mono text-[28px] font-semibold tracking-tight leading-none text-warning">{ideaCount}</p>
```

Replace with:

```tsx
<p className="font-mono text-[28px] font-semibold tracking-tight leading-none text-foreground">{ideaCount}</p>
```

This makes Idea Inbox use the same neutral color as the Projects card, regardless of count. MRR (green on non-zero) and Legal Pending (red on non-zero) stay as-is because they already follow the correct zero/non-zero rule.

- [ ] **Step 2: Rebuild client and verify**

Run:
```bash
cd /Users/glebstarcikov/Launchpad && bun build client/src/main.tsx --outdir client/dist --target browser 2>&1 | tail -5
```

Expected: Build succeeds with no errors. The dev watcher also picks up the change automatically.

- [ ] **Step 3: Commit**

```bash
git add client/src/pages/Dashboard.tsx
git commit -m "fix(dashboard): standardize Idea Inbox number color to neutral"
```

---

### Task 2: Site Status URL Overflow Fix (A1.2)

**Files:**
- Modify: `client/src/pages/ProjectDetail.tsx:249-267`

- [ ] **Step 1: Fix the Site Status card flex layout**

Open `client/src/pages/ProjectDetail.tsx`. Find the Site Status card content (around lines 248–267). The current structure is:

```tsx
<CardContent>
  <div className="flex items-center gap-3">
    <PingDot status={pingStatus} />
    <span className="font-mono text-sm">{project.url ?? "No URL set"}</span>
    {pingLatency !== null && (
      <span className={cn("text-xs", pingStatus === "up" ? "text-success" : "text-destructive")}>
        {pingStatus === "up" ? `${pingLatency}ms` : "unreachable"}
      </span>
    )}
    <Button
      variant="secondary"
      size="sm"
      className="ml-auto gap-1.5"
      disabled={!project.url || pinging}
      onClick={handlePing}
    >
      <RefreshCw size={12} className={cn(pinging && "animate-spin")} />
      Ping Now
    </Button>
  </div>
</CardContent>
```

Replace with:

```tsx
<CardContent>
  <div className="flex items-center gap-3">
    <PingDot status={pingStatus} />
    <span className="font-mono text-sm truncate min-w-0 flex-1" title={project.url ?? undefined}>
      {project.url ?? "No URL set"}
    </span>
    {pingLatency !== null && (
      <span className={cn("text-xs shrink-0", pingStatus === "up" ? "text-success" : "text-destructive")}>
        {pingStatus === "up" ? `${pingLatency}ms` : "unreachable"}
      </span>
    )}
    <Button
      variant="secondary"
      size="sm"
      className="gap-1.5 shrink-0"
      disabled={!project.url || pinging}
      onClick={handlePing}
    >
      <RefreshCw size={12} className={cn(pinging && "animate-spin")} />
      Ping Now
    </Button>
  </div>
</CardContent>
```

Changes:
- URL `<span>`: added `truncate min-w-0 flex-1` so it shrinks and ellipsizes (full URL still available via hover tooltip via `title` attr)
- Latency `<span>`: added `shrink-0` so it never shrinks
- Button: removed `ml-auto` (no longer needed since URL takes remaining space), added `shrink-0`

- [ ] **Step 2: Rebuild and verify in browser**

Run:
```bash
cd /Users/glebstarcikov/Launchpad && bun build client/src/main.tsx --outdir client/dist --target browser 2>&1 | tail -5
```

Expected: Build succeeds. Manually verify: navigate to a project with a long URL (e.g. `https://this-is-a-very-long-example-domain-name.example.com/some/path`) on the Health tab and confirm the URL truncates without pushing the "Ping Now" button off-card.

- [ ] **Step 3: Commit**

```bash
git add client/src/pages/ProjectDetail.tsx
git commit -m "fix(health): truncate long URLs in Site Status card to prevent overflow"
```

---

### Task 3: Tech Debt Database Migration (A1.3 — backend data model)

**Files:**
- Modify: `server/src/db/index.ts:33`

- [ ] **Step 1: Add nullable columns to `tech_debt` table**

Open `server/src/db/index.ts`. Find the existing idempotent ALTER TABLE block (around line 32–33):

```typescript
try { db.run(`ALTER TABLE projects ADD COLUMN starred INTEGER NOT NULL DEFAULT 0`); } catch {}
try { db.run(`ALTER TABLE projects ADD COLUMN github_repo TEXT`); } catch {}
```

Add three new ALTER TABLE statements immediately after (same pattern — wrap in `try/catch` so they're safe to re-run):

```typescript
try { db.run(`ALTER TABLE tech_debt ADD COLUMN severity TEXT`); } catch {}
try { db.run(`ALTER TABLE tech_debt ADD COLUMN category TEXT`); } catch {}
try { db.run(`ALTER TABLE tech_debt ADD COLUMN effort TEXT`); } catch {}
```

These columns are nullable so existing rows keep their data unchanged (null severity/category/effort). The UI will render null values with default "medium / refactor / moderate" badges.

- [ ] **Step 2: Verify schema migration ran**

Restart the dev server (the DB module runs on import):
```bash
lsof -ti:3001 | xargs kill -9 2>/dev/null
cd /Users/glebstarcikov/Launchpad && bun run dev &
sleep 3
```

Then inspect the schema:
```bash
bun -e "import {db} from './server/src/db/index.ts'; console.log(db.query('PRAGMA table_info(tech_debt)').all())"
```

Expected: Output includes rows for `severity`, `category`, `effort` columns, all with `type: 'TEXT'` and `notnull: 0`.

- [ ] **Step 3: Commit**

```bash
git add server/src/db/index.ts
git commit -m "feat(db): add severity, category, effort columns to tech_debt table"
```

---

### Task 4: Tech Debt API — Accept New Fields (A1.3 — server routes)

**Files:**
- Modify: `server/src/routes/projects.ts:203-225`

- [ ] **Step 1: Extend POST /tech-debt to accept severity/category/effort**

Open `server/src/routes/projects.ts`. Find the POST `/:id/tech-debt` handler (around line 203–214). Replace it with:

```typescript
// POST /api/projects/:id/tech-debt
router.post("/:id/tech-debt", async (c) => {
  if (!ownsProject(c.req.param("id"), c.get("userId"))) {
    return c.json({ error: "Not found" }, 404);
  }
  const { note, severity, category, effort } = await c.req.json();
  if (!note) return c.json({ error: "note required" }, 400);
  const id = crypto.randomUUID();
  db.run(
    "INSERT INTO tech_debt (id, project_id, note, resolved, severity, category, effort, created_at) VALUES (?, ?, ?, 0, ?, ?, ?, ?)",
    [id, c.req.param("id"), note, severity ?? null, category ?? null, effort ?? null, Date.now()]
  );
  return c.json(db.query<TechDebtItem, [string]>("SELECT * FROM tech_debt WHERE id = ?").get(id), 201);
});
```

- [ ] **Step 2: Extend PUT /tech-debt/:debtId to accept partial updates including new fields**

Find the PUT `/:id/tech-debt/:debtId` handler (around line 216–225). Replace it with:

```typescript
// PUT /api/projects/:id/tech-debt/:debtId
router.put("/:id/tech-debt/:debtId", async (c) => {
  if (!ownsProject(c.req.param("id"), c.get("userId"))) {
    return c.json({ error: "Not found" }, 404);
  }
  const { resolved, note, severity, category, effort } = await c.req.json();
  const sets: string[] = [];
  const params: (string | number | null)[] = [];
  if (resolved !== undefined) { sets.push("resolved = ?"); params.push(resolved ? 1 : 0); }
  if (note !== undefined) { sets.push("note = ?"); params.push(note); }
  if (severity !== undefined) { sets.push("severity = ?"); params.push(severity); }
  if (category !== undefined) { sets.push("category = ?"); params.push(category); }
  if (effort !== undefined) { sets.push("effort = ?"); params.push(effort); }
  if (sets.length === 0) return c.json({ ok: true });
  params.push(c.req.param("debtId"), c.req.param("id"));
  db.run(`UPDATE tech_debt SET ${sets.join(", ")} WHERE id = ? AND project_id = ?`, params);
  return c.json({ ok: true });
});
```

This makes the update endpoint flexible: callers can pass any subset of fields. The old behavior (passing just `{ resolved: true }`) still works.

- [ ] **Step 3: Quick smoke test via curl**

Start the dev server if it's not running:
```bash
lsof -ti:3001 >/dev/null || (cd /Users/glebstarcikov/Launchpad && bun run dev &) && sleep 3
```

Then exercise both endpoints (substitute a real project ID and session cookie from your browser):
```bash
# Should return 201 with new row including severity/category/effort
curl -s -X POST http://localhost:3001/api/projects/REPLACE_PROJECT_ID/tech-debt \
  -H "Content-Type: application/json" \
  -H "Cookie: auth-token=REPLACE_TOKEN" \
  -d '{"note":"test","severity":"high","category":"security","effort":"quick"}'
```

Expected: JSON response with the new tech debt row, `severity: "high"`, `category: "security"`, `effort: "quick"`.

- [ ] **Step 4: Commit**

```bash
git add server/src/routes/projects.ts
git commit -m "feat(tech-debt): accept severity, category, effort in POST/PUT endpoints"
```

---

### Task 5: Tech Debt Client Types + API Methods (A1.3 — client data layer)

**Files:**
- Modify: `client/src/lib/types.ts`
- Modify: `client/src/lib/api.ts:96-104`

- [ ] **Step 1: Extend `TechDebtItem` type**

Open `client/src/lib/types.ts`. Find the `TechDebtItem` interface:

```typescript
export interface TechDebtItem {
  id: string;
  project_id: string;
  note: string;
  resolved: 0 | 1;
  created_at: number;
}
```

Replace with:

```typescript
export type TechDebtSeverity = "low" | "medium" | "high";
export type TechDebtCategory = "bug" | "refactor" | "security" | "performance" | "docs";
export type TechDebtEffort = "quick" | "moderate" | "significant";

export interface TechDebtItem {
  id: string;
  project_id: string;
  note: string;
  resolved: 0 | 1;
  severity: TechDebtSeverity | null;
  category: TechDebtCategory | null;
  effort: TechDebtEffort | null;
  created_at: number;
}
```

- [ ] **Step 2: Extend `techDebt` API namespace**

Open `client/src/lib/api.ts`. Find the `techDebt` block (around line 96–104) and replace with:

```typescript
    techDebt: {
      list: (id: string) => req<TechDebtItem[]>(`/projects/${id}/tech-debt`),
      create: (id: string, data: { note: string; severity?: TechDebtSeverity; category?: TechDebtCategory; effort?: TechDebtEffort }) =>
        req<TechDebtItem>(`/projects/${id}/tech-debt`, { method: "POST", body: JSON.stringify(data) }),
      update: (id: string, debtId: string, data: { resolved?: boolean; note?: string; severity?: TechDebtSeverity; category?: TechDebtCategory; effort?: TechDebtEffort }) =>
        req<{ ok: true }>(`/projects/${id}/tech-debt/${debtId}`, { method: "PUT", body: JSON.stringify(data) }),
      delete: (id: string, debtId: string) =>
        req<{ ok: true }>(`/projects/${id}/tech-debt/${debtId}`, { method: "DELETE" }),
    },
```

- [ ] **Step 3: Add the new type imports at top of api.ts**

At the top of `client/src/lib/api.ts`, find the type import line. Add `TechDebtSeverity`, `TechDebtCategory`, `TechDebtEffort` to the import list. For example, if the current import is:

```typescript
import type { User, Project, ..., TechDebtItem, ... } from "./types";
```

Change to (add the three new types):

```typescript
import type { User, Project, ..., TechDebtItem, TechDebtSeverity, TechDebtCategory, TechDebtEffort, ... } from "./types";
```

- [ ] **Step 4: Rebuild to catch any type errors**

```bash
cd /Users/glebstarcikov/Launchpad && bun build client/src/main.tsx --outdir client/dist --target browser 2>&1 | tail -10
```

Expected: Build succeeds. If there are errors, they're most likely in `ProjectDetail.tsx` where the old `update(id, debtId, resolved)` signature was called — we fix that in Task 6.

Note: there will be TypeScript errors at callsites using the old positional `update(id, debtId, resolved)` signature. These will be fixed in Task 6 when we rework the UI. Temporary workaround if blocking — leave the old signature as a compatibility alternative, or just proceed straight into Task 6 without testing the intermediate state. Preferred: proceed straight into Task 6.

- [ ] **Step 5: Commit**

```bash
git add client/src/lib/types.ts client/src/lib/api.ts
git commit -m "feat(tech-debt): extend client types and API methods with severity, category, effort"
```

---

### Task 6: Tech Debt UI Rework (A1.3 — client rendering)

**Files:**
- Modify: `client/src/pages/ProjectDetail.tsx:193-301` (HealthTab + tech debt section)

- [ ] **Step 1: Add imports for Select + new types**

Open `client/src/pages/ProjectDetail.tsx`. Find the existing type import line (around line 26):

```typescript
import type { Project, ProjectLink, LaunchChecklistItem, TechDebtItem, MrrEntry, Goal, ProjectStage, ProjectType, ProjectCountry, LegalItem, Note, GitHubRepoData } from "@/lib/types";
```

Replace with (add the three new enum types):

```typescript
import type { Project, ProjectLink, LaunchChecklistItem, TechDebtItem, TechDebtSeverity, TechDebtCategory, TechDebtEffort, MrrEntry, Goal, ProjectStage, ProjectType, ProjectCountry, LegalItem, Note, GitHubRepoData } from "@/lib/types";
```

Verify `Select`, `SelectContent`, `SelectItem`, `SelectTrigger`, `SelectValue` are already imported from `@/components/ui/select` (they should be — Revenue tab uses them). If not, add:

```typescript
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
```

- [ ] **Step 2: Rework the HealthTab component — state + mutations**

Find the HealthTab component (around line 193 onwards). Locate the state block:

```typescript
const [debtNote, setDebtNote] = useState("");
```

Replace with:

```typescript
const [debtNote, setDebtNote] = useState("");
const [debtSeverity, setDebtSeverity] = useState<TechDebtSeverity>("medium");
const [debtCategory, setDebtCategory] = useState<TechDebtCategory>("refactor");
const [debtEffort, setDebtEffort] = useState<TechDebtEffort>("moderate");
const [filterSeverity, setFilterSeverity] = useState<TechDebtSeverity | "all">("all");
const [filterCategory, setFilterCategory] = useState<TechDebtCategory | "all">("all");
const [filterResolved, setFilterResolved] = useState<"all" | "open" | "resolved">("open");
```

Next, find the `addDebt` and `updateDebt` mutation definitions. Replace `addDebt` with:

```typescript
const addDebt = useMutation({
  mutationFn: (data: { note: string; severity: TechDebtSeverity; category: TechDebtCategory; effort: TechDebtEffort }) =>
    api.projects.techDebt.create(id, data),
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ["tech-debt", id] });
    setDebtNote("");
    setDebtSeverity("medium");
    setDebtCategory("refactor");
    setDebtEffort("moderate");
  },
});
```

Replace `updateDebt` with:

```typescript
const updateDebt = useMutation({
  mutationFn: ({ debtId, data }: { debtId: string; data: { resolved?: boolean; severity?: TechDebtSeverity; category?: TechDebtCategory; effort?: TechDebtEffort } }) =>
    api.projects.techDebt.update(id, debtId, data),
  onSuccess: () => queryClient.invalidateQueries({ queryKey: ["tech-debt", id] }),
});
```

Find the `handleAddDebt` handler and replace with:

```typescript
const handleAddDebt = (e: React.FormEvent) => {
  e.preventDefault();
  if (debtNote.trim()) {
    addDebt.mutate({
      note: debtNote.trim(),
      severity: debtSeverity,
      category: debtCategory,
      effort: debtEffort,
    });
  }
};
```

Add a `filteredDebt` derivation right above the `return` statement:

```typescript
const filteredDebt = techDebt.filter((item: TechDebtItem) => {
  if (filterSeverity !== "all" && item.severity !== filterSeverity) return false;
  if (filterCategory !== "all" && item.category !== filterCategory) return false;
  if (filterResolved === "open" && item.resolved === 1) return false;
  if (filterResolved === "resolved" && item.resolved === 0) return false;
  return true;
});
```

- [ ] **Step 3: Rework the Tech Debt card JSX**

Find the Tech Debt `<Card>` block (around line 271–300) and replace the entire card with:

```tsx
{/* Tech Debt card */}
<Card>
  <CardHeader className="pb-3">
    <div className="flex items-center justify-between">
      <CardTitle className="text-sm font-medium">Tech Debt</CardTitle>
      <span className="text-[11px] font-mono text-muted-foreground tabular-nums">
        {techDebt.filter((i: TechDebtItem) => i.resolved === 0).length} open
      </span>
    </div>
  </CardHeader>
  <CardContent className="space-y-3">
    {/* Filter bar */}
    {techDebt.length > 0 && (
      <div className="flex items-center gap-2 flex-wrap">
        <Select value={filterResolved} onValueChange={(v) => setFilterResolved(v as typeof filterResolved)}>
          <SelectTrigger className="h-7 text-xs w-[110px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="open">Open</SelectItem>
            <SelectItem value="resolved">Resolved</SelectItem>
            <SelectItem value="all">All</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterSeverity} onValueChange={(v) => setFilterSeverity(v as typeof filterSeverity)}>
          <SelectTrigger className="h-7 text-xs w-[120px]"><SelectValue placeholder="Severity" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All severity</SelectItem>
            <SelectItem value="low">Low</SelectItem>
            <SelectItem value="medium">Medium</SelectItem>
            <SelectItem value="high">High</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterCategory} onValueChange={(v) => setFilterCategory(v as typeof filterCategory)}>
          <SelectTrigger className="h-7 text-xs w-[130px]"><SelectValue placeholder="Category" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            <SelectItem value="bug">Bug</SelectItem>
            <SelectItem value="refactor">Refactor</SelectItem>
            <SelectItem value="security">Security</SelectItem>
            <SelectItem value="performance">Performance</SelectItem>
            <SelectItem value="docs">Docs</SelectItem>
          </SelectContent>
        </Select>
      </div>
    )}

    {/* Items */}
    {filteredDebt.length === 0 ? (
      <p className="text-xs text-muted-foreground text-center py-2">
        {techDebt.length === 0 ? "No tech debt tracked yet." : "No items match the current filters."}
      </p>
    ) : (
      <div className="space-y-2">
        {filteredDebt.map((item: TechDebtItem) => {
          const severity = item.severity ?? "medium";
          const category = item.category ?? "refactor";
          const effort = item.effort ?? "moderate";
          const severityClass =
            severity === "high" ? "bg-destructive/10 text-destructive border-destructive/30" :
            severity === "low" ? "bg-muted text-muted-foreground border-border" :
            "bg-warning/10 text-warning border-warning/30";
          return (
            <div key={item.id} className={cn(
              "flex items-start gap-2 p-2.5 rounded-md border",
              item.resolved === 1 ? "border-border/40 bg-card/50" : "border-border"
            )}>
              <Checkbox
                checked={item.resolved === 1}
                onCheckedChange={(v) => updateDebt.mutate({ debtId: item.id, data: { resolved: !!v } })}
                className="mt-0.5"
              />
              <div className="flex-1 min-w-0">
                <p className={cn("text-sm", item.resolved === 1 && "line-through text-muted-foreground")}>
                  {item.note}
                </p>
                <div className="flex items-center gap-1.5 mt-1.5">
                  <span className={cn("text-[10px] px-1.5 py-0.5 rounded border", severityClass)}>
                    {severity}
                  </span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded border border-border text-muted-foreground">
                    {category}
                  </span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded border border-border text-muted-foreground">
                    {effort}
                  </span>
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-muted-foreground hover:text-destructive shrink-0"
                onClick={() => deleteDebt.mutate(item.id)}
              >
                <Trash2 size={12} />
              </Button>
            </div>
          );
        })}
      </div>
    )}

    {/* Add form */}
    <form onSubmit={handleAddDebt} className="space-y-2 pt-2 border-t border-border">
      <Input
        value={debtNote}
        onChange={e => setDebtNote(e.target.value)}
        placeholder="Describe the tech debt..."
      />
      <div className="flex items-center gap-2">
        <Select value={debtSeverity} onValueChange={(v) => setDebtSeverity(v as TechDebtSeverity)}>
          <SelectTrigger className="h-8 text-xs flex-1"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="low">Low severity</SelectItem>
            <SelectItem value="medium">Medium severity</SelectItem>
            <SelectItem value="high">High severity</SelectItem>
          </SelectContent>
        </Select>
        <Select value={debtCategory} onValueChange={(v) => setDebtCategory(v as TechDebtCategory)}>
          <SelectTrigger className="h-8 text-xs flex-1"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="bug">Bug</SelectItem>
            <SelectItem value="refactor">Refactor</SelectItem>
            <SelectItem value="security">Security</SelectItem>
            <SelectItem value="performance">Performance</SelectItem>
            <SelectItem value="docs">Docs</SelectItem>
          </SelectContent>
        </Select>
        <Select value={debtEffort} onValueChange={(v) => setDebtEffort(v as TechDebtEffort)}>
          <SelectTrigger className="h-8 text-xs flex-1"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="quick">Quick</SelectItem>
            <SelectItem value="moderate">Moderate</SelectItem>
            <SelectItem value="significant">Significant</SelectItem>
          </SelectContent>
        </Select>
        <Button type="submit" size="sm" disabled={!debtNote.trim() || addDebt.isPending} className="shrink-0">
          Add
        </Button>
      </div>
    </form>
  </CardContent>
</Card>
```

- [ ] **Step 4: Rebuild and verify**

```bash
cd /Users/glebstarcikov/Launchpad && bun build client/src/main.tsx --outdir client/dist --target browser 2>&1 | tail -10
```

Expected: Build succeeds with no TypeScript errors. Manually verify in browser:
1. Navigate to a project → Health tab
2. Add a tech debt item with severity=high, category=security, effort=quick
3. Verify it renders with three badges (red "high", muted "security", muted "quick")
4. Toggle the filter dropdowns — verify items filter correctly
5. Check an item as resolved — verify it gets the "resolved" visual state (muted card)

- [ ] **Step 5: Commit**

```bash
git add client/src/pages/ProjectDetail.tsx
git commit -m "feat(tech-debt): rework UI with severity/category/effort + filter bar"
```

---

### Task 7: Launch Checklist Database Migration (A2 — backend schema)

**Files:**
- Modify: `server/src/db/index.ts:33`

- [ ] **Step 1: Add nullable columns to `launch_checklist` table**

Open `server/src/db/index.ts`. Below the existing ALTER TABLE block (the one with `starred`, `github_repo`, and the three `tech_debt` columns added in Task 3), add:

```typescript
try { db.run(`ALTER TABLE launch_checklist ADD COLUMN category TEXT`); } catch {}
try { db.run(`ALTER TABLE launch_checklist ADD COLUMN min_stage TEXT`); } catch {}
try { db.run(`ALTER TABLE launch_checklist ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0`); } catch {}
```

- [ ] **Step 2: Verify migration ran**

Restart dev server:
```bash
lsof -ti:3001 | xargs kill -9 2>/dev/null
cd /Users/glebstarcikov/Launchpad && bun run dev &
sleep 3
```

Inspect schema:
```bash
bun -e "import {db} from './server/src/db/index.ts'; console.log(db.query('PRAGMA table_info(launch_checklist)').all())"
```

Expected: Output includes `category` (TEXT, nullable), `min_stage` (TEXT, nullable), `sort_order` (INTEGER, notnull=1, dflt=0).

- [ ] **Step 3: Commit**

```bash
git add server/src/db/index.ts
git commit -m "feat(db): add category, min_stage, sort_order columns to launch_checklist"
```

---

### Task 8: Rewrite `constants.ts` with Typed Checklist Data (A2 — defaults)

**Files:**
- Rewrite: `server/src/lib/constants.ts`

- [ ] **Step 1: Replace the constants file**

Open `server/src/lib/constants.ts`. The current file exports only `DEFAULT_CHECKLIST` (15 flat strings). Replace the entire file contents with:

```typescript
// Launch checklist defaults — grouped by category, stage-aware, split by project type.
// Sources: ProductHunt launch playbook, YC Startup School, Stripe Atlas, Indie Hackers,
// and general SaaS/OSS launch practices.

export type ChecklistCategory =
  | "validation"
  | "build"
  | "infra"
  | "legal"
  | "marketing"
  | "launch"
  | "growth";

export type ChecklistStage =
  | "idea"
  | "building"
  | "beta"
  | "live"
  | "growing"
  | "sunset";

export interface ChecklistItem {
  item: string;
  category: ChecklistCategory;
  min_stage: ChecklistStage;
  sort_order: number;
}

// Items applicable to both for-profit and open-source projects.
export const CHECKLIST_UNIVERSAL: ChecklistItem[] = [
  // Validation & Research
  { item: "Define target customer persona", category: "validation", min_stage: "idea", sort_order: 100 },
  { item: "Research 3+ direct competitors", category: "validation", min_stage: "idea", sort_order: 110 },
  { item: "Talk to 5+ potential users", category: "validation", min_stage: "idea", sort_order: 120 },
  { item: "Validate the problem is real (evidence, not hypothesis)", category: "validation", min_stage: "idea", sort_order: 130 },
  { item: "Define primary success metric", category: "validation", min_stage: "idea", sort_order: 140 },
  { item: "Write a one-sentence value proposition", category: "validation", min_stage: "idea", sort_order: 150 },

  // Build & MVP
  { item: "Define MVP scope (single paragraph)", category: "build", min_stage: "idea", sort_order: 200 },
  { item: "Create git repository", category: "build", min_stage: "idea", sort_order: 210 },
  { item: "Document local dev environment setup", category: "build", min_stage: "idea", sort_order: 220 },
  { item: "Build core feature #1 (the one thing)", category: "build", min_stage: "idea", sort_order: 230 },
  { item: "Write basic README", category: "build", min_stage: "idea", sort_order: 240 },
  { item: "Set up version control branching strategy", category: "build", min_stage: "idea", sort_order: 250 },
  { item: "Document tech stack decisions", category: "build", min_stage: "idea", sort_order: 260 },

  // Technical Infrastructure
  { item: "Set up CI/CD pipeline", category: "infra", min_stage: "building", sort_order: 300 },
  { item: "Configure custom domain", category: "infra", min_stage: "building", sort_order: 310 },
  { item: "Install SSL certificate", category: "infra", min_stage: "building", sort_order: 320 },
  { item: "Set up uptime monitoring", category: "infra", min_stage: "building", sort_order: 330 },
  { item: "Set up error tracking (Sentry or equivalent)", category: "infra", min_stage: "building", sort_order: 340 },
  { item: "Set up analytics (Plausible / PostHog / etc.)", category: "infra", min_stage: "building", sort_order: 350 },
  { item: "Configure automated backups", category: "infra", min_stage: "building", sort_order: 360 },
  { item: "Set up staging environment", category: "infra", min_stage: "building", sort_order: 370 },
  { item: "Performance baseline (Core Web Vitals)", category: "infra", min_stage: "building", sort_order: 380 },
  { item: "Mobile responsiveness check", category: "infra", min_stage: "building", sort_order: 390 },

  // Legal & Admin
  { item: "Choose business / entity type (or none yet)", category: "legal", min_stage: "building", sort_order: 400 },

  // Marketing & Content
  { item: "Landing page with clear value proposition", category: "marketing", min_stage: "beta", sort_order: 500 },
  { item: "Hero section with demo video or screenshots", category: "marketing", min_stage: "beta", sort_order: 510 },
  { item: "\"About\" page", category: "marketing", min_stage: "beta", sort_order: 520 },
  { item: "Set up Twitter / X account", category: "marketing", min_stage: "beta", sort_order: 530 },
  { item: "Set up LinkedIn page", category: "marketing", min_stage: "beta", sort_order: 540 },
  { item: "SEO basics (meta tags, sitemap, robots.txt)", category: "marketing", min_stage: "beta", sort_order: 550 },
  { item: "Write launch blog post (problem → solution → journey)", category: "marketing", min_stage: "beta", sort_order: 560 },

  // Launch Prep
  { item: "Beta test with 10+ users", category: "launch", min_stage: "beta", sort_order: 600 },
  { item: "Fix all critical bugs", category: "launch", min_stage: "beta", sort_order: 610 },
  { item: "Write launch announcement post", category: "launch", min_stage: "beta", sort_order: 620 },
  { item: "Prepare press kit (logo, screenshots, one-liner, bio)", category: "launch", min_stage: "beta", sort_order: 630 },
  { item: "Decide on launch date", category: "launch", min_stage: "beta", sort_order: 640 },

  // Post-launch Growth
  { item: "Monitor analytics daily for first week", category: "growth", min_stage: "live", sort_order: 700 },
  { item: "Respond to all feedback within 24h", category: "growth", min_stage: "live", sort_order: 710 },
  { item: "Create feedback loop (email, form, or Discord)", category: "growth", min_stage: "live", sort_order: 720 },
  { item: "Iterate based on usage data", category: "growth", min_stage: "live", sort_order: 730 },
  { item: "Document lessons learned", category: "growth", min_stage: "live", sort_order: 740 },
];

// Additional items specific to for-profit projects (paid products, SaaS, etc.).
export const CHECKLIST_FOR_PROFIT: ChecklistItem[] = [
  // Validation
  { item: "Research willingness to pay (surveys, interviews)", category: "validation", min_stage: "idea", sort_order: 160 },
  { item: "Draft pricing strategy (tiers, anchor price)", category: "validation", min_stage: "idea", sort_order: 170 },
  { item: "Identify first 10 target customers (by name)", category: "validation", min_stage: "idea", sort_order: 180 },

  // Build
  { item: "Set up user authentication", category: "build", min_stage: "idea", sort_order: 270 },
  { item: "Define data model for users", category: "build", min_stage: "idea", sort_order: 280 },
  { item: "Plan billing / subscription flow", category: "build", min_stage: "idea", sort_order: 290 },
  { item: "Build customer dashboard", category: "build", min_stage: "building", sort_order: 292 },
  { item: "Build admin dashboard", category: "build", min_stage: "building", sort_order: 294 },

  // Infrastructure
  { item: "Set up transactional email service", category: "infra", min_stage: "building", sort_order: 395 },
  { item: "Set up customer support inbox", category: "infra", min_stage: "building", sort_order: 396 },
  { item: "Configure payment processing", category: "infra", min_stage: "building", sort_order: 397 },
  { item: "Set up webhook handling", category: "infra", min_stage: "building", sort_order: 398 },
  { item: "Define rate limiting", category: "infra", min_stage: "building", sort_order: 399 },
  { item: "Set up secrets management", category: "infra", min_stage: "building", sort_order: 399 },

  // Legal
  { item: "Draft Terms of Service", category: "legal", min_stage: "building", sort_order: 410 },
  { item: "Draft Privacy Policy", category: "legal", min_stage: "building", sort_order: 420 },
  { item: "Register business entity", category: "legal", min_stage: "building", sort_order: 430 },
  { item: "Set up business bank account", category: "legal", min_stage: "building", sort_order: 440 },
  { item: "Tax registration (as required)", category: "legal", min_stage: "building", sort_order: 450 },
  { item: "Cookie consent banner (if EU users)", category: "legal", min_stage: "building", sort_order: 460 },
  { item: "GDPR compliance basics (if EU users)", category: "legal", min_stage: "building", sort_order: 470 },
  { item: "Accounting / invoicing setup", category: "legal", min_stage: "building", sort_order: 480 },
  { item: "Refund & cancellation policy", category: "legal", min_stage: "building", sort_order: 490 },

  // Marketing
  { item: "Pricing page with clear tiers", category: "marketing", min_stage: "beta", sort_order: 570 },
  { item: "FAQ page", category: "marketing", min_stage: "beta", sort_order: 580 },
  { item: "Case studies / testimonials section", category: "marketing", min_stage: "beta", sort_order: 590 },
  { item: "Customer logos section", category: "marketing", min_stage: "beta", sort_order: 592 },
  { item: "Email capture on landing page", category: "marketing", min_stage: "beta", sort_order: 594 },
  { item: "Write first 5 blog posts for content marketing", category: "marketing", min_stage: "beta", sort_order: 596 },
  { item: "Set up email newsletter", category: "marketing", min_stage: "beta", sort_order: 598 },

  // Launch
  { item: "ProductHunt submission draft", category: "launch", min_stage: "beta", sort_order: 650 },
  { item: "HN Show HN draft", category: "launch", min_stage: "beta", sort_order: 660 },
  { item: "Email list of 50+ warm leads", category: "launch", min_stage: "beta", sort_order: 670 },
  { item: "Reddit / Discord community posts drafted", category: "launch", min_stage: "beta", sort_order: 680 },
  { item: "Influencer outreach list", category: "launch", min_stage: "beta", sort_order: 685 },
  { item: "Press contacts (TechCrunch etc.)", category: "launch", min_stage: "beta", sort_order: 690 },
  { item: "Launch day checklist", category: "launch", min_stage: "beta", sort_order: 695 },

  // Growth
  { item: "Track churn and NPS", category: "growth", min_stage: "live", sort_order: 750 },
  { item: "A/B test pricing", category: "growth", min_stage: "live", sort_order: 760 },
  { item: "Start content marketing pipeline", category: "growth", min_stage: "live", sort_order: 770 },
  { item: "SEO optimization pass", category: "growth", min_stage: "live", sort_order: 780 },
  { item: "Set up referral program", category: "growth", min_stage: "live", sort_order: 790 },
  { item: "Customer interview cadence (weekly)", category: "growth", min_stage: "live", sort_order: 795 },
];

// Additional items specific to open-source projects.
export const CHECKLIST_OPEN_SOURCE: ChecklistItem[] = [
  // Validation
  { item: "Check for existing OSS alternatives", category: "validation", min_stage: "idea", sort_order: 160 },
  { item: "Define licensing strategy (MIT / Apache / GPL)", category: "validation", min_stage: "idea", sort_order: 170 },
  { item: "Identify 10 potential early contributors", category: "validation", min_stage: "idea", sort_order: 180 },

  // Build
  { item: "Write CONTRIBUTING.md", category: "build", min_stage: "idea", sort_order: 270 },
  { item: "Set up issue templates", category: "build", min_stage: "idea", sort_order: 280 },
  { item: "Write CODE_OF_CONDUCT.md", category: "build", min_stage: "idea", sort_order: 290 },
  { item: "Document local dev setup for contributors", category: "build", min_stage: "idea", sort_order: 292 },
  { item: "Add example usage in README", category: "build", min_stage: "idea", sort_order: 294 },

  // Infrastructure
  { item: "Configure GitHub Actions for tests", category: "infra", min_stage: "building", sort_order: 395 },
  { item: "Set up release automation", category: "infra", min_stage: "building", sort_order: 396 },
  { item: "Configure dependabot", category: "infra", min_stage: "building", sort_order: 397 },
  { item: "Set up code coverage reporting", category: "infra", min_stage: "building", sort_order: 398 },
  { item: "Add badges to README (build, coverage, license)", category: "infra", min_stage: "building", sort_order: 399 },

  // Legal
  { item: "Pick an OSS license (MIT / Apache / GPL)", category: "legal", min_stage: "building", sort_order: 410 },
  { item: "Add LICENSE file to repo", category: "legal", min_stage: "building", sort_order: 420 },
  { item: "Trademark check for project name", category: "legal", min_stage: "building", sort_order: 430 },
  { item: "Contributor License Agreement (CLA) decision", category: "legal", min_stage: "building", sort_order: 440 },
  { item: "Copyright notice in source files", category: "legal", min_stage: "building", sort_order: 450 },

  // Marketing
  { item: "Comprehensive README with quickstart", category: "marketing", min_stage: "beta", sort_order: 570 },
  { item: "Documentation site (VitePress / Docusaurus / equivalent)", category: "marketing", min_stage: "beta", sort_order: 580 },
  { item: "API documentation", category: "marketing", min_stage: "beta", sort_order: 590 },
  { item: "Write first blog post about the project", category: "marketing", min_stage: "beta", sort_order: 592 },
  { item: "Create demo / playground site", category: "marketing", min_stage: "beta", sort_order: 594 },

  // Launch
  { item: "HN Show HN draft", category: "launch", min_stage: "beta", sort_order: 650 },
  { item: "Reddit r/programming + language-specific subreddit posts", category: "launch", min_stage: "beta", sort_order: 660 },
  { item: "Tweet thread with demo", category: "launch", min_stage: "beta", sort_order: 670 },
  { item: "Dev.to / Hashnode article", category: "launch", min_stage: "beta", sort_order: 680 },
  { item: "Submit to relevant awesome-* lists", category: "launch", min_stage: "beta", sort_order: 685 },
  { item: "Discord / Slack community announcements", category: "launch", min_stage: "beta", sort_order: 690 },

  // Growth
  { item: "Triage issues weekly", category: "growth", min_stage: "live", sort_order: 750 },
  { item: "Respond to PRs within 48h", category: "growth", min_stage: "live", sort_order: 760 },
  { item: "Grow contributor base (mentor first contributors)", category: "growth", min_stage: "live", sort_order: 770 },
  { item: "Release cadence (weekly / monthly)", category: "growth", min_stage: "live", sort_order: 780 },
  { item: "Maintain changelog", category: "growth", min_stage: "live", sort_order: 790 },
];

/**
 * Returns the default checklist items for a new project based on its type.
 * Combines universal items with type-specific items.
 */
export function getDefaultChecklist(projectType: "for-profit" | "open-source"): ChecklistItem[] {
  const typeSpecific = projectType === "open-source" ? CHECKLIST_OPEN_SOURCE : CHECKLIST_FOR_PROFIT;
  return [...CHECKLIST_UNIVERSAL, ...typeSpecific];
}
```

Note: `DEFAULT_CHECKLIST` (the old constant) is removed. Callers in `projects.ts` and `ideas.ts` will be updated in Task 9.

- [ ] **Step 2: Rebuild to verify**

```bash
cd /Users/glebstarcikov/Launchpad && bun build client/src/main.tsx --outdir client/dist --target browser 2>&1 | tail -10
```

Expected: Client build succeeds (the client doesn't import this file, so this is just a sanity check). Server won't be restarted until next task.

- [ ] **Step 3: Commit**

```bash
git add server/src/lib/constants.ts
git commit -m "feat(checklist): replace DEFAULT_CHECKLIST with typed categorized defaults"
```

---

### Task 9: Update Project Creation + Idea Promotion to Seed New Checklist (A2 — seeding)

**Files:**
- Modify: `server/src/routes/projects.ts:4, 40-61`
- Modify: `server/src/routes/ideas.ts:55-71`

- [ ] **Step 1: Update projects.ts create handler**

Open `server/src/routes/projects.ts`. Find the import line (around line 4):

```typescript
import { DEFAULT_CHECKLIST } from "../lib/constants.ts";
```

Replace with:

```typescript
import { getDefaultChecklist } from "../lib/constants.ts";
```

Then find the POST `/` handler (around line 41–61). Locate this block:

```typescript
const insertItem = db.prepare(
  "INSERT INTO launch_checklist (id, project_id, item, completed, created_at) VALUES (?, ?, ?, 0, ?)"
);
for (const item of DEFAULT_CHECKLIST) {
  insertItem.run(crypto.randomUUID(), id, item, now);
}
```

Replace with:

```typescript
const projectType = (type ?? "for-profit") as "for-profit" | "open-source";
const insertItem = db.prepare(
  "INSERT INTO launch_checklist (id, project_id, item, completed, category, min_stage, sort_order, created_at) VALUES (?, ?, ?, 0, ?, ?, ?, ?)"
);
for (const entry of getDefaultChecklist(projectType)) {
  insertItem.run(crypto.randomUUID(), id, entry.item, entry.category, entry.min_stage, entry.sort_order, now);
}
```

- [ ] **Step 2: Update ideas.ts promote handler**

Open `server/src/routes/ideas.ts`. Find the import line (around line 4):

```typescript
import { DEFAULT_CHECKLIST } from "../lib/constants.ts";
```

Replace with:

```typescript
import { getDefaultChecklist } from "../lib/constants.ts";
```

Find the promote handler block (around line 58–64):

```typescript
// Seed default checklist for new project
const insertItem = db.prepare(
  "INSERT INTO launch_checklist (id, project_id, item, completed, created_at) VALUES (?, ?, ?, 0, ?)"
);
for (const item of DEFAULT_CHECKLIST) {
  insertItem.run(crypto.randomUUID(), projectId, item, now);
}
```

Replace with:

```typescript
// Seed default checklist for new project (promoted ideas default to for-profit)
const insertItem = db.prepare(
  "INSERT INTO launch_checklist (id, project_id, item, completed, category, min_stage, sort_order, created_at) VALUES (?, ?, ?, 0, ?, ?, ?, ?)"
);
for (const entry of getDefaultChecklist("for-profit")) {
  insertItem.run(crypto.randomUUID(), projectId, entry.item, entry.category, entry.min_stage, entry.sort_order, now);
}
```

- [ ] **Step 3: Test by creating a new project**

Restart the dev server:
```bash
lsof -ti:3001 | xargs kill -9 2>/dev/null
cd /Users/glebstarcikov/Launchpad && bun run dev &
sleep 3
```

In the browser, create a new project (type = for-profit). Then inspect the DB:

```bash
bun -e "import {db} from './server/src/db/index.ts'; const rows = db.query('SELECT item, category, min_stage, sort_order FROM launch_checklist WHERE project_id = (SELECT id FROM projects ORDER BY created_at DESC LIMIT 1) ORDER BY sort_order').all(); console.log(rows.length, 'items'); console.log(rows.slice(0, 5));"
```

Expected: Output shows ~65 items (41 universal + 43 for-profit – 19 duplicated, roughly). The first 5 items should all have `category='validation'`, `min_stage='idea'`, and increasing `sort_order` starting from 100.

Repeat with type=open-source to verify open-source gets ~55 items including OSS-specific ones like "Pick an OSS license".

- [ ] **Step 4: Commit**

```bash
git add server/src/routes/projects.ts server/src/routes/ideas.ts
git commit -m "feat(checklist): seed new projects with type-specific categorized checklist"
```

---

### Task 10: Extend Checklist API Routes to Accept New Fields (A2 — server)

**Files:**
- Modify: `server/src/routes/projects.ts:153-189`

- [ ] **Step 1: Extend POST /launch-checklist to accept category + min_stage**

Open `server/src/routes/projects.ts`. Find the POST `/:id/launch-checklist` handler (around line 153–168):

```typescript
// POST /api/projects/:id/launch-checklist
router.post("/:id/launch-checklist", async (c) => {
  if (!ownsProject(c.req.param("id"), c.get("userId"))) {
    return c.json({ error: "Not found" }, 404);
  }
  const { item } = await c.req.json();
  if (!item) return c.json({ error: "item required" }, 400);
  const id = crypto.randomUUID();
  const now = Date.now();
  db.run("INSERT INTO launch_checklist (id, project_id, item, completed, created_at) VALUES (?, ?, ?, 0, ?)",
    [id, c.req.param("id"), item, now]);
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

User-added items get `sort_order=9999` so they sort to the end of their category section.

- [ ] **Step 2: Extend PUT /launch-checklist/:itemId to accept partial updates**

Find the PUT `/:id/launch-checklist/:itemId` handler (around line 170–179):

```typescript
// PUT /api/projects/:id/launch-checklist/:itemId
router.put("/:id/launch-checklist/:itemId", async (c) => {
  if (!ownsProject(c.req.param("id"), c.get("userId"))) {
    return c.json({ error: "Not found" }, 404);
  }
  const { completed } = await c.req.json();
  db.run("UPDATE launch_checklist SET completed = ? WHERE id = ? AND project_id = ?",
    [completed ? 1 : 0, c.req.param("itemId"), c.req.param("id")]);
  return c.json({ ok: true });
});
```

Replace with:

```typescript
// PUT /api/projects/:id/launch-checklist/:itemId
router.put("/:id/launch-checklist/:itemId", async (c) => {
  if (!ownsProject(c.req.param("id"), c.get("userId"))) {
    return c.json({ error: "Not found" }, 404);
  }
  const { completed, item, category, min_stage } = await c.req.json();
  const sets: string[] = [];
  const params: (string | number | null)[] = [];
  if (completed !== undefined) { sets.push("completed = ?"); params.push(completed ? 1 : 0); }
  if (item !== undefined) { sets.push("item = ?"); params.push(item); }
  if (category !== undefined) { sets.push("category = ?"); params.push(category); }
  if (min_stage !== undefined) { sets.push("min_stage = ?"); params.push(min_stage); }
  if (sets.length === 0) return c.json({ ok: true });
  params.push(c.req.param("itemId"), c.req.param("id"));
  db.run(`UPDATE launch_checklist SET ${sets.join(", ")} WHERE id = ? AND project_id = ?`, params);
  return c.json({ ok: true });
});
```

Now the update endpoint accepts any subset of `completed`, `item`, `category`, `min_stage`. Old callers passing just `{ completed: true }` still work.

- [ ] **Step 3: Update the GET handler to order by sort_order**

Find the GET `/:id/launch-checklist` handler (around line 140–151). The current ORDER BY is `created_at ASC`. Replace with `COALESCE(sort_order, 9999), created_at ASC` so type-seeded items appear in category/sort order and user-added items fall to the bottom. The handler becomes:

```typescript
// GET /api/projects/:id/launch-checklist
router.get("/:id/launch-checklist", (c) => {
  if (!ownsProject(c.req.param("id"), c.get("userId"))) {
    return c.json({ error: "Not found" }, 404);
  }
  return c.json(
    db.query<LaunchChecklistItem, [string]>(
      "SELECT * FROM launch_checklist WHERE project_id = ? ORDER BY COALESCE(sort_order, 9999), created_at ASC"
    ).all(c.req.param("id"))
  );
});
```

- [ ] **Step 4: Commit**

```bash
git add server/src/routes/projects.ts
git commit -m "feat(checklist): accept category/min_stage on create + update, order by sort_order"
```

---

### Task 11: Extend Checklist Client Types + API (A2 — client data layer)

**Files:**
- Modify: `client/src/lib/types.ts`
- Modify: `client/src/lib/api.ts:87-95`

- [ ] **Step 1: Extend `LaunchChecklistItem` type**

Open `client/src/lib/types.ts`. Find:

```typescript
export interface LaunchChecklistItem {
  id: string;
  project_id: string;
  item: string;
  completed: 0 | 1;
  created_at: number;
}
```

Replace with:

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

Note: `ProjectStage` is already defined in this file at the top. The `min_stage` type uses it so every valid project stage is a valid min_stage value.

- [ ] **Step 2: Extend `checklist` API namespace**

Open `client/src/lib/api.ts`. Find the `checklist` block (around line 87–95) and replace:

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

- [ ] **Step 3: Update the type import at top of api.ts**

Add `ChecklistCategory` to the type import list (should be alongside `ProjectStage` which is already imported). Example:

```typescript
import type { User, Project, ..., ChecklistCategory, ProjectStage, ... } from "./types";
```

- [ ] **Step 4: Rebuild to catch any type errors in consuming callsites**

```bash
cd /Users/glebstarcikov/Launchpad && bun build client/src/main.tsx --outdir client/dist --target browser 2>&1 | tail -10
```

Expected: Build may show TypeScript errors in `ProjectDetail.tsx` LaunchChecklistCard (it calls `checklist.create(id, string)` with the old signature). These will be fixed in Task 12. If the build fails, proceed to Task 12 — don't commit yet.

If build succeeds (which it will, because the old signature `create(id, item)` matches `data: { item }` via JS runtime coercion won't work — actually it will fail because we changed the positional arg to an object), commit after Task 12 passes.

**Actually:** this task changes `create(id, item: string)` to `create(id, data: { item, ... })`. The callsite in LaunchChecklistCard passes `addItem.mutate(newItem.trim())` which would need to become `addItem.mutate({ item: newItem.trim() })`. Don't commit this task independently — commit it together with Task 12.

---

### Task 12: Rewrite LaunchChecklistCard UI with Categories + Stage Awareness (A2 — client UI)

**Files:**
- Modify: `client/src/pages/ProjectDetail.tsx:1063-1150` (LaunchChecklistCard) + add helper above

- [ ] **Step 1: Add imports for `ChecklistCategory`**

At the top of `client/src/pages/ProjectDetail.tsx`, add `ChecklistCategory` to the type import (alongside the existing imports like `LaunchChecklistItem`):

```typescript
import type { Project, ProjectLink, LaunchChecklistItem, ChecklistCategory, TechDebtItem, TechDebtSeverity, TechDebtCategory, TechDebtEffort, MrrEntry, Goal, ProjectStage, ProjectType, ProjectCountry, LegalItem, Note, GitHubRepoData } from "@/lib/types";
```

- [ ] **Step 2: Add category constants + helpers above `LaunchChecklistCard`**

Find the `LaunchChecklistCard` function (around line 1063). Immediately above it, add:

```typescript
const CATEGORY_ORDER: ChecklistCategory[] = ["validation", "build", "infra", "legal", "marketing", "launch", "growth"];

const CATEGORY_LABELS: Record<ChecklistCategory, string> = {
  validation: "Validation & Research",
  build: "Build & MVP",
  infra: "Technical Infrastructure",
  legal: "Legal & Admin",
  marketing: "Marketing & Content",
  launch: "Launch Prep",
  growth: "Post-launch Growth",
};

const STAGE_ORDER: ProjectStage[] = ["idea", "building", "beta", "live", "growing", "sunset"];

function isStageRelevant(itemMinStage: ProjectStage | null, projectStage: ProjectStage): boolean {
  if (!itemMinStage) return true; // legacy items with no min_stage are always relevant
  const itemIdx = STAGE_ORDER.indexOf(itemMinStage);
  const projectIdx = STAGE_ORDER.indexOf(projectStage);
  return itemIdx <= projectIdx;
}
```

- [ ] **Step 3: Update `LaunchChecklistCard` to accept `projectStage` prop**

Find the `LaunchChecklistCard` function signature:

```typescript
function LaunchChecklistCard({ id, queryClient }: { id: string; queryClient: ReturnType<typeof useQueryClient> }) {
```

Replace with:

```typescript
function LaunchChecklistCard({ id, projectStage, queryClient }: { id: string; projectStage: ProjectStage; queryClient: ReturnType<typeof useQueryClient> }) {
```

Then find the callsite in `OverviewTab` (around line 179):

```tsx
<LaunchChecklistCard id={id} queryClient={queryClient} />
```

Replace with:

```tsx
<LaunchChecklistCard id={id} projectStage={project.stage} queryClient={queryClient} />
```

- [ ] **Step 4: Replace the entire LaunchChecklistCard body**

Replace the full `LaunchChecklistCard` function (including the existing mutations and JSX) with:

```typescript
function LaunchChecklistCard({ id, projectStage, queryClient }: { id: string; projectStage: ProjectStage; queryClient: ReturnType<typeof useQueryClient> }) {
  const [newItemByCategory, setNewItemByCategory] = useState<Record<string, string>>({});

  const { data: items = [] } = useQuery({
    queryKey: ["checklist", id],
    queryFn: () => api.projects.checklist.list(id),
  });

  const completed = items.filter((i: LaunchChecklistItem) => i.completed === 1).length;
  const pct = items.length > 0 ? (completed / items.length) * 100 : 0;

  const toggleItem = useMutation({
    mutationFn: ({ itemId, completed }: { itemId: string; completed: boolean }) =>
      api.projects.checklist.update(id, itemId, { completed }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["checklist", id] }),
  });

  const addItem = useMutation({
    mutationFn: (data: { item: string; category?: ChecklistCategory }) =>
      api.projects.checklist.create(id, data),
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ["checklist", id] });
      setNewItemByCategory((prev) => ({ ...prev, [vars.category ?? "general"]: "" }));
    },
  });

  const deleteItem = useMutation({
    mutationFn: (itemId: string) => api.projects.checklist.delete(id, itemId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["checklist", id] }),
  });

  // Group items by category. Legacy items (null category) go to "general".
  const grouped: Record<string, LaunchChecklistItem[]> = {};
  for (const item of items) {
    const key = item.category ?? "general";
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(item);
  }

  // Build category render order: "general" first (legacy), then CATEGORY_ORDER.
  const renderOrder: string[] = [];
  if (grouped["general"]?.length) renderOrder.push("general");
  for (const cat of CATEGORY_ORDER) {
    if (grouped[cat]?.length || newItemByCategory[cat] !== undefined) renderOrder.push(cat);
  }
  // Always show all new-project categories even if empty (so user can add to them).
  for (const cat of CATEGORY_ORDER) {
    if (!renderOrder.includes(cat)) renderOrder.push(cat);
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium">Launch Checklist</CardTitle>
          <span className="text-xs text-muted-foreground">{completed}/{items.length}</span>
        </div>
        <Progress value={pct} className="h-2 mt-2" />
      </CardHeader>
      <CardContent className="space-y-4">
        {renderOrder.map((catKey) => {
          const categoryItems = grouped[catKey] ?? [];
          const catLabel = catKey === "general" ? "General" : CATEGORY_LABELS[catKey as ChecklistCategory];
          const catCompleted = categoryItems.filter((i) => i.completed === 1).length;
          const newValue = newItemByCategory[catKey] ?? "";

          return (
            <div key={catKey} className="space-y-1.5">
              <div className="flex items-center justify-between mb-1">
                <h4 className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">
                  {catLabel}
                </h4>
                {categoryItems.length > 0 && (
                  <span className="text-[10px] text-muted-foreground tabular-nums">
                    {catCompleted}/{categoryItems.length}
                  </span>
                )}
              </div>
              {categoryItems.map((item: LaunchChecklistItem) => {
                const relevant = isStageRelevant(item.min_stage, projectStage);
                return (
                  <div key={item.id} className={cn("flex items-center gap-2 group", !relevant && "opacity-50")}>
                    <Checkbox
                      id={`chk-${item.id}`}
                      checked={item.completed === 1}
                      onCheckedChange={(v) => toggleItem.mutate({ itemId: item.id, completed: !!v })}
                    />
                    <label
                      htmlFor={`chk-${item.id}`}
                      className={cn(
                        "text-sm flex-1 cursor-pointer",
                        item.completed === 1 && "line-through text-muted-foreground"
                      )}
                    >
                      {item.item}
                    </label>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 opacity-0 group-hover:opacity-100 hover:text-destructive"
                      onClick={() => deleteItem.mutate(item.id)}
                    >
                      <Trash2 size={11} />
                    </Button>
                  </div>
                );
              })}
              {catKey !== "general" && (
                <div className="flex gap-2 pt-1">
                  <Input
                    value={newValue}
                    onChange={(e) => setNewItemByCategory((prev) => ({ ...prev, [catKey]: e.target.value }))}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && newValue.trim()) {
                        addItem.mutate({ item: newValue.trim(), category: catKey as ChecklistCategory });
                      }
                    }}
                    placeholder={`Add to ${catLabel}...`}
                    className="text-xs h-8"
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 text-xs"
                    disabled={!newValue.trim() || addItem.isPending}
                    onClick={() => addItem.mutate({ item: newValue.trim(), category: catKey as ChecklistCategory })}
                  >
                    Add
                  </Button>
                </div>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 5: Rebuild and verify**

```bash
cd /Users/glebstarcikov/Launchpad && bun build client/src/main.tsx --outdir client/dist --target browser 2>&1 | tail -10
```

Expected: Build succeeds with no TypeScript errors.

Manually verify in the browser:
1. Create a new for-profit project with stage = "idea"
2. Navigate to its Overview tab
3. Verify the Launch Checklist shows 7 category headers (Validation, Build, Infra, Legal, Marketing, Launch, Growth)
4. Items in Validation & Build should be at full opacity (min_stage = "idea")
5. Items in Infra & Legal should be at 50% opacity (min_stage = "building", project is "idea")
6. Items in Marketing & Launch should be at 50% opacity (min_stage = "beta")
7. Items in Growth should be at 50% opacity (min_stage = "live")
8. Edit the project to stage = "beta", refresh — items in Infra, Legal, Marketing, Launch should now be at full opacity
9. Add a custom item to the Marketing category — verify it appears
10. Navigate to an old project (pre-migration) — verify items appear under a "General" section at the top with no muting

- [ ] **Step 6: Commit (together with Task 11's changes)**

```bash
git add client/src/pages/ProjectDetail.tsx client/src/lib/types.ts client/src/lib/api.ts
git commit -m "feat(checklist): category grouping + stage-aware muting in Overview tab"
```

---

### Task 13: Playwright Verification Pass

**Files:**
- No file changes — uses Playwright MCP tools

- [ ] **Step 1: Ensure dev server is running**

```bash
lsof -ti:3001 >/dev/null 2>&1 || (cd /Users/glebstarcikov/Launchpad && bun run dev &) && sleep 3
```

- [ ] **Step 2: Test A1.1 — Dashboard colors**

Navigate to `http://localhost:3001/` in Playwright. Take a screenshot. Verify: Idea Inbox number is white (not yellow) regardless of its value.

- [ ] **Step 3: Test A1.2 — Site Status URL overflow**

Create or use a project with a long URL (e.g. `https://this-is-a-very-long-example-domain-name.example.com/some/path`). Navigate to Health tab. Take a screenshot. Verify:
- URL truncates with ellipsis, does NOT overflow
- Ping Now button is fully visible, stays on the right
- Card doesn't break layout

- [ ] **Step 4: Test A1.3 — Tech Debt UI**

On the Health tab:
1. Add a tech debt item: note = "Fix auth race condition", severity = "high", category = "security", effort = "moderate"
2. Verify it renders with three badges
3. Change filter to "Resolved" — verify the item disappears
4. Change filter back to "Open" — verify it reappears
5. Check the checkbox to mark resolved — verify card gets muted state
6. Delete the item — verify it's removed

- [ ] **Step 5: Test A2 — Launch Checklist**

Create a new project: name = "Test Checklist A2", type = for-profit, stage = idea. Navigate to Overview tab. Verify:
1. 7 category sections visible (Validation, Build, Infra, Legal, Marketing, Launch, Growth)
2. Validation + Build items are at full opacity
3. Infra, Legal, Marketing, Launch, Growth items are at 50% opacity
4. Total item count ≥ 60
5. Add a custom item "Custom Validation Task" to Validation category — verify it appears and counts toward total

Change project stage to "beta":
6. Infra, Legal, Marketing, Launch items are now at full opacity
7. Growth items are still at 50% opacity

Create another project: name = "Test OSS A2", type = open-source, stage = idea. Verify:
8. Legal section contains "Pick an OSS license", "Add LICENSE file" — NOT "Draft Terms of Service"
9. Build section contains "Write CONTRIBUTING.md" — NOT "Set up user authentication"

- [ ] **Step 6: Take final screenshots for documentation**

Capture screenshots of:
- Dashboard (color fix)
- Health tab (tech debt new UI + URL fix)
- Project Overview tab (checklist with categories)
- Project Overview tab after stage change (muting updated)

Save to `.playwright-mcp/` for reference.

- [ ] **Step 7: No additional commit needed**

If all verifications pass, the plan is complete. If any step fails, file the issue and create a follow-up fix task before marking the plan done.
