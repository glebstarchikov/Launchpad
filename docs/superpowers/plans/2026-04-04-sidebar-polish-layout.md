# Sidebar Polish & Page Layout Standardization — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Standardize all page layouts to full-width with consistent headers, remove non-functional search from sidebar, add project starring with sidebar favorites.

**Architecture:** Backend adds a `starred` column + toggle endpoint. Frontend standardizes all page roots to `px-8 py-6` with `text-lg font-semibold` title headers. Sidebar removes search, shows starred projects in a "Starred" section (hidden when empty).

**Tech Stack:** Bun + Hono + SQLite (server), React 18 + TypeScript + Tailwind CSS 3.4 + React Query 5 (client)

---

## File Structure

| Action | Path | Responsibility |
|--------|------|---------------|
| Modify | `server/src/db/index.ts` | Add `starred` column to projects table |
| Modify | `server/src/routes/projects.ts` | Add `PUT /:id/star` toggle endpoint |
| Modify | `client/src/lib/types.ts` | Add `starred` field to Project interface |
| Modify | `client/src/lib/api.ts` | Add `star` method to projects API |
| Modify | `client/src/components/Sidebar.tsx` | Remove search, add starred section, hide empty sections |
| Modify | `client/src/pages/Dashboard.tsx` | Standardize layout to `px-8 py-6`, remove subtitle, fix header size |
| Modify | `client/src/pages/Projects.tsx` | Standardize layout, add star button to project cards |
| Modify | `client/src/pages/Files.tsx` | Standardize layout, remove max-width and subtitle |
| Modify | `client/src/pages/Ideas.tsx` | Standardize left-pane header size |
| Modify | `client/src/pages/ProjectDetail.tsx` | Standardize header size, add star button |

---

### Task 1: Add starred column and API endpoint

**Files:**
- Modify: `server/src/db/index.ts:18-30`
- Modify: `server/src/routes/projects.ts`
- Modify: `client/src/lib/types.ts:13-25`
- Modify: `client/src/lib/api.ts:56-63`

- [ ] **Step 1: Add starred column to projects table**

In `server/src/db/index.ts`, after the `CREATE TABLE IF NOT EXISTS projects` statement (line 30), add the ALTER TABLE migration:

```typescript
db.run(`ALTER TABLE projects ADD COLUMN starred INTEGER NOT NULL DEFAULT 0`).catch(() => {});
```

