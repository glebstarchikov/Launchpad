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

// GET /api/github/activity — recent commits across all connected projects
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

// PUT /api/github/:id — set github_repo for a project
router.put("/:id", async (c) => {
  const id = c.req.param("id");
  const userId = c.get("userId");
  if (!ownsProject(id, userId)) return c.json({ error: "Not found" }, 404);

  const { github_repo } = await c.req.json();
  db.run("UPDATE projects SET github_repo = ?, updated_at = ? WHERE id = ?", [github_repo ?? null, Date.now(), id]);
  const project = db.query("SELECT * FROM projects WHERE id = ?").get(id);
  return c.json(project);
});

// GET /api/github/:id — get GitHub data for a project
router.get("/:id", async (c) => {
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

export default router;
