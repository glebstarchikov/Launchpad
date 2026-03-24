import { Hono } from "hono";
import { db } from "../db/index.ts";
import { requireAuth } from "../middleware/auth.ts";
import type { Project, ProjectLink, LaunchChecklistItem, TechDebtItem, MrrEntry, Goal, ProjectCountry, LegalItem, Note } from "../types/index.ts";

const DEFAULT_CHECKLIST = [
  "Custom domain connected", "SSL certificate active", "Privacy Policy published",
  "Terms of Service published", "OG meta tags set", "Favicon uploaded",
  "Analytics wired up", "Error tracking connected", "Payment flow tested end-to-end",
  "Email transactional flow tested", "Mobile responsiveness checked",
  "Lighthouse score > 80", "404 page exists", "Uptime monitor set",
  "Backup strategy in place",
];

const LEGAL_REQUIREMENTS: Record<string, string[]> = {
  EU:  ["GDPR Privacy Policy", "Cookie Consent Banner", "DPA", "Right to Deletion Flow", "Data Breach Protocol", "ROPA"],
  US:  ["Terms of Service", "Privacy Policy (CCPA)", "DMCA Policy", "Accessibility Statement (ADA)"],
  UK:  ["UK GDPR Privacy Policy", "ICO Registration", "Cookie Policy", "Data Retention Policy"],
  CA:  ["PIPEDA Privacy Policy", "Terms of Service", "Cookie Consent"],
  AU:  ["Privacy Act Compliance", "Terms of Service", "Cookie Policy"],
  DE:  ["Impressum", "DSGVO Privacy Policy", "Cookie Consent (ePrivacy)", "DPA"],
  FR:  ["CNIL Compliance", "GDPR Privacy Policy", "Cookie Consent"],
  NL:  ["GDPR Privacy Policy", "AP Registration", "Cookie Consent", "DPA"],
  IN:  ["IT Act Compliance", "Data Protection Policy", "Terms of Service"],
  BR:  ["LGPD Privacy Policy", "Terms of Service", "Cookie Consent"],
  JP:  ["APPI Privacy Policy", "Terms of Service"],
  SG:  ["PDPA Privacy Policy", "Terms of Service", "Data Breach Protocol"],
  RU:  ["Federal Law No. 152-FZ Privacy Policy", "Roskomnadzor Registration", "Data Localization Compliance", "Terms of Service"],
};

function ownsProject(projectId: string, userId: string): boolean {
  return db.query<{ id: string }, [string, string]>(
    "SELECT id FROM projects WHERE id = ? AND user_id = ?"
  ).get(projectId, userId) !== null;
}

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
  if (!project) return c.json({ error: "Not found" }, 404);
  return c.json(project);
});

// DELETE /api/projects/:id
router.delete("/:id", (c) => {
  db.run("DELETE FROM projects WHERE id = ? AND user_id = ?", [c.req.param("id"), c.get("userId")]);
  return c.json({ ok: true });
});

// GET /api/projects/:id/links
router.get("/:id/links", (c) => {
  if (!ownsProject(c.req.param("id"), c.get("userId"))) {
    return c.json({ error: "Not found" }, 404);
  }
  const links = db.query<ProjectLink, [string]>(
    "SELECT * FROM project_links WHERE project_id = ?"
  ).all(c.req.param("id"));
  return c.json(links);
});

// POST /api/projects/:id/links
router.post("/:id/links", async (c) => {
  if (!ownsProject(c.req.param("id"), c.get("userId"))) {
    return c.json({ error: "Not found" }, 404);
  }
  const { label, url, icon } = await c.req.json();
  if (!label || !url) return c.json({ error: "label and url required" }, 400);
  const id = crypto.randomUUID();
  db.run("INSERT INTO project_links (id, project_id, label, url, icon) VALUES (?, ?, ?, ?, ?)",
    [id, c.req.param("id"), label, url, icon ?? null]);
  return c.json(db.query<ProjectLink, [string]>("SELECT * FROM project_links WHERE id = ?").get(id), 201);
});

// DELETE /api/projects/:id/links/:linkId
router.delete("/:id/links/:linkId", (c) => {
  if (!ownsProject(c.req.param("id"), c.get("userId"))) {
    return c.json({ error: "Not found" }, 404);
  }
  db.run("DELETE FROM project_links WHERE id = ? AND project_id = ?",
    [c.req.param("linkId"), c.req.param("id")]);
  return c.json({ ok: true });
});

