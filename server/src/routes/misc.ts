import { Hono } from "hono";
import { db } from "../db/index.ts";
import { requireAuth } from "../middleware/auth.ts";

const router = new Hono<{ Variables: { userId: string } }>();
router.use("*", requireAuth);

router.get("/dashboard", (c) => {
  const userId = c.get("userId");

  // Total MRR: sum of latest mrr entry per project
  const mrrRow = db.query<{ total: number }, [string]>(`
    SELECT COALESCE(SUM(m.mrr), 0) as total
    FROM mrr_history m
    INNER JOIN (
      SELECT project_id, MAX(recorded_at) as max_at
      FROM mrr_history GROUP BY project_id
    ) latest ON m.project_id = latest.project_id AND m.recorded_at = latest.max_at
    INNER JOIN projects p ON m.project_id = p.id
    WHERE p.user_id = ?
  `).get(userId);

  const projectCount = (db.query<{ n: number }, [string]>(
    "SELECT COUNT(*) as n FROM projects WHERE user_id = ?"
  ).get(userId))?.n ?? 0;

  const ideaCount = (db.query<{ n: number }, [string]>(
    "SELECT COUNT(*) as n FROM ideas WHERE user_id = ? AND status = 'raw'"
  ).get(userId))?.n ?? 0;

  const legalPending = (db.query<{ n: number }, [string]>(`
    SELECT COUNT(*) as n FROM legal_items li
    INNER JOIN projects p ON li.project_id = p.id
    WHERE p.user_id = ? AND li.completed = 0
  `).get(userId))?.n ?? 0;

  const stageDist = db.query<{ stage: string; count: number }, [string]>(
    "SELECT stage, COUNT(*) as count FROM projects WHERE user_id = ? GROUP BY stage"
  ).all(userId);

  const recentProjects = db.query(
    "SELECT * FROM projects WHERE user_id = ? ORDER BY updated_at DESC LIMIT 5"
  ).all(userId);

  const recentIdeas = db.query(
    "SELECT * FROM ideas WHERE user_id = ? AND status = 'raw' ORDER BY created_at DESC LIMIT 5"
  ).all(userId);

  return c.json({
    mrr: mrrRow?.total ?? 0,
    projectCount,
    ideaCount,
    legalPending,
    stageDist,
    recentProjects,
    recentIdeas,
  });
});

router.post("/ping", async (c) => {
  const { url } = await c.req.json();
  if (!url) return c.json({ error: "url required" }, 400);
  const start = Date.now();
  try {
    const res = await fetch(url, { method: "HEAD", signal: AbortSignal.timeout(8000) });
    return c.json({ status: res.ok ? "up" : "down", latencyMs: Date.now() - start });
  } catch {
    return c.json({ status: "down", latencyMs: Date.now() - start });
  }
});

export default router;
