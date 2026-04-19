import { Hono } from "hono";
import { db } from "../db/index.ts";
import { requireAuth } from "../middleware/auth.ts";
import { getDefaultChecklist } from "../lib/constants.ts";
import { itemsForCountry, itemsForRegion, isEuMember } from "../lib/legal-catalog.ts";
import type { LegalProjectType, LegalCatalogItem } from "../lib/legal-catalog.ts";
import { enrichSeedItems, reviewItems, type ReviewedItem } from "../lib/legal-llm.ts";
import type { Project, ProjectLink, LaunchChecklistItem, TechDebtItem, MrrEntry, Goal, ProjectCountry, LegalItem, Note } from "../types/index.ts";
import { getProjectOverview, projectOverviewToMarkdown } from "../lib/context.ts";


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
  const projectType = (type ?? "for-profit") as "for-profit" | "open-source";
  const insertItem = db.prepare(
    "INSERT INTO launch_checklist (id, project_id, item, completed, category, min_stage, sort_order, priority, created_at) VALUES (?, ?, ?, 0, ?, ?, ?, ?, ?)"
  );
  for (const entry of getDefaultChecklist(projectType)) {
    insertItem.run(crypto.randomUUID(), id, entry.item, entry.category, entry.min_stage, entry.sort_order, entry.priority ?? null, now);
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

// GET /api/projects/:id/overview.md
// Returns a compact LLM-ready markdown snapshot of the project.
router.get("/:id/overview.md", (c) => {
  const userId = c.get("userId");
  const id = c.req.param("id");
  const overview = getProjectOverview(userId, id);
  if (!overview) return c.json({ error: "Project not found" }, 404);
  const md = projectOverviewToMarkdown(overview);
  return new Response(md, {
    status: 200,
    headers: { "content-type": "text/markdown; charset=utf-8" },
  });
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
  const project = db.query<Project, [string, string]>("SELECT * FROM projects WHERE id = ? AND user_id = ?").get(c.req.param("id"), c.get("userId"));
  if (!project) return c.json({ error: "Not found" }, 404);
  return c.json(project);
});

// PUT /api/projects/:id/star — toggle starred
router.put("/:id/star", async (c) => {
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
      "SELECT * FROM launch_checklist WHERE project_id = ? ORDER BY COALESCE(sort_order, 9999), created_at ASC"
    ).all(c.req.param("id"))
  );
});

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

// PUT /api/projects/:id/launch-checklist/:itemId
router.put("/:id/launch-checklist/:itemId", async (c) => {
  if (!ownsProject(c.req.param("id"), c.get("userId"))) {
    return c.json({ error: "Not found" }, 404);
  }
  const { completed, item, category, min_stage, priority } = await c.req.json();
  const sets: string[] = [];
  const params: (string | number | null)[] = [];
  if (completed !== undefined) { sets.push("completed = ?"); params.push(completed ? 1 : 0); }
  if (item !== undefined) { sets.push("item = ?"); params.push(item); }
  if (category !== undefined) { sets.push("category = ?"); params.push(category); }
  if (min_stage !== undefined) { sets.push("min_stage = ?"); params.push(min_stage); }
  if (priority !== undefined) { sets.push("priority = ?"); params.push(priority); }
  if (sets.length === 0) return c.json({ ok: true });
  params.push(c.req.param("itemId"), c.req.param("id"));
  db.run(`UPDATE launch_checklist SET ${sets.join(", ")} WHERE id = ? AND project_id = ?`, params);
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
  const { note, severity, category, effort } = await c.req.json();
  if (!note) return c.json({ error: "note required" }, 400);
  const id = crypto.randomUUID();
  db.run(
    "INSERT INTO tech_debt (id, project_id, note, resolved, severity, category, effort, created_at) VALUES (?, ?, ?, 0, ?, ?, ?, ?)",
    [id, c.req.param("id"), note, severity ?? null, category ?? null, effort ?? null, Date.now()]
  );
  return c.json(db.query<TechDebtItem, [string]>("SELECT * FROM tech_debt WHERE id = ?").get(id), 201);
});

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

