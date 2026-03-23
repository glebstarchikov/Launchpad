import { Hono } from "hono";
import { SignJWT } from "jose";
import { db } from "../db/index.ts";
import { requireAuth } from "../middleware/auth.ts";
import type { User } from "../types/index.ts";

const router = new Hono<{ Variables: { userId: string } }>();
const secret = new TextEncoder().encode(process.env.JWT_SECRET ?? "dev-secret-change-me");
const THIRTY_DAYS = 60 * 60 * 24 * 30;

router.post("/register", async (c) => {
  const { name, email, password } = await c.req.json();
  if (!name || !email || !password) return c.json({ error: "name, email, password required" }, 400);

  const existing = db.query<User, [string]>("SELECT * FROM users WHERE email = ?").get(email);
  if (existing) return c.json({ error: "Email already registered" }, 409);

  const hash = await Bun.password.hash(password);
  const now = Date.now();
  const id = crypto.randomUUID();
  db.run(
    "INSERT INTO users (id, name, email, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
    [id, name, email, hash, now, now]
  );

  const token = await new SignJWT({ sub: id })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("30d")
    .sign(secret);

  c.header("Set-Cookie", `token=${token}; HttpOnly; SameSite=Lax; Max-Age=${THIRTY_DAYS}; Path=/`);
  return c.json({ id, name, email });
});

router.post("/login", async (c) => {
  const { email, password } = await c.req.json();
  const user = db.query<User, [string]>("SELECT * FROM users WHERE email = ?").get(email);
  if (!user) return c.json({ error: "Invalid credentials" }, 401);

  const valid = await Bun.password.verify(password, user.password_hash);
  if (!valid) return c.json({ error: "Invalid credentials" }, 401);

  const token = await new SignJWT({ sub: user.id })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("30d")
    .sign(secret);

  c.header("Set-Cookie", `token=${token}; HttpOnly; SameSite=Lax; Max-Age=${THIRTY_DAYS}; Path=/`);
  return c.json({ id: user.id, name: user.name, email: user.email });
});

router.post("/logout", (c) => {
  c.header("Set-Cookie", "token=; HttpOnly; SameSite=Lax; Max-Age=0; Path=/");
  return c.json({ ok: true });
});

router.get("/me", requireAuth, (c) => {
  const user = db.query<User, [string]>(
    "SELECT id, name, email, created_at, updated_at FROM users WHERE id = ?"
  ).get(c.get("userId"));
  if (!user) return c.json({ error: "Not found" }, 404);
  return c.json(user);
});

export default router;
