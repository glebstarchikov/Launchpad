import { Hono } from "hono";
import { db } from "../db/index.ts";
import { requireAuth } from "../middleware/auth.ts";
import { join } from "path";
import { mkdir, unlink } from "fs/promises";
import type { FileRecord } from "../types/index.ts";

const UPLOADS_DIR = process.env.UPLOADS_DIR ?? "./uploads";

const router = new Hono<{ Variables: { userId: string } }>();
router.use("*", requireAuth);

// GET /api/files?projectId=
router.get("/", (c) => {
  const projectId = c.req.query("projectId");
  const files = projectId
    ? db
        .query<FileRecord, [string, string]>(
          "SELECT * FROM files WHERE project_id = ? AND user_id = ? ORDER BY uploaded_at DESC"
        )
        .all(projectId, c.get("userId"))
    : db
        .query<FileRecord, [string]>(
          "SELECT * FROM files WHERE user_id = ? ORDER BY uploaded_at DESC"
        )
        .all(c.get("userId"));
  return c.json(files);
});

// POST /api/files?projectId= — multipart upload
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB

router.post("/", async (c) => {
  const projectId = c.req.query("projectId") ?? null;
  const formData = await c.req.formData();
  const file = formData.get("file") as File | null;
  if (!file) return c.json({ error: "file required" }, 400);
  if (file.size > MAX_FILE_SIZE) return c.json({ error: "File too large (max 50 MB)" }, 413);

  await mkdir(UPLOADS_DIR, { recursive: true });

  const safeName = file.name.replace(/[^\w.\-()  ]/g, "_");
  const ext = safeName.split(".").pop() ?? "";
  const filename = `${crypto.randomUUID()}${ext ? `.${ext}` : ""}`;
  const dest = join(UPLOADS_DIR, filename);

  await Bun.write(dest, file);

  const id = crypto.randomUUID();
  db.run(
    "INSERT INTO files (id, project_id, user_id, filename, original_name, mimetype, size, uploaded_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    [id, projectId, c.get("userId"), filename, safeName, file.type, file.size, Date.now()]
  );

  return c.json(
    db.query<FileRecord, [string]>("SELECT * FROM files WHERE id = ?").get(id),
    201
  );
});

// GET /api/files/:id/download
router.get("/:id/download", async (c) => {
  const file = db
    .query<FileRecord, [string, string]>(
      "SELECT * FROM files WHERE id = ? AND user_id = ?"
    )
    .get(c.req.param("id"), c.get("userId"));
  if (!file) return c.json({ error: "Not found" }, 404);

  const path = join(UPLOADS_DIR, file.filename);
  const bunFile = Bun.file(path);
  if (!(await bunFile.exists())) return c.json({ error: "File not found on disk" }, 404);

  const sanitized = file.original_name.replace(/["\\]/g, "_");
  c.header("Content-Disposition", `attachment; filename="${sanitized}"`);
  c.header("Content-Type", file.mimetype || "application/octet-stream");
  return new Response(bunFile);
});

// DELETE /api/files/:id
router.delete("/:id", async (c) => {
  const file = db
    .query<FileRecord, [string, string]>(
      "SELECT * FROM files WHERE id = ? AND user_id = ?"
    )
    .get(c.req.param("id"), c.get("userId"));
  if (!file) return c.json({ error: "Not found" }, 404);

  const path = join(UPLOADS_DIR, file.filename);
  try {
    if (await Bun.file(path).exists()) await unlink(path);
  } catch {
    // If disk file is already gone, still delete DB record
  }

  db.run("DELETE FROM files WHERE id = ? AND user_id = ?", [file.id, c.get("userId")]);
  return c.json({ ok: true });
});

export default router;