// POST /api/projects/:id/countries — auto-seeds rich legal items + LLM-enriched action text
router.post("/:id/countries", async (c) => {
  if (!ownsProject(c.req.param("id"), c.get("userId"))) {
    return c.json({ error: "Not found" }, 404);
  }
  const { country_code, country_name } = await c.req.json();
  if (!country_code || !country_name) return c.json({ error: "country_code and country_name required" }, 400);

  const projectId = c.req.param("id");
  const project = db.query<{ name: string; description: string | null; type: string; stage: string }, [string]>(
    "SELECT name, description, type, stage FROM projects WHERE id = ?"
  ).get(projectId);
  if (!project) return c.json({ error: "Not found" }, 404);

  const projectType: LegalProjectType = project.type === "open-source" ? "open-source" : "for-profit";

  // Insert the country row
  const countryRowId = crypto.randomUUID();
  db.run("INSERT INTO project_countries (id, project_id, country_code, country_name) VALUES (?, ?, ?, ?)",
    [countryRowId, projectId, country_code, country_name]);

  // Build the queue of items to seed
  const queue: { catalogItem: LegalCatalogItem; targetCountryCode: string; scope: "country" | "region"; scopeCode: string | null }[] = [];

  // 1. Items for this specific country
  for (const it of itemsForCountry(country_code, projectType)) {
    queue.push({ catalogItem: it, targetCountryCode: country_code, scope: "country", scopeCode: null });
  }

  // 2. EU auto-attach: if this is an EU member and the project has no existing EU region items, queue them
  if (isEuMember(country_code)) {
    const existingEu = db.query<{ id: string }, [string]>(
      "SELECT id FROM legal_items WHERE project_id = ? AND scope = 'region' AND scope_code = 'eu' LIMIT 1"
    ).get(projectId);
    if (!existingEu) {
      for (const it of itemsForRegion("eu", projectType)) {
        queue.push({ catalogItem: it, targetCountryCode: "", scope: "region", scopeCode: "eu" });
      }
    }
  }

  // 3. Skip items already seeded for this country (idempotent re-add)
  const existingKeys = new Set(
    db.query<{ item: string }, [string, string]>(
      "SELECT item FROM legal_items WHERE project_id = ? AND country_code = ?"
    ).all(projectId, country_code).map(r => r.item)
  );
  const filteredQueue = queue.filter(q => !existingKeys.has(q.catalogItem.item));

  // 4. Run LLM enrichment (5s timeout, falls back to generic actions on failure)
  const enrichments = await enrichSeedItems(
    {
      name: project.name,
      description: project.description,
      type: project.type,
      stage: project.stage,
    },
    filteredQueue.map(q => q.catalogItem)
  );
  const enrichmentByKey = new Map(enrichments.map(e => [e.key, e]));

  // 5. Insert each item with full metadata
  const now = Date.now();
  for (const q of filteredQueue) {
    const enrichment = enrichmentByKey.get(q.catalogItem.key);
    const personalizedAction = enrichment?.personalized_action ?? q.catalogItem.action;
    const featureGateNote = enrichment?.skip_due_to_feature_gate
      ? `Only relevant if your service has ${q.catalogItem.feature_gated} features — review and delete if not applicable`
      : null;

    db.run(
      `INSERT INTO legal_items (id, project_id, country_code, item, completed, created_at,
        priority, category, why, action, resources, scope, scope_code, last_reviewed_at, status_note)
       VALUES (?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        crypto.randomUUID(),
        projectId,
        q.targetCountryCode,
        q.catalogItem.item,
        now,
        q.catalogItem.priority,
        q.catalogItem.category,
        q.catalogItem.why,
        personalizedAction,
        JSON.stringify(q.catalogItem.resources),
        q.scope,
        q.scopeCode,
        now,
        featureGateNote,
      ]
    );
  }

  return c.json(db.query<ProjectCountry, [string]>("SELECT * FROM project_countries WHERE id = ?").get(countryRowId), 201);
});

// DELETE /api/projects/:id/countries/:cId — FK CASCADE removes country-scoped legal_items;
// also cascades EU-region items if no EU members remain.
router.delete("/:id/countries/:cId", (c) => {
  if (!ownsProject(c.req.param("id"), c.get("userId"))) {
    return c.json({ error: "Not found" }, 404);
  }
  const projectId = c.req.param("id");
  const cId = c.req.param("cId");

  // Lookup the country code BEFORE we delete the row
  const country = db.query<{ country_code: string }, [string, string]>(
    "SELECT country_code FROM project_countries WHERE id = ? AND project_id = ?"
  ).get(cId, projectId);

  db.run("DELETE FROM project_countries WHERE id = ? AND project_id = ?", [cId, projectId]);

  // If the removed country was an EU member, check whether any EU members remain.
  // If not, also delete the EU-region legal items.
  if (country && isEuMember(country.country_code)) {
    const remainingEu = db.query<{ country_code: string }, [string]>(
      "SELECT country_code FROM project_countries WHERE project_id = ?"
    ).all(projectId).filter(r => isEuMember(r.country_code));
    if (remainingEu.length === 0) {
      db.run(
        "DELETE FROM legal_items WHERE project_id = ? AND scope = 'region' AND scope_code = 'eu'",
        [projectId]
      );
    }
  }

  return c.json({ ok: true });
});

// GET /api/projects/:id/legal
router.get("/:id/legal", (c) => {
  if (!ownsProject(c.req.param("id"), c.get("userId"))) {
    return c.json({ error: "Not found" }, 404);
  }
  const rows = db.query<LegalItem & { resources: string | null }, [string]>(
    `SELECT * FROM legal_items WHERE project_id = ?
     ORDER BY scope DESC, country_code ASC,
       CASE priority WHEN 'blocker' THEN 1 WHEN 'important' THEN 2 WHEN 'recommended' THEN 3 ELSE 4 END,
       created_at ASC`
  ).all(c.req.param("id"));
  // Parse resources JSON for each row; default to [] for legacy items
  const parsed = rows.map(r => ({
    ...r,
    resources: r.resources ? JSON.parse(r.resources) : [],
  }));
  return c.json(parsed);
});

// POST /api/projects/:id/legal — add custom item (with optional metadata)
router.post("/:id/legal", async (c) => {
  if (!ownsProject(c.req.param("id"), c.get("userId"))) {
    return c.json({ error: "Not found" }, 404);
  }
  const { country_code, item, priority, category, why, action, resources, scope, scope_code } = await c.req.json();
  if (!country_code && !scope_code) return c.json({ error: "country_code or scope_code required" }, 400);
  if (!item) return c.json({ error: "item required" }, 400);
  const id = crypto.randomUUID();
  const now = Date.now();
  db.run(
    `INSERT INTO legal_items (id, project_id, country_code, item, completed, created_at,
      priority, category, why, action, resources, scope, scope_code)
     VALUES (?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      c.req.param("id"),
      country_code ?? "",
      item,
      now,
      priority ?? null,
      category ?? null,
      why ?? null,
      action ?? null,
      JSON.stringify(resources ?? []),
      scope ?? "country",
      scope_code ?? null,
    ]
  );
  const row = db.query<LegalItem & { resources: string | null }, [string]>(
    "SELECT * FROM legal_items WHERE id = ?"
  ).get(id);
  return c.json({ ...row, resources: row?.resources ? JSON.parse(row.resources) : [] }, 201);
});

// PUT /api/projects/:id/legal/:itemId — accepts any subset of editable fields
router.put("/:id/legal/:itemId", async (c) => {
  if (!ownsProject(c.req.param("id"), c.get("userId"))) {
    return c.json({ error: "Not found" }, 404);
  }
  const body = await c.req.json();
  const sets: string[] = [];
  const params: (string | number | null)[] = [];

  if (body.completed !== undefined) { sets.push("completed = ?"); params.push(body.completed ? 1 : 0); }
  if (body.item !== undefined) { sets.push("item = ?"); params.push(body.item); }
  if (body.priority !== undefined) { sets.push("priority = ?"); params.push(body.priority); }
  if (body.category !== undefined) { sets.push("category = ?"); params.push(body.category); }
  if (body.why !== undefined) { sets.push("why = ?"); params.push(body.why); }
  if (body.action !== undefined) { sets.push("action = ?"); params.push(body.action); }
  if (body.resources !== undefined) { sets.push("resources = ?"); params.push(JSON.stringify(body.resources)); }
  if (body.status_note !== undefined) { sets.push("status_note = ?"); params.push(body.status_note); }

  if (sets.length === 0) return c.json({ ok: true });
  params.push(c.req.param("itemId"), c.req.param("id"));
  db.run(
    `UPDATE legal_items SET ${sets.join(", ")} WHERE id = ? AND project_id = ?`,
    params
  );
  return c.json({ ok: true });
});

// POST /api/projects/:id/legal/review — runs LLM freshness review, returns diff
router.post("/:id/legal/review", async (c) => {
  if (!ownsProject(c.req.param("id"), c.get("userId"))) {
    return c.json({ error: "Not found" }, 404);
  }
  const projectId = c.req.param("id");

  const project = db.query<{ name: string; description: string | null; type: string; stage: string }, [string]>(
    "SELECT name, description, type, stage FROM projects WHERE id = ?"
  ).get(projectId);
  if (!project) return c.json({ error: "Not found" }, 404);

  const projectType: LegalProjectType = project.type === "open-source" ? "open-source" : "for-profit";

  // Load current items
  const rows = db.query<{
    id: string;
    country_code: string;
    item: string;
    priority: string | null;
    category: string | null;
    why: string | null;
    action: string | null;
    scope: string;
    scope_code: string | null;
  }, [string]>(
    `SELECT id, country_code, item, priority, category, why, action, scope, scope_code
     FROM legal_items WHERE project_id = ?`
  ).all(projectId);

  const currentItems: ReviewedItem[] = rows.map(r => ({
    id: r.id,
    country_code: r.country_code,
    scope: (r.scope === "region" ? "region" : "country") as "country" | "region",
    scope_code: r.scope_code,
    item: r.item,
    priority: r.priority as any,
    category: r.category as any,
    why: r.why,
    action: r.action,
  }));

  // Build the catalog snapshot for this project's countries + EU if any EU member is present
  const projectCountries = db.query<{ country_code: string }, [string]>(
    "SELECT DISTINCT country_code FROM project_countries WHERE project_id = ?"
  ).all(projectId).map(r => r.country_code);

  const catalogSnapshot: LegalCatalogItem[] = [];
  for (const cc of projectCountries) {
    catalogSnapshot.push(...itemsForCountry(cc, projectType));
  }
  if (projectCountries.some(isEuMember)) {
    catalogSnapshot.push(...itemsForRegion("eu", projectType));
  }

  try {
    const diff = await reviewItems(
      {
        name: project.name,
        description: project.description,
        type: project.type,
        stage: project.stage,
      },
      currentItems,
      catalogSnapshot
    );
    return c.json(diff);
  } catch (err) {
    return c.json(
      { error: "LLM review unavailable", retryable: true, message: (err as Error).message },
      503
    );
  }
});

// POST /api/projects/:id/legal/review/apply — applies an accepted diff in one transaction
router.post("/:id/legal/review/apply", async (c) => {
  if (!ownsProject(c.req.param("id"), c.get("userId"))) {
    return c.json({ error: "Not found" }, 404);
  }
  const projectId = c.req.param("id");
  const body = await c.req.json();

  const stale: { id: string; status_note: string }[] = Array.isArray(body.stale) ? body.stale : [];
  const rename: { id: string; new_item: string }[] = Array.isArray(body.rename) ? body.rename : [];
  const missing: any[] = Array.isArray(body.missing) ? body.missing : [];
  const removed: string[] = Array.isArray(body.removed) ? body.removed : [];

  const now = Date.now();
  let applied = 0;

  // bun:sqlite supports synchronous transactions via db.transaction(...)
  const tx = db.transaction(() => {
    for (const s of stale) {
      if (typeof s.id !== "string" || typeof s.status_note !== "string") continue;
      db.run(
        "UPDATE legal_items SET status_note = ?, last_reviewed_at = ? WHERE id = ? AND project_id = ?",
        [s.status_note, now, s.id, projectId]
      );
      applied++;
    }
    for (const r of rename) {
      if (typeof r.id !== "string" || typeof r.new_item !== "string") continue;
      db.run(
        "UPDATE legal_items SET item = ?, last_reviewed_at = ? WHERE id = ? AND project_id = ?",
        [r.new_item, now, r.id, projectId]
      );
      applied++;
    }
    for (const m of missing) {
      if (typeof m.item !== "string" || typeof m.country_code !== "string") continue;
      db.run(
        `INSERT INTO legal_items (id, project_id, country_code, item, completed, created_at,
          priority, category, why, action, resources, scope, scope_code, last_reviewed_at, status_note)
         VALUES (?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
        [
          crypto.randomUUID(),
          projectId,
          m.country_code,
          m.item,
          now,
          m.priority ?? null,
          m.category ?? null,
          m.why ?? null,
          m.action ?? null,
          JSON.stringify(m.resources ?? []),
          m.scope ?? "country",
          m.scope_code ?? null,
          now,
        ]
      );
      applied++;
    }
    for (const id of removed) {
      if (typeof id !== "string") continue;
      db.run("DELETE FROM legal_items WHERE id = ? AND project_id = ?", [id, projectId]);
      applied++;
    }
  });
  tx();

  return c.json({ applied });
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