// GET /api/projects/:id/launch-checklist
router.get("/:id/launch-checklist", (c) => {
  if (!ownsProject(c.req.param("id"), c.get("userId"))) {
    return c.json({ error: "Not found" }, 404);
  }
  return c.json(
    db.query<LaunchChecklistItem, [string]>(
      "SELECT * FROM launch_checklist WHERE project_id = ? ORDER BY created_at ASC"
    ).all(c.req.param("id"))
  );
});

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

// DELETE /api/projects/:id/launch-checklist/:itemId
router.delete("/:id/launch-checklist/:itemId", (c) => {
  if (!ownsProject(c.req.param("id"), c.get("userId"))) {
    return c.json({ error: "Not found" }, 404);
  }
  db.run("DELETE FROM launch_checklist WHERE id = ? AND project_id = ?",
    [c.req.param("itemId"), c.req.param("id")]);
  return c.json({ ok: true });
});

// GET /api/projects/:id/tech-debt
router.get("/:id/tech-debt", (c) => {
  if (!ownsProject(c.req.param("id"), c.get("userId"))) {
    return c.json({ error: "Not found" }, 404);
  }
  return c.json(
    db.query<TechDebtItem, [string]>(
      "SELECT * FROM tech_debt WHERE project_id = ? ORDER BY created_at DESC"
    ).all(c.req.param("id"))
  );
});

// POST /api/projects/:id/tech-debt
router.post("/:id/tech-debt", async (c) => {
  if (!ownsProject(c.req.param("id"), c.get("userId"))) {
    return c.json({ error: "Not found" }, 404);
  }
  const { note } = await c.req.json();
  if (!note) return c.json({ error: "note required" }, 400);
  const id = crypto.randomUUID();
  db.run("INSERT INTO tech_debt (id, project_id, note, resolved, created_at) VALUES (?, ?, ?, 0, ?)",
    [id, c.req.param("id"), note, Date.now()]);
  return c.json(db.query<TechDebtItem, [string]>("SELECT * FROM tech_debt WHERE id = ?").get(id), 201);
});

// PUT /api/projects/:id/tech-debt/:debtId
router.put("/:id/tech-debt/:debtId", async (c) => {
  if (!ownsProject(c.req.param("id"), c.get("userId"))) {
    return c.json({ error: "Not found" }, 404);
  }
  const { resolved } = await c.req.json();
  db.run("UPDATE tech_debt SET resolved = ? WHERE id = ? AND project_id = ?",
    [resolved ? 1 : 0, c.req.param("debtId"), c.req.param("id")]);
  return c.json({ ok: true });
});

// DELETE /api/projects/:id/tech-debt/:debtId
router.delete("/:id/tech-debt/:debtId", (c) => {
  if (!ownsProject(c.req.param("id"), c.get("userId"))) {
    return c.json({ error: "Not found" }, 404);
  }
  db.run("DELETE FROM tech_debt WHERE id = ? AND project_id = ?",
    [c.req.param("debtId"), c.req.param("id")]);
  return c.json({ ok: true });
});

// GET /api/projects/:id/mrr
router.get("/:id/mrr", (c) => {
  if (!ownsProject(c.req.param("id"), c.get("userId"))) {
    return c.json({ error: "Not found" }, 404);
  }
  return c.json(
    db.query<MrrEntry, [string]>(
      "SELECT * FROM mrr_history WHERE project_id = ? ORDER BY recorded_at ASC"
    ).all(c.req.param("id"))
  );
});

// POST /api/projects/:id/mrr
router.post("/:id/mrr", async (c) => {
  if (!ownsProject(c.req.param("id"), c.get("userId"))) {
    return c.json({ error: "Not found" }, 404);
  }
  const { mrr, user_count } = await c.req.json();
  if (typeof mrr !== "number") return c.json({ error: "mrr (number) required" }, 400);
  const id = crypto.randomUUID();
  const now = Date.now();
  db.run(
    "INSERT INTO mrr_history (id, project_id, mrr, user_count, recorded_at) VALUES (?, ?, ?, ?, ?)",
    [id, c.req.param("id"), mrr, user_count ?? 0, now]
  );
  return c.json(
    db.query<MrrEntry, [string]>("SELECT * FROM mrr_history WHERE id = ?").get(id),
    201
  );
});

