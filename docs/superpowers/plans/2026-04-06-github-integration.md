# GitHub Integration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Connect GitHub repos to projects via a personal access token, pull recent commits/PRs/issues into ProjectDetail, feed commit activity into the daily summary, and show a "GitHub Activity" widget on the Dashboard.

**Architecture:** PAT stored in .env (`GITHUB_PAT`). A new `github_repo` column on `projects` stores the repo slug (`owner/repo`). A server-side GitHub client (`server/src/lib/github.ts`) wraps the GitHub REST API. A new "GitHub" tab on ProjectDetail shows commits, PRs, and issues. The daily summary activity collector includes GitHub data. Dashboard gets a "Recent Commits" widget.

**Tech Stack:** GitHub REST API (no library — raw fetch with PAT auth), Bun + Hono (server), React 18 + React Query 5 (client)

---

## File Structure

| Action | Path | Responsibility |
|--------|------|---------------|
| Create | `server/src/lib/github.ts` | GitHub API client: fetch commits, PRs, issues |
| Create | `server/src/routes/github.ts` | API routes: get repo data for a project |
| Modify | `server/src/index.ts` | Mount github router |
| Modify | `server/src/db/index.ts` | Add `github_repo` column to projects |
| Modify | `server/src/routes/daily-summary.ts` | Include GitHub commits in activity collection |
| Modify | `client/src/lib/types.ts` | Add GitHub types, update Project interface |
| Modify | `client/src/lib/api.ts` | Add github API namespace |
| Modify | `client/src/pages/ProjectDetail.tsx` | Add GitHub tab, repo settings |
| Modify | `client/src/pages/Dashboard.tsx` | Add "Recent Commits" widget |
| Modify | `.env.example` | Add GITHUB_PAT |

---

### Task 1: GitHub API Client + Database Column

**Files:**
- Create: `server/src/lib/github.ts`
- Modify: `server/src/db/index.ts`
- Modify: `.env.example`

- [ ] **Step 1: Create the GitHub client**

Create `server/src/lib/github.ts`:

```typescript
const GITHUB_PAT = process.env.GITHUB_PAT ?? "";
const API_BASE = "https://api.github.com";

interface GitHubCommit {
  sha: string;
  message: string;
  author: string;
  date: string;
  url: string;
}

interface GitHubPR {
  number: number;
  title: string;
  state: string;
  author: string;
  created_at: string;
  url: string;
}

interface GitHubIssue {
  number: number;
  title: string;
  state: string;
  labels: string[];
  created_at: string;
  url: string;
}

async function ghFetch(path: string) {
  if (!GITHUB_PAT) throw new Error("GITHUB_PAT not set");
  const res = await fetch(`${API_BASE}${path}`, {
    headers: {
      Authorization: `Bearer ${GITHUB_PAT}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`GitHub API error (${res.status}): ${body.slice(0, 200)}`);
  }
  return res.json();
}

export async function getCommits(repo: string, since?: string): Promise<GitHubCommit[]> {
  const params = new URLSearchParams({ per_page: "10" });
  if (since) params.set("since", since);
  const data = await ghFetch(`/repos/${repo}/commits?${params}`);
  return data.map((c: any) => ({
    sha: c.sha.slice(0, 7),
    message: c.commit.message.split("\n")[0],
    author: c.commit.author?.name ?? c.author?.login ?? "unknown",
    date: c.commit.author?.date ?? "",
    url: c.html_url,
  }));
}

export async function getPRs(repo: string): Promise<GitHubPR[]> {
  const data = await ghFetch(`/repos/${repo}/pulls?state=all&per_page=10&sort=updated&direction=desc`);
  return data.map((pr: any) => ({
    number: pr.number,
    title: pr.title,
    state: pr.state,
    author: pr.user?.login ?? "unknown",
    created_at: pr.created_at,
    url: pr.html_url,
  }));
}

export async function getIssues(repo: string): Promise<GitHubIssue[]> {
  const data = await ghFetch(`/repos/${repo}/issues?state=all&per_page=10&sort=updated&direction=desc`);
  return data
    .filter((i: any) => !i.pull_request) // exclude PRs from issues
    .map((i: any) => ({
      number: i.number,
      title: i.title,
      state: i.state,
      labels: (i.labels ?? []).map((l: any) => l.name),
      created_at: i.created_at,
      url: i.html_url,
    }));
}

export async function isGitHubAvailable(): Promise<{ available: boolean; error?: string }> {
  if (!GITHUB_PAT) return { available: false, error: "GITHUB_PAT not set" };
  try {
    await ghFetch("/user");
    return { available: true };
  } catch (e: any) {
    return { available: false, error: e.message };
  }
}

