import { Hono } from "hono";
import { db } from "../db/index.ts";
import { requireAuth } from "../middleware/auth.ts";
import type { Project, ProjectLink, LaunchChecklistItem } from "../types/index.ts";

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

// GET /api/projects
router.get("/", (c) => {
  const projects = db.query<Project, [string]>(
    "SELECT * FROM projects WHERE user_id = ? ORDER BY created_at DESC"
  ).all(c.get("userId"));
  return c.json(projects);
});

// POST /api/projects — inserts project + seeds launch_checklist with 15 default items
router.post("/", async (c) => {
  const { name, description, url, type, stage, tech_stack } = await c.req.json();
  if (!name) return c.json({ error: "name required" }, 400);
  const now = Date.now();
  const id = crypto.randomUUID();
  db.run(
    `INSERT INTO projects (id, user_id, name, description, url, type, stage, tech_stack, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, c.get("userId"), name, description ?? null, url ?? null,
     type ?? "for-profit", stage ?? "idea",
     JSON.stringify(tech_stack ?? []), now, now]
  );
  const insertItem = db.prepare(
    "INSERT INTO launch_checklist (id, project_id, item, completed, created_at) VALUES (?, ?, ?, 0, ?)"
  );
  for (const item of DEFAULT_CHECKLIST) {
    insertItem.run(crypto.randomUUID(), id, item, now);
  }
  const project = db.query<Project, [string]>("SELECT * FROM projects WHERE id = ?").get(id);
  return c.json(project, 201);
});

// GET /api/projects/:id
router.get("/:id", (c) => {
  const project = db.query<Project, [string, string]>(
    "SELECT * FROM projects WHERE id = ? AND user_id = ?"
  ).get(c.req.param("id"), c.get("userId"));
  if (!project) return c.json({ error: "Not found" }, 404);
  return c.json(project);
});

// PUT /api/projects/:id
router.put("/:id", async (c) => {
  const { name, description, url, type, stage, tech_stack, last_deployed } = await c.req.json();
  const now = Date.now();
  db.run(
    `UPDATE projects SET name=?, description=?, url=?, type=?, stage=?, tech_stack=?,
     last_deployed=?, updated_at=? WHERE id=? AND user_id=?`,
    [name, description ?? null, url ?? null, type, stage,
     JSON.stringify(tech_stack ?? []), last_deployed ?? null, now,
     c.req.param("id"), c.get("userId")]
  );
  const project = db.query<Project, [string]>("SELECT * FROM projects WHERE id = ?").get(c.req.param("id"));
  return c.json(project);
});

// DELETE /api/projects/:id
router.delete("/:id", (c) => {
  db.run("DELETE FROM projects WHERE id = ? AND user_id = ?", [c.req.param("id"), c.get("userId")]);
  return c.json({ ok: true });
});

// GET /api/projects/:id/links
router.get("/:id/links", (c) => {
  const links = db.query<ProjectLink, [string]>(
    "SELECT * FROM project_links WHERE project_id = ?"
  ).all(c.req.param("id"));
  return c.json(links);
});

// POST /api/projects/:id/links
router.post("/:id/links", async (c) => {
  const { label, url, icon } = await c.req.json();
  if (!label || !url) return c.json({ error: "label and url required" }, 400);
  const id = crypto.randomUUID();
  db.run("INSERT INTO project_links (id, project_id, label, url, icon) VALUES (?, ?, ?, ?, ?)",
    [id, c.req.param("id"), label, url, icon ?? null]);
  return c.json(db.query<ProjectLink, [string]>("SELECT * FROM project_links WHERE id = ?").get(id), 201);
});

// DELETE /api/projects/:id/links/:linkId
router.delete("/:id/links/:linkId", (c) => {
  db.run("DELETE FROM project_links WHERE id = ? AND project_id = ?",
    [c.req.param("linkId"), c.req.param("id")]);
  return c.json({ ok: true });
});

// GET /api/projects/:id/launch-checklist
router.get("/:id/launch-checklist", (c) => {
  return c.json(
    db.query<LaunchChecklistItem, [string]>(
      "SELECT * FROM launch_checklist WHERE project_id = ? ORDER BY created_at ASC"
    ).all(c.req.param("id"))
  );
});

// POST /api/projects/:id/launch-checklist
router.post("/:id/launch-checklist", async (c) => {
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

// PUT /api/projects/:id/launch-checklist/:itemId
router.put("/:id/launch-checklist/:itemId", async (c) => {
  const { completed } = await c.req.json();
  db.run("UPDATE launch_checklist SET completed = ? WHERE id = ? AND project_id = ?",
    [completed ? 1 : 0, c.req.param("itemId"), c.req.param("id")]);
  return c.json({ ok: true });
});

// DELETE /api/projects/:id/launch-checklist/:itemId
router.delete("/:id/launch-checklist/:itemId", (c) => {
  db.run("DELETE FROM launch_checklist WHERE id = ? AND project_id = ?",
    [c.req.param("itemId"), c.req.param("id")]);
  return c.json({ ok: true });
});

export default router;