// GET /api/projects/:id/goals
router.get("/:id/goals", (c) => {
  if (!ownsProject(c.req.param("id"), c.get("userId"))) {
    return c.json({ error: "Not found" }, 404);
  }
  return c.json(
    db.query<Goal, [string]>(
      "SELECT * FROM goals WHERE project_id = ? ORDER BY created_at ASC"
    ).all(c.req.param("id"))
  );
});

// POST /api/projects/:id/goals
router.post("/:id/goals", async (c) => {
  if (!ownsProject(c.req.param("id"), c.get("userId"))) {
    return c.json({ error: "Not found" }, 404);
  }
  const { description, target_value, current_value, unit, target_date } = await c.req.json();
  if (!description || target_value == null) return c.json({ error: "description and target_value required" }, 400);
  const id = crypto.randomUUID();
  db.run(
    "INSERT INTO goals (id, project_id, description, target_value, current_value, unit, target_date, completed, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)",
    [id, c.req.param("id"), description, target_value, current_value ?? 0, unit ?? null, target_date ?? null, Date.now()]
  );
  return c.json(
    db.query<Goal, [string]>("SELECT * FROM goals WHERE id = ?").get(id),
    201
  );
});

// PUT /api/projects/:id/goals/:goalId
router.put("/:id/goals/:goalId", async (c) => {
  if (!ownsProject(c.req.param("id"), c.get("userId"))) {
    return c.json({ error: "Not found" }, 404);
  }
  const { description, target_value, current_value, unit, target_date, completed } = await c.req.json();
  db.run(
    "UPDATE goals SET description=?, target_value=?, current_value=?, unit=?, target_date=?, completed=? WHERE id=? AND project_id=?",
    [description, target_value, current_value, unit ?? null, target_date ?? null,
     completed ? 1 : 0, c.req.param("goalId"), c.req.param("id")]
  );
  return c.json({ ok: true });
});

// DELETE /api/projects/:id/goals/:goalId
router.delete("/:id/goals/:goalId", (c) => {
  if (!ownsProject(c.req.param("id"), c.get("userId"))) {
    return c.json({ error: "Not found" }, 404);
  }
  db.run("DELETE FROM goals WHERE id = ? AND project_id = ?",
    [c.req.param("goalId"), c.req.param("id")]);
  return c.json({ ok: true });
});

// GET /api/projects/:id/countries
router.get("/:id/countries", (c) => {
  if (!ownsProject(c.req.param("id"), c.get("userId"))) {
    return c.json({ error: "Not found" }, 404);
  }
  return c.json(
    db.query<ProjectCountry, [string]>("SELECT * FROM project_countries WHERE project_id = ?").all(c.req.param("id"))
  );
});

// POST /api/projects/:id/countries — auto-seeds legal items
router.post("/:id/countries", async (c) => {
  if (!ownsProject(c.req.param("id"), c.get("userId"))) {
    return c.json({ error: "Not found" }, 404);
  }
  const { country_code, country_name } = await c.req.json();
  if (!country_code || !country_name) return c.json({ error: "country_code and country_name required" }, 400);

  const id = crypto.randomUUID();
  db.run("INSERT INTO project_countries (id, project_id, country_code, country_name) VALUES (?, ?, ?, ?)",
    [id, c.req.param("id"), country_code, country_name]);

  // Seed legal items (skip if already exist for this country)
  const items = LEGAL_REQUIREMENTS[country_code] ?? [];
  const existing = db.query<{ item: string }, [string, string]>(
    "SELECT item FROM legal_items WHERE project_id = ? AND country_code = ?"
  ).all(c.req.param("id"), country_code).map(r => r.item);

  const now = Date.now();
  for (const item of items) {
    if (!existing.includes(item)) {
      db.run("INSERT INTO legal_items (id, project_id, country_code, item, completed, created_at) VALUES (?, ?, ?, ?, 0, ?)",
        [crypto.randomUUID(), c.req.param("id"), country_code, item, now]);
    }
  }

  return c.json(db.query<ProjectCountry, [string]>("SELECT * FROM project_countries WHERE id = ?").get(id), 201);
});