export { type GitHubCommit, type GitHubPR, type GitHubIssue };
```

- [ ] **Step 2: Add github_repo column to projects**

In `server/src/db/index.ts`, after the existing `ALTER TABLE projects ADD COLUMN starred` line (around line 32), add:

```typescript
try { db.run(`ALTER TABLE projects ADD COLUMN github_repo TEXT`); } catch {}
```

- [ ] **Step 3: Update .env.example**

Add to `.env.example`:

```
# GitHub Integration (optional — personal access token)
# GITHUB_PAT=ghp_your_token_here
```

- [ ] **Step 4: Commit**

```bash
git add server/src/lib/github.ts server/src/db/index.ts .env.example
git commit -m "feat: add GitHub API client and github_repo column"
```

---

### Task 2: GitHub API Routes

**Files:**
- Create: `server/src/routes/github.ts`
- Modify: `server/src/index.ts`

- [ ] **Step 1: Create the github routes**

Create `server/src/routes/github.ts`:

```typescript
import { Hono } from "hono";
import { db } from "../db/index.ts";
import { requireAuth } from "../middleware/auth.ts";
import { getCommits, getPRs, getIssues, isGitHubAvailable } from "../lib/github.ts";

const router = new Hono<{ Variables: { userId: string } }>();
router.use("*", requireAuth);

function ownsProject(projectId: string, userId: string): boolean {
  const row = db.query<{ id: string }, [string, string]>(
    "SELECT id FROM projects WHERE id = ? AND user_id = ?"
  ).get(projectId, userId);
  return !!row;
}

// PUT /api/projects/:id/github — set github_repo for a project
router.put("/:id/github", async (c) => {
  const id = c.req.param("id");
  const userId = c.get("userId");
  if (!ownsProject(id, userId)) return c.json({ error: "Not found" }, 404);

  const { github_repo } = await c.req.json();
  db.run("UPDATE projects SET github_repo = ?, updated_at = ? WHERE id = ?", [github_repo ?? null, Date.now(), id]);
  const project = db.query("SELECT * FROM projects WHERE id = ?").get(id);
  return c.json(project);
});

// GET /api/projects/:id/github — get GitHub data for a project
router.get("/:id/github", async (c) => {
  const id = c.req.param("id");
  const userId = c.get("userId");
  if (!ownsProject(id, userId)) return c.json({ error: "Not found" }, 404);

  const project = db.query<{ github_repo: string | null }, [string]>(
    "SELECT github_repo FROM projects WHERE id = ?"
  ).get(id);

  if (!project?.github_repo) {
    return c.json({ connected: false, repo: null, commits: [], prs: [], issues: [] });
  }

  const repo = project.github_repo;

  try {
    const [commits, prs, issues] = await Promise.all([
      getCommits(repo),
      getPRs(repo),
      getIssues(repo),
    ]);
    return c.json({ connected: true, repo, commits, prs, issues });
  } catch (e: any) {
    return c.json({ connected: true, repo, error: e.message, commits: [], prs: [], issues: [] });
  }
});

// GET /api/github/activity — recent commits across all connected projects (for dashboard)
router.get("/activity", async (c) => {
  const userId = c.get("userId");
  const projects = db.query<{ id: string; name: string; github_repo: string }, [string]>(
    "SELECT id, name, github_repo FROM projects WHERE user_id = ? AND github_repo IS NOT NULL"
  ).all(userId);

  const today = new Date().toISOString().split("T")[0] + "T00:00:00Z";
  const allCommits: Array<{ project: string; sha: string; message: string; author: string; date: string; url: string }> = [];

  for (const p of projects) {
    try {
      const commits = await getCommits(p.github_repo, today);
      for (const c of commits) {
        allCommits.push({ project: p.name, ...c });
      }
    } catch {}
  }

  allCommits.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  return c.json(allCommits.slice(0, 20));
});

