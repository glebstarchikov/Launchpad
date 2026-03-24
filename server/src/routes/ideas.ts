import { Hono } from "hono";
import { db } from "../db/index.ts";
import { requireAuth } from "../middleware/auth.ts";
import type { Idea, Project } from "../types/index.ts";

const DEFAULT_CHECKLIST = [
  "Custom domain connected", "SSL certificate active", "Privacy Policy published",
  "Terms of Service published", "OG meta tags set", "Favicon uploaded",
  "Analytics wired up", "Error tracking connected", "Payment flow tested end-to-end",
  "Email transactional flow tested", "Mobile responsiveness checked",
  "Lighthouse score > 80", "404 page exists", "Uptime monitor set",
  "Backup strategy in place",
];

const router = new Hono<{ Variables: { userId: string } }>();
router.use("*", requireAuth);

router.get("/", (c) => {
  return c.json(
    db.query<Idea, [string]>("SELECT * FROM ideas WHERE user_id = ? ORDER BY created_at DESC")
      .all(c.get("userId"))
  );
});

router.post("/", async (c) => {
  const { title, body } = await c.req.json();
  if (!title) return c.json({ error: "title required" }, 400);
  const id = crypto.randomUUID();
  const now = Date.now();
  db.run(
    "INSERT INTO ideas (id, user_id, title, body, status, promoted_to_project_id, created_at, updated_at) VALUES (?, ?, ?, ?, 'raw', null, ?, ?)",
    [id, c.get("userId"), title, body ?? "", now, now]
  );
  return c.json(db.query<Idea, [string]>("SELECT * FROM ideas WHERE id = ?").get(id), 201);
});

router.put("/:id", async (c) => {
  const { title, body } = await c.req.json();
  const now = Date.now();
  db.run("UPDATE ideas SET title=?, body=?, updated_at=? WHERE id=? AND user_id=?",
    [title, body ?? "", now, c.req.param("id"), c.get("userId")]);
  return c.json(db.query<Idea, [string]>("SELECT * FROM ideas WHERE id = ?").get(c.req.param("id")));
});

router.delete("/:id", (c) => {
  db.run("DELETE FROM ideas WHERE id = ? AND user_id = ?", [c.req.param("id"), c.get("userId")]);
  return c.json({ ok: true });
});

// Promote idea -> creates a new project from it
router.post("/:id/promote", async (c) => {
  const idea = db.query<Idea, [string, string]>(
    "SELECT * FROM ideas WHERE id = ? AND user_id = ?"
  ).get(c.req.param("id"), c.get("userId"));
  if (!idea) return c.json({ error: "Not found" }, 404);
  if (idea.status === "promoted") return c.json({ error: "Already promoted" }, 409);

  const projectId = crypto.randomUUID();
  const now = Date.now();
  db.run(
    `INSERT INTO projects (id, user_id, name, description, url, type, stage, tech_stack, created_at, updated_at)
     VALUES (?, ?, ?, ?, null, 'for-profit', 'idea', '[]', ?, ?)`,
    [projectId, c.get("userId"), idea.title, idea.body, now, now]
  );

  // Seed default checklist for new project
  const insertItem = db.prepare(
    "INSERT INTO launch_checklist (id, project_id, item, completed, created_at) VALUES (?, ?, ?, 0, ?)"
  );
  for (const item of DEFAULT_CHECKLIST) {
    insertItem.run(crypto.randomUUID(), projectId, item, now);
  }

  db.run("UPDATE ideas SET status='promoted', promoted_to_project_id=?, updated_at=? WHERE id=?",
    [projectId, now, idea.id]);

  const project = db.query<Project, [string]>("SELECT * FROM projects WHERE id = ?").get(projectId);
  return c.json({ idea: db.query("SELECT * FROM ideas WHERE id = ?").get(idea.id), project }, 201);
});

export default router;