// DELETE /api/projects/:id/countries/:cId — FK CASCADE removes legal_items automatically
router.delete("/:id/countries/:cId", (c) => {
  if (!ownsProject(c.req.param("id"), c.get("userId"))) {
    return c.json({ error: "Not found" }, 404);
  }
  db.run("DELETE FROM project_countries WHERE id = ? AND project_id = ?",
    [c.req.param("cId"), c.req.param("id")]);
  return c.json({ ok: true });
});

// GET /api/projects/:id/legal
router.get("/:id/legal", (c) => {
  if (!ownsProject(c.req.param("id"), c.get("userId"))) {
    return c.json({ error: "Not found" }, 404);
  }
  return c.json(
    db.query<LegalItem, [string]>(
      "SELECT * FROM legal_items WHERE project_id = ? ORDER BY country_code, created_at ASC"
    ).all(c.req.param("id"))
  );
});

// POST /api/projects/:id/legal — add custom item
router.post("/:id/legal", async (c) => {
  if (!ownsProject(c.req.param("id"), c.get("userId"))) {
    return c.json({ error: "Not found" }, 404);
  }
  const { country_code, item } = await c.req.json();
  if (!country_code || !item) return c.json({ error: "country_code and item required" }, 400);
  const id = crypto.randomUUID();
  db.run("INSERT INTO legal_items (id, project_id, country_code, item, completed, created_at) VALUES (?, ?, ?, ?, 0, ?)",
    [id, c.req.param("id"), country_code, item, Date.now()]);
  return c.json(db.query<LegalItem, [string]>("SELECT * FROM legal_items WHERE id = ?").get(id), 201);
});

// PUT /api/projects/:id/legal/:itemId
router.put("/:id/legal/:itemId", async (c) => {
  if (!ownsProject(c.req.param("id"), c.get("userId"))) {
    return c.json({ error: "Not found" }, 404);
  }
  const { completed } = await c.req.json();
  db.run("UPDATE legal_items SET completed = ? WHERE id = ? AND project_id = ?",
    [completed ? 1 : 0, c.req.param("itemId"), c.req.param("id")]);
  return c.json({ ok: true });
});

// DELETE /api/projects/:id/legal/:itemId
router.delete("/:id/legal/:itemId", (c) => {
  if (!ownsProject(c.req.param("id"), c.get("userId"))) {
    return c.json({ error: "Not found" }, 404);
  }
  db.run("DELETE FROM legal_items WHERE id = ? AND project_id = ?",
    [c.req.param("itemId"), c.req.param("id")]);
  return c.json({ ok: true });
});

// GET /api/projects/:id/notes
router.get("/:id/notes", (c) => {
  if (!ownsProject(c.req.param("id"), c.get("userId"))) {
    return c.json({ error: "Not found" }, 404);
  }
  return c.json(
    db.query<Note, [string]>(
      "SELECT * FROM notes WHERE project_id = ? ORDER BY created_at DESC"
    ).all(c.req.param("id"))
  );
});

// POST /api/projects/:id/notes
router.post("/:id/notes", async (c) => {
  if (!ownsProject(c.req.param("id"), c.get("userId"))) {
    return c.json({ error: "Not found" }, 404);
  }
  const { content, is_build_log } = await c.req.json();
  if (!content) return c.json({ error: "content required" }, 400);
  const id = crypto.randomUUID();
  db.run(
    "INSERT INTO notes (id, project_id, content, is_build_log, created_at) VALUES (?, ?, ?, ?, ?)",
    [id, c.req.param("id"), content, is_build_log ? 1 : 0, Date.now()]
  );
  return c.json(
    db.query<Note, [string]>("SELECT * FROM notes WHERE id = ?").get(id),
    201
  );
});

// DELETE /api/projects/:id/notes/:noteId
router.delete("/:id/notes/:noteId", (c) => {
  if (!ownsProject(c.req.param("id"), c.get("userId"))) {
    return c.json({ error: "Not found" }, 404);
  }
  db.run("DELETE FROM notes WHERE id = ? AND project_id = ?",
    [c.req.param("noteId"), c.req.param("id")]);
  return c.json({ ok: true });
});

export default router;