export default router;
```

- [ ] **Step 2: Mount the router**

In `server/src/index.ts`, add the import:

```typescript
import githubRouter from "./routes/github.ts";
```

Add BEFORE `app.route("/api/projects", projectsRouter)`:

```typescript
app.route("/api/github", githubRouter);
```

And add the project-specific github routes on the projects path. Actually, since the github routes use `/:id/github` pattern and the projects router also uses `/:id/*`, we need to mount the project-specific routes differently. Instead, let's keep everything under `/api/github` and use query params or path structure:

The routes are:
- `PUT /api/github/:id` — set repo (project ID in path)
- `GET /api/github/:id` — get repo data (project ID in path)
- `GET /api/github/activity` — dashboard activity

**IMPORTANT:** Mount `GET /activity` BEFORE `GET /:id` to avoid "activity" being matched as a project ID. The router already handles this since `/activity` is a specific path matched before the `:id` param. But to be safe, define the `/activity` route first in the file. Check the file — it's already defined last. Move it above the `GET /:id/github` route.

Actually, looking at the code again — the routes are `PUT /:id/github`, `GET /:id/github`, and `GET /activity`. In Hono, `GET /activity` won't conflict with `GET /:id/github` because `/activity` doesn't have `/github` suffix. These are fine as-is.

- [ ] **Step 3: Commit**

```bash
git add server/src/routes/github.ts server/src/index.ts
git commit -m "feat: add GitHub API routes (repo data, activity feed)"
```

---

### Task 3: Client Types and API

**Files:**
- Modify: `client/src/lib/types.ts`
- Modify: `client/src/lib/api.ts`

- [ ] **Step 1: Add types**

In `client/src/lib/types.ts`, update the `Project` interface to add `github_repo`:

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
  github_repo: string | null;
}
```

Add at the end of the file:

```typescript
export interface GitHubCommit {
  sha: string;
  message: string;
  author: string;
  date: string;
  url: string;
}

export interface GitHubPR {
  number: number;
  title: string;
  state: string;
  author: string;
  created_at: string;
  url: string;
}

export interface GitHubIssue {
  number: number;
  title: string;
  state: string;
  labels: string[];
  created_at: string;
  url: string;
}

export interface GitHubRepoData {
  connected: boolean;
  repo: string | null;
  commits: GitHubCommit[];
  prs: GitHubPR[];
  issues: GitHubIssue[];
  error?: string;
}

export interface GitHubActivity {
  project: string;
  sha: string;
  message: string;
  author: string;
  date: string;
  url: string;
}
```

- [ ] **Step 2: Add API methods**

In `client/src/lib/api.ts`, update imports to include new types:

```typescript
import type { ..., GitHubRepoData, GitHubActivity } from "./types";
```

Add a `github` namespace inside the `api` object, after the `news` namespace:

```typescript
  github: {
    getRepoData: (projectId: string) =>
      req<GitHubRepoData>(`/github/${projectId}`),
    setRepo: (projectId: string, github_repo: string | null) =>
      req<Project>(`/github/${projectId}`, { method: "PUT", body: JSON.stringify({ github_repo }) }),
    activity: () =>
      req<GitHubActivity[]>("/github/activity"),
  },
```

- [ ] **Step 3: Build and verify**

```bash
cd /Users/glebstarcikov/Launchpad && bun build client/src/main.tsx --outdir client/dist --target browser 2>&1 | tail -5
```

- [ ] **Step 4: Commit**

```bash
git add client/src/lib/types.ts client/src/lib/api.ts
git commit -m "feat: add GitHub types and API client"
```

---

### Task 4: GitHub Tab on ProjectDetail

**Files:**
- Modify: `client/src/pages/ProjectDetail.tsx`

- [ ] **Step 1: Add GitHub tab**

In `client/src/pages/ProjectDetail.tsx`:

**Add imports** — add `Github, GitCommit, GitPullRequest, CircleDot` to the lucide-react imports. Add `Input` if not already imported.

**Add GitHub data query** — inside the component, before the early returns, add:

```typescript
  const { data: githubData } = useQuery({
    queryKey: ["github", id],
    queryFn: () => api.github.getRepoData(id!),
    enabled: !!id,
  });
```

**Add to TABS array** — add a "GitHub" tab:

```typescript
  const TABS = [
    { value: "overview", label: "Overview" },
    { value: "health", label: "Health" },
    ...(project.type === "for-profit" ? [{ value: "revenue", label: "Revenue" }] : []),
    { value: "compliance", label: "Compliance" },
    { value: "buildlog", label: "Build Log" },
    { value: "github", label: "GitHub" },
    { value: "files", label: "Files" },
  ];
```

**Add GitHubTab component** — add a new component at the bottom of the file (or inline in the TabsContent):

```tsx
function GitHubTab({ projectId, githubData }: { projectId: string; githubData: GitHubRepoData | undefined }) {
  const queryClient = useQueryClient();
  const [repoInput, setRepoInput] = useState(githubData?.repo ?? "");

  const setRepo = useMutation({
    mutationFn: (repo: string) => api.github.setRepo(projectId, repo || null),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["github", projectId] });
      queryClient.invalidateQueries({ queryKey: ["projects", projectId] });
    },
  });

  if (!githubData?.connected) {
    return (
      <div className="space-y-4">
        <div>
          <h3 className="text-sm font-medium mb-2">Connect GitHub Repository</h3>
          <div className="flex gap-2">
            <Input
              value={repoInput}
              onChange={(e) => setRepoInput(e.target.value)}
              placeholder="owner/repo"
              className="max-w-xs"
            />
            <Button
              size="sm"
              onClick={() => setRepo.mutate(repoInput)}
              disabled={!repoInput.trim() || setRepo.isPending}
            >
              Connect
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-1">Enter the GitHub repo slug, e.g. "myuser/myproject"</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Github size={14} />
          <a href={`https://github.com/${githubData.repo}`} target="_blank" rel="noopener noreferrer" className="hover:text-foreground transition-colors">
            {githubData.repo}
          </a>
        </div>
        <Button variant="ghost" size="sm" onClick={() => setRepo.mutate("")} className="text-xs text-muted-foreground">
          Disconnect
        </Button>
      </div>

      {githubData.error && (
        <p className="text-xs text-destructive">{githubData.error}</p>
      )}

      {/* Recent Commits */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <GitCommit size={14} />
            Recent Commits
          </CardTitle>
        </CardHeader>
        <CardContent>
          {githubData.commits.length === 0 ? (
            <p className="text-xs text-muted-foreground">No recent commits.</p>
          ) : (
            <div className="space-y-2">
              {githubData.commits.map((c) => (
                <div key={c.sha} className="flex items-start gap-2">
                  <code className="text-[11px] text-muted-foreground font-mono shrink-0">{c.sha}</code>
                  <a href={c.url} target="_blank" rel="noopener noreferrer" className="text-[13px] hover:text-info transition-colors line-clamp-1 flex-1">
                    {c.message}
                  </a>
                  <span className="text-[11px] text-muted-foreground shrink-0">{c.author}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pull Requests */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <GitPullRequest size={14} />
            Pull Requests
          </CardTitle>
        </CardHeader>
        <CardContent>
          {githubData.prs.length === 0 ? (
            <p className="text-xs text-muted-foreground">No pull requests.</p>
          ) : (
            <div className="space-y-2">
              {githubData.prs.map((pr) => (
                <div key={pr.number} className="flex items-center gap-2">
                  <Badge variant="outline" className={cn("text-[10px]", pr.state === "open" ? "border-success/30 text-success" : "border-purple/30 text-purple")}>
                    {pr.state}
                  </Badge>
                  <a href={pr.url} target="_blank" rel="noopener noreferrer" className="text-[13px] hover:text-info transition-colors line-clamp-1 flex-1">
                    #{pr.number} {pr.title}
                  </a>
                  <span className="text-[11px] text-muted-foreground shrink-0">{pr.author}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Issues */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <CircleDot size={14} />
            Issues
          </CardTitle>
        </CardHeader>
        <CardContent>
          {githubData.issues.length === 0 ? (
            <p className="text-xs text-muted-foreground">No issues.</p>
          ) : (
            <div className="space-y-2">
              {githubData.issues.map((issue) => (
                <div key={issue.number} className="flex items-center gap-2">
                  <Badge variant="outline" className={cn("text-[10px]", issue.state === "open" ? "border-success/30 text-success" : "border-muted-foreground/30")}>
                    {issue.state}
                  </Badge>
                  <a href={issue.url} target="_blank" rel="noopener noreferrer" className="text-[13px] hover:text-info transition-colors line-clamp-1 flex-1">
                    #{issue.number} {issue.title}
                  </a>
                  {issue.labels.map((l) => (
                    <Badge key={l} variant="outline" className="text-[9px] px-1">{l}</Badge>
                  ))}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
```

**Add the TabsContent** — find where other TabsContent blocks are rendered and add:

```tsx
          <TabsContent value="github" className="mt-0">
            <GitHubTab projectId={id!} githubData={githubData} />
          </TabsContent>
```

**Note:** The `GitHubTab` component uses `useState`, `useMutation`, `useQueryClient`, `Card`, `CardHeader`, `CardTitle`, `CardContent`, `Button`, `Input`, `Badge`, `cn`, and lucide icons — most of these are already imported in ProjectDetail.tsx. Add any missing imports. Import the `GitHubRepoData` type from `@/lib/types`.

- [ ] **Step 2: Build and verify**

```bash
cd /Users/glebstarcikov/Launchpad && bun build client/src/main.tsx --outdir client/dist --target browser 2>&1 | tail -5
```

- [ ] **Step 3: Commit**

```bash
git add client/src/pages/ProjectDetail.tsx
git commit -m "feat: add GitHub tab to ProjectDetail (commits, PRs, issues, connect/disconnect)"
```

---

### Task 5: Dashboard GitHub Activity Widget

**Files:**
- Modify: `client/src/pages/Dashboard.tsx`

- [ ] **Step 1: Add GitHub activity widget**

In `client/src/pages/Dashboard.tsx`:

**Add imports** — add `GitCommit` to lucide-react imports.

**Add query** — with the other hooks (before early returns):

```typescript
  const { data: githubActivity } = useQuery({
    queryKey: ["github", "activity"],
    queryFn: api.github.activity,
    staleTime: 60_000,
  });
```

**Add widget** — after the Pipeline/Recent Projects grid, before Idea Inbox:

```tsx
      {/* GitHub Activity */}
      {githubActivity && githubActivity.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <GitCommit size={14} className="text-foreground" />
                Today's Commits
              </CardTitle>
              <span className="text-[11px] font-mono text-muted-foreground tabular-nums">{githubActivity.length}</span>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {githubActivity.slice(0, 8).map((c) => (
                <div key={c.sha} className="flex items-start gap-2">
                  <code className="text-[11px] text-muted-foreground font-mono shrink-0">{c.sha}</code>
                  <a href={c.url} target="_blank" rel="noopener noreferrer" className="text-[13px] hover:text-info transition-colors line-clamp-1 flex-1">
                    {c.message}
                  </a>
                  <span className="text-[11px] text-muted-foreground shrink-0">{c.project}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
```

- [ ] **Step 2: Build and verify**

```bash
cd /Users/glebstarcikov/Launchpad && bun build client/src/main.tsx --outdir client/dist --target browser 2>&1 | tail -5
```

- [ ] **Step 3: Commit**

```bash
git add client/src/pages/Dashboard.tsx
git commit -m "feat: add Today's Commits GitHub widget to Dashboard"
```

---

### Task 6: Feed GitHub into Daily Summary

**Files:**
- Modify: `server/src/routes/daily-summary.ts`

- [ ] **Step 1: Add GitHub data to activity collection**

In `server/src/routes/daily-summary.ts`, add the import:

```typescript
import { getCommits } from "../lib/github.ts";
```

In the `collectActivity` function, after the `mrrEntries` query, add:

```typescript
  // GitHub commits (if any projects have repos connected)
  const projectsWithGH = db.query<{ name: string; github_repo: string }, [string]>(
    "SELECT name, github_repo FROM projects WHERE user_id = ? AND github_repo IS NOT NULL"
  ).all(userId);

  const githubCommits: Array<{ project: string; message: string; author: string }> = [];
  for (const p of projectsWithGH) {
    try {
      const commits = await getCommits(p.github_repo, `${dateStr}T00:00:00Z`);
      for (const c of commits) {
        githubCommits.push({ project: p.name, message: c.message, author: c.author });
      }
    } catch {}
  }
```

Update the return to include `githubCommits`:

```typescript
  return { projectsUpdated, checklistCompleted, techDebtResolved, notesAdded, ideasCreated, ideasPromoted, goalsProgress, mrrEntries, githubCommits };
```

**NOTE:** The `collectActivity` function is currently synchronous (all db queries). Adding GitHub API calls makes it async. Change the function signature from `function collectActivity(...)` to `async function collectActivity(...)` and update the call site in the `/generate` route to `await collectActivity(...)`.

In the `buildPrompt` function, add a section for GitHub commits:

```typescript
  if (activity.githubCommits.length > 0)
    sections.push(`GitHub commits: ${activity.githubCommits.map(c => `${c.message} (${c.project}, by ${c.author})`).join("; ")}`);
```

- [ ] **Step 2: Commit**

```bash
git add server/src/routes/daily-summary.ts
git commit -m "feat: include GitHub commits in daily summary activity"
```

---

### Task 7: Playwright E2E Verification

- [ ] **Step 1:** Restart server, navigate to a project, verify GitHub tab appears
- [ ] **Step 2:** Enter a repo slug (e.g., your own repo), click Connect, verify commits/PRs/issues load
- [ ] **Step 3:** Verify Dashboard shows "Today's Commits" widget (if there are commits today)
- [ ] **Step 4:** Take screenshots