The `.catch(() => {})` silently ignores the error when the column already exists (SQLite doesn't have `IF NOT EXISTS` for ALTER TABLE).

- [ ] **Step 2: Add star toggle endpoint**

In `server/src/routes/projects.ts`, add a new route after the existing `PUT /:id` route (around line 85). Find the line `// DELETE /api/projects/:id` and insert before it:

```typescript
// PUT /api/projects/:id/star — toggle starred
router.put(":id/star", async (c) => {
  const id = c.req.param("id");
  const userId = c.get("userId");
  if (!ownsProject(id, userId)) return c.json({ error: "Not found" }, 404);
  const project = db.query("SELECT starred FROM projects WHERE id = ?").get(id) as { starred: number } | null;
  if (!project) return c.json({ error: "Not found" }, 404);
  const newVal = project.starred ? 0 : 1;
  db.run("UPDATE projects SET starred = ?, updated_at = ? WHERE id = ?", [newVal, Date.now(), id]);
  const updated = db.query("SELECT * FROM projects WHERE id = ?").get(id);
  return c.json(updated);
});
```

- [ ] **Step 3: Add starred to Project type**

In `client/src/lib/types.ts`, add `starred` field to the Project interface after `updated_at`:

```typescript
export interface Project {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  url: string | null;
  type: ProjectType;
  stage: ProjectStage;
  tech_stack: string;
  last_deployed: number | null;
  created_at: number;
  updated_at: number;
  starred: 0 | 1;
}
```

- [ ] **Step 4: Add star API method**

In `client/src/lib/api.ts`, add `star` method inside the `projects` object, after the `delete` method (line 63):

```typescript
    star: (id: string) =>
      req<Project>(`/projects/${id}/star`, { method: "PUT" }),
```

- [ ] **Step 5: Build and verify**

```bash
cd /Users/glebstarcikov/Launchpad && bun build client/src/main.tsx --outdir client/dist --target browser 2>&1 | tail -5
```

Expected: Build succeeds with no errors.

- [ ] **Step 6: Commit**

```bash
git add server/src/db/index.ts server/src/routes/projects.ts client/src/lib/types.ts client/src/lib/api.ts
git commit -m "feat: add starred column to projects + toggle API endpoint"
```

---

### Task 2: Standardize page layouts

**Files:**
- Modify: `client/src/pages/Dashboard.tsx`
- Modify: `client/src/pages/Projects.tsx`
- Modify: `client/src/pages/Files.tsx`
- Modify: `client/src/pages/Ideas.tsx`
- Modify: `client/src/pages/ProjectDetail.tsx`

All scrollable pages get the same root: `px-8 py-6` (no max-width). All titles: `text-lg font-semibold`. No subtitles.

- [ ] **Step 1: Standardize Dashboard.tsx**

In `client/src/pages/Dashboard.tsx`, make these changes:

Replace the loading state wrapper (line 22):
```
<div className="p-8 max-w-6xl">
```
with:
```
<div className="px-8 py-6">
```

Replace the error state wrapper (line 36):
```
<div className="p-8">
```
with:
```
<div className="px-8 py-6">
```

Replace the main content wrapper (line 53):
```
<div className="p-8 max-w-6xl space-y-8">
```
with:
```
<div className="px-8 py-6 space-y-6">
```

Replace the header block (lines 54-57):
```
      <div>
        <h1 className="text-[22px] font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-1">Your founder command centre</p>
      </div>
```
with:
```
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Dashboard</h1>
      </div>
```

- [ ] **Step 2: Standardize Projects.tsx**

In `client/src/pages/Projects.tsx`, make these changes:

Replace the root wrapper:
```
<div className="p-8">
```
with:
```
<div className="px-8 py-6">
```

Replace the h1 (line 115):
```
        <h1 className="text-2xl font-bold text-foreground">Projects</h1>
```
with:
```
        <h1 className="text-lg font-semibold">Projects</h1>
```

- [ ] **Step 3: Standardize Files.tsx**

Replace the entire `client/src/pages/Files.tsx` with:

```tsx
import FilesView from "@/components/FilesView";

export default function Files() {
  return (
    <div className="px-8 py-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Files</h1>
      </div>
      <FilesView />
    </div>
  );
}
```

- [ ] **Step 4: Standardize Ideas.tsx left-pane header**

In `client/src/pages/Ideas.tsx`, replace the left-pane h1 (line 90):
```
          <h1 className="font-semibold text-sm">Ideas</h1>
```
with:
```
          <h1 className="text-lg font-semibold">Ideas</h1>
```

- [ ] **Step 5: Standardize ProjectDetail.tsx header**

In `client/src/pages/ProjectDetail.tsx`, the h1 is already `text-xl font-semibold tracking-tight` (line 71). Change to:
```
          <h1 className="text-lg font-semibold">{project.name}</h1>
```

- [ ] **Step 6: Build and verify**

```bash
cd /Users/glebstarcikov/Launchpad && bun build client/src/main.tsx --outdir client/dist --target browser 2>&1 | tail -5
```

Expected: Build succeeds.

- [ ] **Step 7: Commit**

```bash
git add client/src/pages/Dashboard.tsx client/src/pages/Projects.tsx client/src/pages/Files.tsx client/src/pages/Ideas.tsx client/src/pages/ProjectDetail.tsx
git commit -m "fix: standardize all page layouts to full-width px-8 py-6 with consistent headers"
```

---

### Task 3: Add star button to Projects page and ProjectDetail

**Files:**
- Modify: `client/src/pages/Projects.tsx`
- Modify: `client/src/pages/ProjectDetail.tsx`

- [ ] **Step 1: Add star toggle to project cards on Projects page**

In `client/src/pages/Projects.tsx`, add `Star` to the lucide-react imports:
```typescript
import { FolderKanban, Plus, Search, ArrowUpRight, Star } from "lucide-react";
```

Add the star mutation and handler inside the `Projects` component (after the existing `createProject` mutation):

```typescript
  const starProject = useMutation({
    mutationFn: (id: string) => api.projects.star(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
    },
  });
```

In the `ProjectCard` subcomponent, find the card header area where the project name is displayed. Add a star button before the project name or in the card header. Find the line with the project name display and add a star icon button. In the card's top row (the one with `<h2>` or the name), add:

```tsx
<button
  onClick={(e) => { e.stopPropagation(); starProject.mutate(project.id); }}
  className="h-6 w-6 flex items-center justify-center rounded text-muted-foreground hover:text-foreground transition-colors shrink-0"
  aria-label={project.starred ? "Unstar project" : "Star project"}
>
  <Star size={14} className={project.starred ? "fill-warning text-warning" : ""} />
</button>
```

The exact location depends on the card layout — place it inline with the project name, on the right side of the name row.

- [ ] **Step 2: Add star toggle to ProjectDetail header**

In `client/src/pages/ProjectDetail.tsx`, add `Star` to the lucide-react imports.

Add a star mutation inside the component:

```typescript
  const starProject = useMutation({
    mutationFn: () => api.projects.star(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project", id] });
      queryClient.invalidateQueries({ queryKey: ["projects"] });
    },
  });
```

In the sticky header, add a star button right after the h1 element (line 71):

```tsx
          <button
            onClick={() => starProject.mutate()}
            className="h-7 w-7 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground transition-colors shrink-0"
            aria-label={project.starred ? "Unstar project" : "Star project"}
          >
            <Star size={15} className={project.starred ? "fill-warning text-warning" : ""} />
          </button>
```

- [ ] **Step 3: Build and verify**

```bash
cd /Users/glebstarcikov/Launchpad && bun build client/src/main.tsx --outdir client/dist --target browser 2>&1 | tail -5
```

- [ ] **Step 4: Commit**

```bash
git add client/src/pages/Projects.tsx client/src/pages/ProjectDetail.tsx
git commit -m "feat: add star toggle button to project cards and detail header"
```

---

### Task 4: Update Sidebar — remove search, add starred section

**Files:**
- Modify: `client/src/components/Sidebar.tsx`

- [ ] **Step 1: Rewrite Sidebar.tsx**

Replace the entire contents of `client/src/components/Sidebar.tsx` with:

```tsx
import { useState } from "react";
import { NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  FolderKanban,
  Lightbulb,
  Files,
  ChevronDown,
  ChevronRight,
  Star,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";

const NAV = [
  { to: "/", icon: LayoutDashboard, label: "Home" },
  { to: "/projects", icon: FolderKanban, label: "Projects" },
  { to: "/ideas", icon: Lightbulb, label: "Ideas" },
  { to: "/files", icon: Files, label: "Files" },
];

function CollapsibleSection({
  title,
  defaultOpen = true,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center w-full px-4 py-1.5 text-[12px] font-medium text-muted-foreground hover:text-foreground transition-colors"
      >
        <span className="flex-1 text-left">{title}</span>
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
      </button>
      {open && <div className="mt-0.5">{children}</div>}
    </div>
  );
}

export default function Sidebar() {
  const { data: projects } = useQuery({
    queryKey: ["projects"],
    queryFn: api.projects.list,
  });

  const allProjects = projects ?? [];
  const starredProjects = allProjects.filter((p) => p.starred);
  const recentProjects = allProjects.slice(0, 5);

  return (
    <div className="flex flex-col h-full">
      {/* Nav section */}
      <div className="px-2 pt-2 pb-2 space-y-0.5">
        {NAV.map(({ to, icon: Icon, label }) => (
          <NavLink key={to} to={to} end={to === "/"} className="block">
            {({ isActive }) => (
              <div
                className={cn(
                  "flex items-center gap-2.5 w-full px-3 py-[7px] rounded-md text-[13px] transition-colors",
                  isActive
                    ? "bg-card text-foreground font-medium"
                    : "text-muted-foreground hover:text-foreground hover:bg-card/50"
                )}
              >
                <Icon size={15} className="shrink-0" />
                {label}
              </div>
            )}
          </NavLink>
        ))}
      </div>

      {/* Lower scrollable section */}
      <div className="flex-1 overflow-y-auto pt-3 space-y-1 border-t border-border">
        {/* Starred — only shown when there are starred projects */}
        {starredProjects.length > 0 && (
          <CollapsibleSection title="Starred" defaultOpen={true}>
            <div className="space-y-0.5 px-1">
              {starredProjects.map((p) => (
                <NavLink key={p.id} to={`/projects/${p.id}`} className="block">
                  {({ isActive }) => (
                    <div
                      className={cn(
                        "flex items-center gap-2 px-3 py-[6px] rounded-md text-[13px] transition-colors",
                        isActive
                          ? "bg-card text-foreground"
                          : "text-muted-foreground hover:text-foreground hover:bg-card/50"
                      )}
                    >
                      <Star size={13} className="shrink-0 fill-warning text-warning" />
                      <span className="truncate">{p.name}</span>
                    </div>
                  )}
                </NavLink>
              ))}
            </div>
          </CollapsibleSection>
        )}

        {/* Recent — only shown when there are projects */}
        {recentProjects.length > 0 && (
          <CollapsibleSection title="Recent" defaultOpen={true}>
            <div className="space-y-0.5 px-1">
              {recentProjects.map((p) => (
                <NavLink key={p.id} to={`/projects/${p.id}`} className="block">
                  {({ isActive }) => (
                    <div
                      className={cn(
                        "flex items-center gap-2 px-3 py-[6px] rounded-md text-[13px] transition-colors",
                        isActive
                          ? "bg-card text-foreground"
                          : "text-muted-foreground hover:text-foreground hover:bg-card/50"
                      )}
                    >
                      <FolderKanban size={13} className="shrink-0 opacity-50" />
                      <span className="truncate">{p.name}</span>
                    </div>
                  )}
                </NavLink>
              ))}
            </div>
          </CollapsibleSection>
        )}
      </div>
    </div>
  );
}
```

Key changes from current Sidebar.tsx:
- Removed `Search` import and the entire search button
- Removed the `isMac` variable and keyboard shortcut hint
- Removed `Favorites` section with dashed empty state
- Added `Starred` section that filters `projects` by `starred` field, hidden when empty
- `Recent` section hidden when empty (no dashed box)
- Both sections use `defaultOpen={true}`

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
git add client/src/components/Sidebar.tsx
git commit -m "feat(sidebar): remove search, add starred section, hide empty sections"
```

---

### Task 5: Playwright E2E Verification

**Files:**
- No new files — uses Playwright MCP tools

- [ ] **Step 1: Restart dev server**

```bash
cd /Users/glebstarcikov/Launchpad && lsof -ti:3001 | xargs kill -9 2>/dev/null; bun run dev &
```

- [ ] **Step 2: Log in and navigate to Dashboard**

Navigate to `http://localhost:3001/login`, log in, verify Dashboard renders.

- [ ] **Step 3: Verify Dashboard layout**

Take screenshot. Verify:
- Full-width layout (no max-width cap, content uses available space)
- Title is `text-lg font-semibold` — "Dashboard" with no subtitle
- Stat cards grid stretches across page
- No cramped upper-left layout

- [ ] **Step 4: Verify Projects page layout + star button**

Navigate to `/projects`. Take screenshot. Verify:
- Full-width layout
- Title "Projects" in `text-lg font-semibold`
- Create a project, verify star icon appears on the card
- Click star — verify it fills yellow

- [ ] **Step 5: Verify sidebar starred section**

After starring a project, check sidebar. Verify:
- "Starred" section appears with the starred project
- Star icon is filled yellow
- "Recent" section shows the project too

- [ ] **Step 6: Verify ProjectDetail star**

Navigate to the project detail page. Verify:
- Star button next to project name in sticky header
- Click star to unstar — verify it becomes outline
- Sidebar "Starred" section disappears when no starred projects

- [ ] **Step 7: Verify Files page layout**

Navigate to `/files`. Take screenshot. Verify:
- Full-width, no max-width, no subtitle
- Title "Files" in `text-lg font-semibold`

- [ ] **Step 8: Verify Ideas page**

Navigate to `/ideas`. Verify:
- Left-pane header shows "Ideas" in `text-lg font-semibold`
- Two-pane layout fills viewport correctly

- [ ] **Step 9: Verify sidebar has no search**

Verify sidebar has no search button or ⌘K hint anywhere.

- [ ] **Step 10: Take final screenshots**

Take screenshots of Dashboard, Projects (with star), and sidebar for visual verification.
