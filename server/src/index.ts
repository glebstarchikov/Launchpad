import { Hono } from "hono";
import { serveStatic } from "hono/bun";
import authRouter from "./routes/auth.ts";
import projectsRouter from "./routes/projects.ts";
import ideasRouter from "./routes/ideas.ts";
import voiceRouter from "./routes/voice.ts";
import miscRouter from "./routes/misc.ts";
import filesRouter from "./routes/files.ts";
import dailySummaryRouter from "./routes/daily-summary.ts";
import newsRouter from "./routes/news.ts";
import githubRouter from "./routes/github.ts";
import mcpRouter from "./routes/mcp.ts";
import { startPolling } from "./lib/telegram.ts";
import { startCron } from "./lib/cron.ts";

// Initialize DB (runs all CREATE TABLE IF NOT EXISTS on import)
import "./db/index.ts";

if (!process.env.JWT_SECRET) {
  console.warn("WARNING: JWT_SECRET is not set. Using insecure default. Set JWT_SECRET before deploying.");
}

const app = new Hono();

// API routes
app.route("/api/auth", authRouter);
app.route("/api/projects", projectsRouter);
app.route("/api/ideas/voice", voiceRouter);
app.route("/api/ideas", ideasRouter);
app.route("/api/files", filesRouter);
app.route("/api/daily-summary", dailySummaryRouter);
app.route("/api/news", newsRouter);
app.route("/api/github", githubRouter);
app.route("/api/mcp", mcpRouter);
app.route("/api", miscRouter);

// Static files: client/public (source assets like favicon) then client/dist (built JS/CSS)
app.use("/*", serveStatic({ root: "./client/public" }));
app.use("/*", serveStatic({ root: "./client/dist" }));

// SPA fallback
app.get("/*", serveStatic({ path: "./client/dist/index.html" }));

const port = Number(process.env.PORT ?? 3001);
console.log(`Launchpad running at http://localhost:${port}`);

export default { port, fetch: app.fetch };

// Start background services (Telegram bot + morning cron)
startPolling();
startCron();
