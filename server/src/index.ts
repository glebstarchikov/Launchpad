import { Hono } from "hono";
import { serveStatic } from "hono/bun";
import authRouter from "./routes/auth.ts";
import projectsRouter from "./routes/projects.ts";

// Initialize DB (runs all CREATE TABLE IF NOT EXISTS on import)
import "./db/index.ts";

if (!process.env.JWT_SECRET) {
  console.warn("WARNING: JWT_SECRET is not set. Using insecure default. Set JWT_SECRET before deploying.");
}

const app = new Hono();

// API routes
app.route("/api/auth", authRouter);
app.route("/api/projects", projectsRouter);

// Static files from client/dist
app.use("/*", serveStatic({ root: "./client/dist" }));

// SPA fallback
app.get("/*", serveStatic({ path: "./client/dist/index.html" }));

const port = Number(process.env.PORT ?? 3001);
console.log(`Launchpad running at http://localhost:${port}`);

export default { port, fetch: app.fetch };
