# Launchpad Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a self-hosted founder OS — a single-user web app for tracking projects, revenue, compliance, ideas, and files, running as a Docker container on a VPS.

**Architecture:** Bun workspace with `server/` (Hono + bun:sqlite) and `client/` (React 18 + bun build). Single port 3001. Hono serves both API routes and static files from `client/dist/`. No proxy, no Vite, no webpack.

**Tech Stack:** Bun, Hono, bun:sqlite, jose, React 18, react-router-dom v6, @tanstack/react-query v5, Tailwind CSS, shadcn/ui, Recharts, lucide-react

**Spec:** `docs/superpowers/specs/2026-03-23-launchpad-design.md`

---

## File Map

```
launchpad/
├── package.json                          ← Bun workspace root
├── scripts/dev.ts                        ← parallel dev process runner
├── .env.example
├── Dockerfile
├── docker-compose.yml
├── deploy.sh
│
├── server/
│   ├── package.json
│   ├── tsconfig.json
│   └── src/
│       ├── index.ts                      ← Hono app, static serving, SPA fallback
│       ├── db/
│       │   └── index.ts                  ← SQLite init, all 12 CREATE TABLE statements
│       ├── middleware/
│       │   └── auth.ts                   ← requireAuth, JWT verify, c.set("userId")
│       ├── types/
│       │   └── index.ts                  ← ProjectStage, ProjectType, IdeaStatus, DB row types
│       └── routes/
│           ├── auth.ts                   ← register, login, logout, me
│           ├── projects.ts               ← all /api/projects/* routes
│           ├── ideas.ts                  ← all /api/ideas/* routes
│           ├── files.ts                  ← all /api/files/* routes
│           └── misc.ts                   ← dashboard, ping
│
└── client/
    ├── index.html                        ← references /bundle.js and /index.css
    ├── components.json                   ← shadcn config
    ├── tailwind.config.ts
    ├── tsconfig.json
    └── src/
        ├── main.tsx                      ← React root, QueryClientProvider, RouterProvider
        ├── App.tsx                       ← routes, auth gate
        ├── index.css                     ← CSS variables, Tailwind directives, Geist font
        ├── lib/
        │   ├── api.ts                    ← typed fetch wrappers for every endpoint
        │   ├── types.ts                  ← mirror of server/src/types/index.ts
        │   ├── countries.ts              ← country code → name map for Select options
        │   └── utils.ts                  ← cn() helper
        ├── components/
        │   ├── ui/                       ← shadcn generated components (do not edit manually)
        │   ├── Layout.tsx                ← Sidebar + <Outlet />
        │   ├── Sidebar.tsx               ← fixed 240px nav
        │   └── app-ui.tsx                ← StageBadge, TypeBadge, PingDot, Empty, fmt, TagInput
        └── pages/
            ├── Login.tsx
            ├── Dashboard.tsx
            ├── Projects.tsx
            ├── ProjectDetail.tsx         ← shell + 6 tab components inline or as imports
            ├── Ideas.tsx
            └── Files.tsx
```

---

## Task 1: Scaffolding

**Files:**
- Create: `package.json` (workspace root)
- Create: `server/package.json`
- Create: `server/tsconfig.json`
- Create: `client/package.json`
- Create: `client/tsconfig.json`
- Create: `client/tailwind.config.ts`
- Create: `client/components.json`
- Create: `client/index.html`
- Create: `client/src/index.css`
- Create: `client/src/lib/utils.ts`
- Create: `scripts/dev.ts`
- Create: `.env.example`

- [ ] **Step 1: Create workspace root `package.json`**

```json
{
  "name": "launchpad",
  "private": true,
  "workspaces": ["server", "client"],
  "scripts": {
    "dev": "bun scripts/dev.ts",
    "build": "bun build client/src/main.tsx --outdir client/dist --minify && bunx tailwindcss -i client/src/index.css -o client/dist/index.css --minify"
  }
}
```

- [ ] **Step 2: Create `server/package.json`**

```json
{
  "name": "launchpad-server",
  "private": true,
  "scripts": {
    "dev": "bun --hot src/index.ts",
    "start": "bun src/index.ts"
  },
  "dependencies": {
    "hono": "^4.6.0",
    "jose": "^5.9.0"
  }
}
```

- [ ] **Step 3: Create `server/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "skipLibCheck": true,
    "types": ["bun-types"]
  },
  "include": ["src"]
}
```

- [ ] **Step 4: Create `client/package.json`**

```json
{
  "name": "launchpad-client",
  "private": true,
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-router-dom": "^6.28.0",
    "@tanstack/react-query": "^5.62.0",
    "recharts": "^2.13.0",
    "lucide-react": "^0.468.0",
    "geist": "^1.3.1",
    "clsx": "^2.1.1",
    "tailwind-merge": "^2.5.5",
    "class-variance-authority": "^0.7.1",
    "@radix-ui/react-dialog": "^1.1.2",
    "@radix-ui/react-dropdown-menu": "^2.1.2",
    "@radix-ui/react-select": "^2.1.2",
    "@radix-ui/react-separator": "^1.1.0",
    "@radix-ui/react-switch": "^1.1.1",
    "@radix-ui/react-tabs": "^1.1.1",
    "@radix-ui/react-tooltip": "^1.1.4",
    "@radix-ui/react-progress": "^1.1.0",
    "@radix-ui/react-scroll-area": "^1.2.1",
    "@radix-ui/react-avatar": "^1.1.1",
    "@radix-ui/react-checkbox": "^1.1.2",
    "@radix-ui/react-label": "^2.1.0",
    "@radix-ui/react-popover": "^1.1.2",
    "cmdk": "^1.0.4"
  },
  "devDependencies": {
    "@types/react": "^18.3.14",
    "@types/react-dom": "^18.3.5",
    "tailwindcss": "^3.4.0",
    "autoprefixer": "^10.4.0"
  }
}
```

- [ ] **Step 5: Create `client/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "skipLibCheck": true,
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["src"]
}
```

- [ ] **Step 6: Create `client/tailwind.config.ts`**

```typescript
import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: ["./src/**/*.{ts,tsx}", "./index.html"],
  theme: {
    extend: {
      colors: {
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        card: { DEFAULT: "hsl(var(--card))", foreground: "hsl(var(--card-foreground))" },
        popover: { DEFAULT: "hsl(var(--popover))", foreground: "hsl(var(--popover-foreground))" },
        primary: { DEFAULT: "hsl(var(--primary))", foreground: "hsl(var(--primary-foreground))" },
        secondary: { DEFAULT: "hsl(var(--secondary))", foreground: "hsl(var(--secondary-foreground))" },
        muted: { DEFAULT: "hsl(var(--muted))", foreground: "hsl(var(--muted-foreground))" },
        accent: { DEFAULT: "hsl(var(--accent))", foreground: "hsl(var(--accent-foreground))" },
        destructive: { DEFAULT: "hsl(var(--destructive))", foreground: "hsl(var(--destructive-foreground))" },
        success: { DEFAULT: "hsl(var(--success))", foreground: "hsl(var(--success-foreground))" },
        warning: { DEFAULT: "hsl(var(--warning))", foreground: "hsl(var(--warning-foreground))" },
        info: { DEFAULT: "hsl(var(--info))", foreground: "hsl(var(--info-foreground))" },
        purple: { DEFAULT: "hsl(var(--purple))", foreground: "hsl(var(--purple-foreground))" },
        teal: { DEFAULT: "hsl(var(--teal))", foreground: "hsl(var(--teal-foreground))" },
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
      },
      textColor: {
        "ink-2": "hsl(var(--ink-2))",
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      boxShadow: {
        sm: "var(--shadow-sm)",
        md: "var(--shadow-md)",
        lg: "var(--shadow-lg)",
        xl: "var(--shadow-xl)",
      },
      fontFamily: {
        sans: ["Geist", "Geist Fallback", "system-ui", "sans-serif"],
        mono: ["Geist Mono", "Geist Mono Fallback", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;
```

- [ ] **Step 7: Create `client/components.json`**

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "default",
  "rsc": false,
  "tsx": true,
  "tailwind": {
    "config": "tailwind.config.ts",
    "css": "src/index.css",
    "baseColor": "zinc",
    "cssVariables": true
  },
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils"
  }
}
```

- [ ] **Step 8: Create `client/index.html`**

```html
<!DOCTYPE html>
<html lang="en" class="dark">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Launchpad</title>
    <link rel="stylesheet" href="/index.css" />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/bundle.js"></script>
  </body>
</html>
```

- [ ] **Step 9: Create `client/src/index.css`** with all CSS variables and Tailwind directives

```css
@import url('https://fonts.googleapis.com/css2?family=Geist:wght@100..900&family=Geist+Mono:wght@100..900&display=swap');

@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    --background:           0 0% 3.1%;
    --card:                 0 0% 5.9%;
    --popover:              0 0% 5.9%;
    --muted:                0 0% 10.9%;
    --muted-foreground:     0 0% 33.3%;
    --border:               0 0% 10%;
    --input:                0 0% 10%;
    --ring:                 0 0% 83.1%;
    --foreground:           0 0% 92.5%;
    --card-foreground:      0 0% 92.5%;
    --popover-foreground:   0 0% 92.5%;
    --ink-2:                0 0% 63%;
    --primary:              0 0% 100%;
    --primary-foreground:   0 0% 3.9%;
    --secondary:            0 0% 8.6%;
    --secondary-foreground: 0 0% 92.5%;
    --accent:               0 0% 8.6%;
    --accent-foreground:    0 0% 92.5%;
    --destructive:          0 72% 51%;
    --destructive-foreground: 0 0% 100%;
    --success:              152 69% 50%;
    --success-foreground:   152 69% 10%;
    --warning:              38 92% 58%;
    --warning-foreground:   38 92% 15%;
    --info:                 199 89% 48%;
    --info-foreground:      199 89% 10%;
    --purple:               263 70% 75%;
    --purple-foreground:    263 70% 15%;
    --pink:                 330 81% 60%;
    --pink-foreground:      330 81% 15%;
    --teal:                 168 84% 58%;
    --teal-foreground:      168 84% 12%;
    --radius: 0.375rem;
    --shadow-sm: 0 1px 2px rgba(0,0,0,0.4);
    --shadow-md: 0 4px 8px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.04);
    --shadow-lg: 0 8px 24px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.06);
    --shadow-xl: 0 24px 64px rgba(0,0,0,0.8), 0 0 0 1px rgba(255,255,255,0.06);
  }

  * {
    @apply border-border;
  }

  body {
    @apply bg-background text-foreground;
    font-size: 14px;
    line-height: 1.5;
    font-family: "Geist", "Geist Fallback", system-ui, sans-serif;
  }

  h1, h2, h3, h4, h5, h6 {
    letter-spacing: -0.02em;
  }
}
```

- [ ] **Step 10: Create `client/src/lib/utils.ts`**

```typescript
import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

- [ ] **Step 11: Create `scripts/dev.ts`**

```typescript
import { spawn } from "bun";

const server = spawn(["bun", "--hot", "server/src/index.ts"], {
  stdout: "inherit",
  stderr: "inherit",
  env: { ...process.env },
});

const builder = spawn(
  ["bun", "build", "--watch", "client/src/main.tsx", "--outdir", "client/dist", "--sourcemap=inline"],
  { stdout: "inherit", stderr: "inherit" }
);

const css = spawn(
  ["bunx", "tailwindcss", "--watch", "-i", "client/src/index.css", "-o", "client/dist/index.css"],
  { cwd: "client", stdout: "inherit", stderr: "inherit" }
);

process.on("SIGINT", () => {
  server.kill();
  builder.kill();
  css.kill();
  process.exit(0);
});

await Promise.all([server.exited, builder.exited, css.exited]);
```

- [ ] **Step 12: Create `.env.example`**

```
JWT_SECRET=change-me-to-a-long-random-string
DATABASE_PATH=./launchpad.db
UPLOADS_DIR=./uploads
PORT=3001
```

- [ ] **Step 13: Create minimal `client/dist/index.html`** so server has something to serve on first boot

```bash
mkdir -p client/dist
cp client/index.html client/dist/index.html
```

- [ ] **Step 14: Install all dependencies**

```bash
bun install
```

- [ ] **Step 15: Verify workspace installs cleanly**

```bash
bun pm ls
```

Expected: lists packages from both server and client workspaces.

- [ ] **Step 16: Commit**

```bash
git init
git add .
git commit -m "feat: scaffold workspace, tsconfigs, tailwind, shadcn config, dev runner"
```

---

## Task 2: Database + Auth

**Files:**
- Create: `server/src/types/index.ts`
- Create: `server/src/db/index.ts`
- Create: `server/src/middleware/auth.ts`
- Create: `server/src/routes/auth.ts`
- Create: `server/src/index.ts`
- Create: `client/src/lib/types.ts`
- Create: `client/src/lib/api.ts` (auth endpoints only for now)
- Create: `client/src/main.tsx`
- Create: `client/src/App.tsx`
- Create: `client/src/pages/Login.tsx`
- Install shadcn: button, input, label, card

- [ ] **Step 1: Create `server/src/types/index.ts`**

```typescript
export type ProjectStage = "idea" | "building" | "beta" | "live" | "growing" | "sunset";
export type ProjectType = "for-profit" | "open-source";
export type IdeaStatus = "raw" | "promoted";

export interface User {
  id: string;
  name: string;
  email: string;
  password_hash: string;
  created_at: number;
  updated_at: number;
}

export interface Project {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  url: string | null;
  type: ProjectType;
  stage: ProjectStage;
  tech_stack: string; // JSON array string
  last_deployed: number | null;
  created_at: number;
  updated_at: number;
}

export interface ProjectLink {
  id: string;
  project_id: string;
  label: string;
  url: string;
  icon: string | null;
}

export interface ProjectCountry {
  id: string;
  project_id: string;
  country_code: string;
  country_name: string;
}

export interface LegalItem {
  id: string;
  project_id: string;
  country_code: string;
  item: string;
  completed: 0 | 1;
  created_at: number;
}

export interface LaunchChecklistItem {
  id: string;
  project_id: string;
  item: string;
  completed: 0 | 1;
  created_at: number;
}

export interface MrrEntry {
  id: string;
  project_id: string;
  mrr: number;
  user_count: number;
  recorded_at: number;
}

export interface Goal {
  id: string;
  project_id: string;
  description: string;
  target_value: number;
  current_value: number;
  unit: string | null;
  target_date: number | null;
  completed: 0 | 1;
  created_at: number;
}

export interface Idea {
  id: string;
  user_id: string;
  title: string;
  body: string;
  status: IdeaStatus;
  promoted_to_project_id: string | null;
  created_at: number;
  updated_at: number;
}

export interface Note {
  id: string;
  project_id: string;
  content: string;
  is_build_log: 0 | 1;
  created_at: number;
}

export interface TechDebtItem {
  id: string;
  project_id: string;
  note: string;
  resolved: 0 | 1;
  created_at: number;
}

export interface FileRecord {
  id: string;
  project_id: string | null;
  user_id: string;
  filename: string;
  original_name: string;
  mimetype: string;
  size: number;
  uploaded_at: number;
}
```

- [ ] **Step 2: Create `server/src/db/index.ts`**

```typescript
import { Database } from "bun:sqlite";

const dbPath = process.env.DATABASE_PATH ?? "./launchpad.db";
export const db = new Database(dbPath, { create: true });

db.run("PRAGMA journal_mode = WAL");
db.run("PRAGMA foreign_keys = ON");

db.run(`CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
)`);

db.run(`CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  url TEXT,
  type TEXT NOT NULL DEFAULT 'for-profit',
  stage TEXT NOT NULL DEFAULT 'idea',
  tech_stack TEXT NOT NULL DEFAULT '[]',
  last_deployed INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
)`);

db.run(`CREATE TABLE IF NOT EXISTS project_links (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  url TEXT NOT NULL,
  icon TEXT
)`);

db.run(`CREATE TABLE IF NOT EXISTS project_countries (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  country_code TEXT NOT NULL,
  country_name TEXT NOT NULL
)`);

db.run(`CREATE TABLE IF NOT EXISTS legal_items (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  country_code TEXT NOT NULL,
  item TEXT NOT NULL,
  completed INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
)`);

db.run(`CREATE TABLE IF NOT EXISTS launch_checklist (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  item TEXT NOT NULL,
  completed INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
)`);

db.run(`CREATE TABLE IF NOT EXISTS mrr_history (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  mrr INTEGER NOT NULL,
  user_count INTEGER NOT NULL DEFAULT 0,
  recorded_at INTEGER NOT NULL
)`);

db.run(`CREATE TABLE IF NOT EXISTS goals (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  target_value REAL NOT NULL,
  current_value REAL NOT NULL DEFAULT 0,
  unit TEXT,
  target_date INTEGER,
  completed INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
)`);

db.run(`CREATE TABLE IF NOT EXISTS ideas (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'raw',
  promoted_to_project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
)`);

db.run(`CREATE TABLE IF NOT EXISTS notes (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  is_build_log INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
)`);

db.run(`CREATE TABLE IF NOT EXISTS tech_debt (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  note TEXT NOT NULL,
  resolved INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
)`);

db.run(`CREATE TABLE IF NOT EXISTS files (
  id TEXT PRIMARY KEY,
  project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  original_name TEXT NOT NULL,
  mimetype TEXT NOT NULL,
  size INTEGER NOT NULL,
  uploaded_at INTEGER NOT NULL
)`);
```

- [ ] **Step 3: Create `server/src/middleware/auth.ts`**

```typescript
import { createMiddleware } from "hono/factory";
import { jwtVerify } from "jose";

const secret = new TextEncoder().encode(process.env.JWT_SECRET ?? "dev-secret-change-me");

export const requireAuth = createMiddleware<{ Variables: { userId: string } }>(
  async (c, next) => {
    const cookie = c.req.header("cookie") ?? "";
    const match = cookie.match(/(?:^|;\s*)token=([^;]+)/);
    if (!match) return c.json({ error: "Unauthorized" }, 401);

    try {
      const { payload } = await jwtVerify(match[1], secret);
      if (typeof payload.sub !== "string") throw new Error("bad sub");
      c.set("userId", payload.sub);
      await next();
    } catch {
      return c.json({ error: "Unauthorized" }, 401);
    }
  }
);
```

- [ ] **Step 4: Create `server/src/routes/auth.ts`**

```typescript
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
```

- [ ] **Step 5: Create `server/src/index.ts`**

```typescript
import { Hono } from "hono";
import { serveStatic } from "hono/bun";
import authRouter from "./routes/auth.ts";

// Initialize DB (runs all CREATE TABLE IF NOT EXISTS on import)
import "./db/index.ts";

const app = new Hono();

// API routes
app.route("/api/auth", authRouter);

// Static files from client/dist
app.use("/*", serveStatic({ root: "./client/dist" }));

// SPA fallback
app.get("/*", serveStatic({ path: "./client/dist/index.html" }));

const port = Number(process.env.PORT ?? 3001);
console.log(`Launchpad running at http://localhost:${port}`);

export default { port, fetch: app.fetch };
```

- [ ] **Step 6: Verify server starts**

```bash
cd /path/to/launchpad
bun server/src/index.ts
```

Expected: `Launchpad running at http://localhost:3001` with no errors.

- [ ] **Step 7: Verify auth endpoints manually**

```bash
# Register
curl -s -c /tmp/jar -X POST http://localhost:3001/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"name":"Test","email":"test@example.com","password":"secret123"}' | jq .

# Expected: { "id": "...", "name": "Test", "email": "test@example.com" }

# Me
curl -s -b /tmp/jar http://localhost:3001/api/auth/me | jq .
# Expected: { "id": "...", "name": "Test", "email": "test@example.com", ... }

# Login
curl -s -c /tmp/jar2 -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"secret123"}' | jq .
# Expected: user object
```

- [ ] **Step 8: Install shadcn components for Login page**

Run from `client/` directory:
```bash
cd client
bunx shadcn@latest add button input label card
```

This generates files in `client/src/components/ui/`. If the CLI asks for confirmation, accept defaults.

- [ ] **Step 9: Create `client/src/lib/types.ts`** — exact mirror of `server/src/types/index.ts` (copy the file, remove `export interface User` password_hash field from client-facing version)

Keep all types the same. For the client, `User` should not include `password_hash`:

```typescript
export type ProjectStage = "idea" | "building" | "beta" | "live" | "growing" | "sunset";
export type ProjectType = "for-profit" | "open-source";
export type IdeaStatus = "raw" | "promoted";

export interface User {
  id: string;
  name: string;
  email: string;
  created_at: number;
  updated_at: number;
}

// ... (same as server types minus password_hash)
```

Include all other interfaces from `server/src/types/index.ts` verbatim.

- [ ] **Step 10: Create `client/src/lib/api.ts`** with auth endpoints

```typescript
const BASE = "/api";

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...init?.headers },
    ...init,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw Object.assign(new Error(body.error ?? res.statusText), { status: res.status });
  }
  return res.json();
}

export const api = {
  auth: {
    register: (data: { name: string; email: string; password: string }) =>
      req<User>("/auth/register", { method: "POST", body: JSON.stringify(data) }),
    login: (data: { email: string; password: string }) =>
      req<User>("/auth/login", { method: "POST", body: JSON.stringify(data) }),
    logout: () => req<{ ok: true }>("/auth/logout", { method: "POST" }),
    me: () => req<User>("/auth/me"),
  },
};
```

Import `User` from `./types`.

- [ ] **Step 11: Create `client/src/pages/Login.tsx`**

Full implementation:
- Centred card, `max-w-[400px] mx-auto mt-24`
- `<Card>` with `<CardHeader>` (Rocket icon + "Launchpad" title + description) and `<CardContent>` (form)
- Toggle state: `"login" | "register"` — controls whether name field shows and which API call fires
- On submit: call `api.auth.login()` or `api.auth.register()`, on success navigate to `/`
- Error display: shadcn `<Alert>` with variant `"destructive"` — import Alert from shadcn (add it: `bunx shadcn@latest add alert`)
- Use `useNavigate` from react-router-dom
- Use `useMutation` from @tanstack/react-query, `queryClient.invalidateQueries({ queryKey: ["me"] })` on success

```typescript
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Rocket } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { api } from "@/lib/api";

export default function Login() {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: () =>
      mode === "login"
        ? api.auth.login({ email, password })
        : api.auth.register({ name, email, password }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["me"] });
      navigate("/");
    },
  });

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="w-full max-w-[400px] px-4">
        <div className="flex items-center gap-2 justify-center mb-8">
          <Rocket size={16} className="text-foreground" />
          <span className="font-bold text-[15px] tracking-tight">Launchpad</span>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>{mode === "login" ? "Sign in" : "Create account"}</CardTitle>
            <CardDescription className="text-ink-2">
              {mode === "login" ? "Enter your credentials to continue" : "Set up your Launchpad"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form
              onSubmit={(e) => { e.preventDefault(); mutation.mutate(); }}
              className="space-y-4"
            >
              {mode === "register" && (
                <div className="space-y-1.5">
                  <Label htmlFor="name">Name</Label>
                  <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required />
                </div>
              )}
              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="password">Password</Label>
                <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
              </div>
              {mutation.isError && (
                <Alert variant="destructive">
                  <AlertDescription>{(mutation.error as Error).message}</AlertDescription>
                </Alert>
              )}
              <Button type="submit" className="w-full" disabled={mutation.isPending}>
                {mutation.isPending ? "..." : mode === "login" ? "Sign in" : "Create account"}
              </Button>
            </form>
            <p className="mt-4 text-center text-sm text-muted-foreground">
              {mode === "login" ? "No account?" : "Already have an account?"}{" "}
              <button
                type="button"
                onClick={() => setMode(mode === "login" ? "register" : "login")}
                className="text-foreground underline underline-offset-4"
              >
                {mode === "login" ? "Register" : "Sign in"}
              </button>
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
```

Note: the toggle link uses a raw `<button>` here — this is acceptable because it's a purely presentational inline text toggle, not a UI action button. Add a comment: `{/* inline text toggle — not a UI action, plain button intentional */}`

- [ ] **Step 12: Create `client/src/App.tsx`**

```typescript
import { useQuery } from "@tanstack/react-query";
import { Navigate, Route, Routes } from "react-router-dom";
import { api } from "@/lib/api";
import Login from "@/pages/Login";

export default function App() {
  const { data: user, isLoading } = useQuery({
    queryKey: ["me"],
    queryFn: api.auth.me,
    retry: false,
  });

  if (isLoading) return null;

  if (!user) {
    return (
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  return (
    <Routes>
      <Route path="/login" element={<Navigate to="/" replace />} />
      <Route path="*" element={<div className="p-8 text-foreground">Launchpad — authenticated as {user.name}</div>} />
    </Routes>
  );
}
```

- [ ] **Step 13: Create `client/src/main.tsx`**

```typescript
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "./App";
import "./index.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: false },
  },
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>
);
```

- [ ] **Step 14: Run the dev server and verify Login page loads**

```bash
bun run dev
```

Open `http://localhost:3001`. Expected: Login page renders with Rocket icon, form fields, Sign in button.

- [ ] **Step 15: Verify register + login flow in browser**

1. Click "Register", fill in name/email/password, submit
2. Should redirect to `/` showing "authenticated as [name]"
3. Refresh page — should stay authenticated (cookie persists)
4. `curl -b /tmp/jar http://localhost:3001/api/auth/me` confirms cookie auth

- [ ] **Step 16: Commit**

```bash
git add .
git commit -m "feat: DB schema, auth routes, JWT middleware, Login page"
```

---

## Task 3: Projects CRUD

**Files:**
- Create: `server/src/routes/projects.ts` (CRUD + links sub-routes)
- Modify: `server/src/index.ts` (mount projects router)
- Create: `client/src/lib/countries.ts`
- Modify: `client/src/lib/api.ts` (add projects endpoints)
- Create: `client/src/components/app-ui.tsx` (StageBadge, TypeBadge, TagInput, Empty, fmt, STAGE_META, PingDot)
- Create: `client/src/components/Layout.tsx`
- Create: `client/src/components/Sidebar.tsx`
- Create: `client/src/pages/Projects.tsx`
- Modify: `client/src/App.tsx` (add Layout + Projects route)
- Install shadcn: badge, dialog, select, separator, scroll-area, tooltip, popover (for TagInput), command (for TagInput)

- [ ] **Step 1: Install remaining shadcn components**

```bash
cd client
bunx shadcn@latest add badge dialog select separator scroll-area tooltip popover
```

The `command` component for TagInput may need manual install:
```bash
bunx shadcn@latest add command
```

- [ ] **Step 2: Create `client/src/lib/countries.ts`**

```typescript
export const COUNTRIES: { code: string; name: string }[] = [
  { code: "EU", name: "European Union" },
  { code: "US", name: "United States" },
  { code: "UK", name: "United Kingdom" },
  { code: "CA", name: "Canada" },
  { code: "AU", name: "Australia" },
  { code: "DE", name: "Germany" },
  { code: "FR", name: "France" },
  { code: "NL", name: "Netherlands" },
  { code: "IN", name: "India" },
  { code: "BR", name: "Brazil" },
  { code: "JP", name: "Japan" },
  { code: "SG", name: "Singapore" },
  { code: "RU", name: "Russia" },
];

export function countryFlag(code: string): string {
  // Convert country code to Unicode regional indicator emoji pair
  // EU is a special case — use 🇪🇺 directly
  if (code === "EU") return "🇪🇺";
  return [...code.toUpperCase()]
    .map((c) => String.fromCodePoint(0x1f1e6 + c.charCodeAt(0) - 65))
    .join("");
}
```

- [ ] **Step 3: Create `server/src/routes/projects.ts`**

Structure: one Hono router handling all `/api/projects` routes. Key implementation notes:

```typescript
import { Hono } from "hono";
import { db } from "../db/index.ts";
import { requireAuth } from "../middleware/auth.ts";
import type { Project, ProjectLink } from "../types/index.ts";

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

// POST /api/projects — inserts project + seeds launch_checklist
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
  // Seed default checklist
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

// Launch checklist routes
router.get("/:id/launch-checklist", (c) => {
  const items = db.query("SELECT * FROM launch_checklist WHERE project_id = ? ORDER BY created_at ASC")
    .all(c.req.param("id"));
  return c.json(items);
});

router.post("/:id/launch-checklist", async (c) => {
  const { item } = await c.req.json();
  if (!item) return c.json({ error: "item required" }, 400);
  const id = crypto.randomUUID();
  const now = Date.now();
  db.run("INSERT INTO launch_checklist (id, project_id, item, completed, created_at) VALUES (?, ?, ?, 0, ?)",
    [id, c.req.param("id"), item, now]);
  return c.json(db.query("SELECT * FROM launch_checklist WHERE id = ?").get(id), 201);
});

router.put("/:id/launch-checklist/:itemId", async (c) => {
  const { completed } = await c.req.json();
  db.run("UPDATE launch_checklist SET completed = ? WHERE id = ? AND project_id = ?",
    [completed ? 1 : 0, c.req.param("itemId"), c.req.param("id")]);
  return c.json({ ok: true });
});

router.delete("/:id/launch-checklist/:itemId", (c) => {
  db.run("DELETE FROM launch_checklist WHERE id = ? AND project_id = ?",
    [c.req.param("itemId"), c.req.param("id")]);
  return c.json({ ok: true });
});

export default router;
```

- [ ] **Step 4: Mount projects router in `server/src/index.ts`**

```typescript
import projectsRouter from "./routes/projects.ts";
// ...
app.route("/api/projects", projectsRouter);
```

- [ ] **Step 5: Verify projects API**

```bash
# Create project (use cookie jar from register step)
curl -s -b /tmp/jar -X POST http://localhost:3001/api/projects \
  -H "Content-Type: application/json" \
  -d '{"name":"My SaaS","type":"for-profit","stage":"building","tech_stack":["React","Bun"]}' | jq .

# List projects
curl -s -b /tmp/jar http://localhost:3001/api/projects | jq .

# Verify checklist was seeded (should have 15 items)
PROJECT_ID=$(curl -s -b /tmp/jar http://localhost:3001/api/projects | jq -r '.[0].id')
curl -s -b /tmp/jar "http://localhost:3001/api/projects/$PROJECT_ID/launch-checklist" | jq 'length'
# Expected: 15
```

- [ ] **Step 6: Create `client/src/components/app-ui.tsx`**

```typescript
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandItem, CommandList } from "@/components/ui/command";
import { X } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import type { ProjectStage, ProjectType } from "@/lib/types";

export type { ProjectStage, ProjectType };

export const STAGE_META: Record<ProjectStage, { label: string; className: string }> = {
  idea:     { label: "Idea",     className: "bg-muted text-muted-foreground" },
  building: { label: "Building", className: "bg-info/10 text-info border-info/20" },
  beta:     { label: "Beta",     className: "bg-purple/10 text-purple border-purple/20" },
  live:     { label: "Live",     className: "bg-success/10 text-success border-success/20" },
  growing:  { label: "Growing",  className: "bg-warning/10 text-warning border-warning/20" },
  sunset:   { label: "Sunset",   className: "bg-muted text-muted-foreground opacity-60" },
};

export function StageBadge({ stage }: { stage: ProjectStage }) {
  const meta = STAGE_META[stage];
  return (
    <Badge variant="outline" className={cn("text-xs font-medium", meta.className)}>
      {meta.label}
    </Badge>
  );
}

export function TypeBadge({ type }: { type: ProjectType }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "text-xs font-medium",
        type === "for-profit"
          ? "bg-warning/10 text-warning border-warning/20"
          : "bg-purple/10 text-purple border-purple/20"
      )}
    >
      {type === "for-profit" ? "For-profit" : "Open-source"}
    </Badge>
  );
}

export function PingDot({ status }: { status: "up" | "down" | null }) {
  return (
    <span
      className={cn(
        "inline-block w-2 h-2 rounded-full",
        status === "up" && "bg-success animate-pulse",
        status === "down" && "bg-destructive",
        status === null && "bg-muted-foreground"
      )}
    />
  );
}

interface EmptyProps {
  icon: React.ReactNode;
  title: string;
  sub?: string;
  action?: React.ReactNode;
}

export function Empty({ icon, title, sub, action }: EmptyProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center gap-3">
      <div className="text-muted-foreground">{icon}</div>
      <p className="text-sm font-medium text-foreground">{title}</p>
      {sub && <p className="text-xs text-muted-foreground max-w-[240px]">{sub}</p>}
      {action}
    </div>
  );
}

export function fmt(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}k`;
  return `$${n}`;
}

interface TagInputProps {
  value: string[];
  onChange: (tags: string[]) => void;
  suggestions?: string[];
  placeholder?: string;
}

export function TagInput({ value, onChange, suggestions = [], placeholder = "Add tag..." }: TagInputProps) {
  const [input, setInput] = useState("");
  const [open, setOpen] = useState(false);

  const addTag = (tag: string) => {
    const trimmed = tag.trim();
    if (trimmed && !value.includes(trimmed)) {
      onChange([...value, trimmed]);
    }
    setInput("");
    setOpen(false);
  };

  const removeTag = (tag: string) => onChange(value.filter((t) => t !== tag));

  const filtered = suggestions.filter(
    (s) => s.toLowerCase().includes(input.toLowerCase()) && !value.includes(s)
  );

  return (
    <div className="flex flex-wrap gap-1.5 p-2 border border-input rounded-md bg-background min-h-[40px]">
      {value.map((tag) => (
        <Badge key={tag} variant="secondary" className="gap-1 pr-1">
          {tag}
          <button type="button" onClick={() => removeTag(tag)} className="hover:text-destructive">
            <X size={10} />
          </button>
        </Badge>
      ))}
      <Popover open={open && filtered.length > 0} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Input
            value={input}
            onChange={(e) => { setInput(e.target.value); setOpen(true); }}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); addTag(input); }
              if (e.key === "Backspace" && !input && value.length) removeTag(value[value.length - 1]);
            }}
            placeholder={value.length === 0 ? placeholder : ""}
            className="border-0 p-0 h-auto shadow-none focus-visible:ring-0 text-sm flex-1 min-w-[80px]"
          />
        </PopoverTrigger>
        <PopoverContent className="p-0 w-48" align="start">
          <Command>
            <CommandList>
              {filtered.map((s) => (
                <CommandItem key={s} onSelect={() => addTag(s)}>{s}</CommandItem>
              ))}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}
```

- [ ] **Step 7: Create `client/src/components/Sidebar.tsx`**

```typescript
import { NavLink, useNavigate } from "react-router-dom";
import { Rocket, LayoutDashboard, FolderKanban, Lightbulb, Files, LogOut } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";

const NAV = [
  { to: "/", icon: LayoutDashboard, label: "Dashboard" },
  { to: "/projects", icon: FolderKanban, label: "Projects" },
  { to: "/ideas", icon: Lightbulb, label: "Ideas" },
  { to: "/files", icon: Files, label: "Files" },
];

export default function Sidebar() {
  const { data: user } = useQuery({ queryKey: ["me"], queryFn: api.auth.me });
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const logout = useMutation({
    mutationFn: api.auth.logout,
    onSuccess: () => {
      queryClient.clear();
      navigate("/login");
    },
  });

  const initials = user?.name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2) ?? "?";

  return (
    <aside className="fixed left-0 top-0 h-screen w-[240px] bg-background border-r border-border flex flex-col">
      {/* Logo */}
      <div className="flex items-center gap-2 px-4 h-14 border-b border-border">
        <Rocket size={16} className="text-foreground" />
        <span className="font-bold text-[15px] tracking-tight">Launchpad</span>
      </div>

      {/* Nav */}
      <nav className="flex-1 p-2 space-y-0.5">
        {NAV.map(({ to, icon: Icon, label }) => (
          <NavLink key={to} to={to} end={to === "/"}>
            {({ isActive }) => (
              <Button
                variant="ghost"
                className={cn(
                  "justify-start gap-3 w-full",
                  isActive
                    ? "bg-secondary text-foreground border-l-2 border-foreground rounded-l-none pl-[14px]"
                    : "text-muted-foreground"
                )}
              >
                <Icon size={16} />
                {label}
              </Button>
            )}
          </NavLink>
        ))}
      </nav>

      {/* User row */}
      <div className="p-3 border-t border-border flex items-center gap-3">
        <Avatar className="h-7 w-7">
          <AvatarFallback className="text-xs bg-secondary">{initials}</AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{user?.name}</p>
          <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-muted-foreground"
          onClick={() => logout.mutate()}
        >
          <LogOut size={14} />
        </Button>
      </div>
    </aside>
  );
}
```

Install `avatar` shadcn component if not already: `bunx shadcn@latest add avatar`

- [ ] **Step 8: Create `client/src/components/Layout.tsx`**

```typescript
import { Outlet } from "react-router-dom";
import Sidebar from "./Sidebar";

export default function Layout() {
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 ml-[240px] min-h-screen">
        <Outlet />
      </main>
    </div>
  );
}
```

- [ ] **Step 9: Create `client/src/pages/Projects.tsx`**

Full implementation:
- Filter state: `search`, `stageFilter: ProjectStage | null`, `typeFilter: ProjectType | null`
- `useQuery(["projects"], api.projects.list)`
- Filtered list derived from query data
- Grid `grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4`
- Each card: `<Card className="hover:shadow-md transition-shadow cursor-pointer">`
- Card content: project name, `<StageBadge>`, `<TypeBadge>`, tech stack as `<Badge variant="outline">` chips, URL in `font-mono text-xs text-muted-foreground`, `<Separator />` between content and badges
- Click card → `navigate(\`/projects/${project.id}\`)`
- "New Project" primary button → opens `<Dialog>`
- Dialog form: name input, description textarea, URL input, stage `<Select>`, type `<Select>`, tech stack `<TagInput>` with common stack suggestions
- On submit: `useMutation` → `api.projects.create(...)` → `invalidateQueries(["projects"])` + `invalidateQueries(["dashboard"])`

Add projects API to `client/src/lib/api.ts`:

```typescript
projects: {
  list: () => req<Project[]>("/projects"),
  get: (id: string) => req<Project>(`/projects/${id}`),
  create: (data: Partial<Project>) => req<Project>("/projects", { method: "POST", body: JSON.stringify(data) }),
  update: (id: string, data: Partial<Project>) => req<Project>(`/projects/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  delete: (id: string) => req<{ ok: true }>(`/projects/${id}`, { method: "DELETE" }),
  links: {
    list: (id: string) => req<ProjectLink[]>(`/projects/${id}/links`),
    create: (id: string, data: { label: string; url: string; icon?: string }) =>
      req<ProjectLink>(`/projects/${id}/links`, { method: "POST", body: JSON.stringify(data) }),
    delete: (id: string, linkId: string) =>
      req<{ ok: true }>(`/projects/${id}/links/${linkId}`, { method: "DELETE" }),
  },
  checklist: {
    list: (id: string) => req<LaunchChecklistItem[]>(`/projects/${id}/launch-checklist`),
    create: (id: string, item: string) =>
      req<LaunchChecklistItem>(`/projects/${id}/launch-checklist`, { method: "POST", body: JSON.stringify({ item }) }),
    update: (id: string, itemId: string, completed: boolean) =>
      req<{ ok: true }>(`/projects/${id}/launch-checklist/${itemId}`, { method: "PUT", body: JSON.stringify({ completed }) }),
    delete: (id: string, itemId: string) =>
      req<{ ok: true }>(`/projects/${id}/launch-checklist/${itemId}`, { method: "DELETE" }),
  },
},
```

Import all needed types in `api.ts`.

- [ ] **Step 10: Update `client/src/App.tsx`** to use Layout and add routes

```typescript
import Layout from "@/components/Layout";
import Projects from "@/pages/Projects";

// Inside the authenticated branch:
<Routes>
  <Route path="/login" element={<Navigate to="/" replace />} />
  <Route element={<Layout />}>
    <Route path="/" element={<div className="p-8">Dashboard — coming soon</div>} />
    <Route path="/projects" element={<Projects />} />
    <Route path="/ideas" element={<div className="p-8">Ideas — coming soon</div>} />
    <Route path="/files" element={<div className="p-8">Files — coming soon</div>} />
  </Route>
  <Route path="*" element={<Navigate to="/" replace />} />
</Routes>
```

- [ ] **Step 11: Verify Projects page in browser**

1. Navigate to `/projects` — should show empty state
2. Click "New Project", fill form, submit
3. Project card appears in grid with correct badge colours
4. Search/filter pills work to narrow the list

- [ ] **Step 12: Commit**

```bash
git add .
git commit -m "feat: projects CRUD routes, Projects page, Sidebar, Layout, app-ui primitives"
```

---

## Task 4: Dashboard

**Files:**
- Create: `server/src/routes/misc.ts`
- Modify: `server/src/index.ts` (mount misc router)
- Modify: `client/src/lib/api.ts` (add dashboard endpoint)
- Create: `client/src/pages/Dashboard.tsx`
- Modify: `client/src/App.tsx` (replace Dashboard placeholder)

- [ ] **Step 1: Create `server/src/routes/misc.ts`**

```typescript
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

router.post("/ping", requireAuth, async (c) => {
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
```

- [ ] **Step 2: Mount misc router in `server/src/index.ts`**

```typescript
import miscRouter from "./routes/misc.ts";
app.route("/api", miscRouter);
```

- [ ] **Step 3: Add dashboard to `client/src/lib/api.ts`**

```typescript
dashboard: {
  get: () => req<DashboardData>("/dashboard"),
},
```

Add `DashboardData` interface to `client/src/lib/types.ts`:

```typescript
export interface DashboardData {
  mrr: number;
  projectCount: number;
  ideaCount: number;
  legalPending: number;
  stageDist: { stage: ProjectStage; count: number }[];
  recentProjects: Project[];
  recentIdeas: Idea[];
}
```

- [ ] **Step 4: Create `client/src/pages/Dashboard.tsx`**

Structure:
```
<div className="p-8 max-w-7xl">
  Page header: "Dashboard" h1 + "Your founder command centre" subtitle

  {/* Stat cards — 4 col grid */}
  <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
    StatCard: Total MRR — fmt(data.mrr), success colour, TrendingUp icon
    StatCard: Projects — data.projectCount, foreground, FolderKanban icon
    StatCard: Idea Inbox — data.ideaCount, warning colour, Lightbulb icon
    StatCard: Legal Pending — data.legalPending, destructive colour, AlertTriangle icon
  </div>

  <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-4">
    {/* Pipeline bar — spans 2 cols */}
    <Card className="lg:col-span-2">
      Pipeline: segmented div, each segment width% = count/total * 100
      Each segment coloured per STAGE_META
      Legend below: stage label + count
    </Card>

    {/* Recent projects — spans 1 col or 2 rows */}
    <Card>
      "Recent Projects" header
      rows: name + StageBadge + TypeBadge, clickable → /projects/:id
    </Card>
  </div>

  {/* Idea inbox preview */}
  <Card className="mt-4">
    "Idea Inbox" header with count badge
    Up to 5 raw ideas as rows
    Empty state if none
  </Card>
</div>
```

StatCard inner component (local to Dashboard.tsx):
```typescript
function StatCard({ label, value, sub, colour, icon }: StatCardProps) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <p className="text-xs text-muted-foreground uppercase tracking-wider">{label}</p>
          <div className="p-1.5 bg-muted rounded-md">{icon}</div>
        </div>
        <p className={cn("font-mono text-3xl font-medium mt-2", colour)}>{value}</p>
        {sub && <p className="text-sm text-muted-foreground mt-1">{sub}</p>}
      </CardContent>
    </Card>
  );
}
```

Pipeline bar implementation:
```typescript
const STAGES: ProjectStage[] = ["idea", "building", "beta", "live", "growing", "sunset"];
const total = data.stageDist.reduce((s, x) => s + x.count, 0) || 1;
const countByStage = Object.fromEntries(data.stageDist.map((x) => [x.stage, x.count]));

<div className="flex rounded-full overflow-hidden h-3">
  {STAGES.map((stage) => {
    const pct = ((countByStage[stage] ?? 0) / total) * 100;
    if (pct === 0) return null;
    return <div key={stage} style={{ width: `${pct}%` }} className={STAGE_META[stage].className} />;
  })}
</div>
```

- [ ] **Step 5: Update `client/src/App.tsx`** to import and use Dashboard page

- [ ] **Step 6: Verify Dashboard in browser** with at least one project created. Stat cards show correct numbers.

- [ ] **Step 7: Commit**

```bash
git add .
git commit -m "feat: dashboard API, Dashboard page with stat cards and pipeline bar"
```

---

## Task 5: ProjectDetail Shell + Overview Tab

**Files:**
- Create: `client/src/pages/ProjectDetail.tsx`
- Modify: `client/src/App.tsx` (add `/projects/:id` route)
- Modify: `client/src/lib/api.ts` (links, checklist already added; nothing new needed for this slice)
- Install shadcn: tabs, progress, checkbox

- [ ] **Step 1: Install remaining shadcn components**

```bash
cd client
bunx shadcn@latest add tabs progress checkbox
```

- [ ] **Step 2: Create `client/src/pages/ProjectDetail.tsx`**

This is the largest page. Break it into logical sections within the file (no separate tab files — keep in one file for now unless it exceeds ~600 lines, in which case extract tab components to `pages/project-tabs/` directory).

**Sticky header:**
```typescript
// Sticky header — position sticky top-0 z-10 bg-background border-b border-border
<div className="sticky top-0 z-10 bg-background border-b border-border px-8 pt-6 pb-0">
  {/* Breadcrumb */}
  <div className="flex items-center gap-2 text-sm text-muted-foreground mb-3">
    <Link to="/projects">Projects</Link>
    <ChevronRight size={14} />
    <span className="text-foreground">{project.name}</span>
  </div>

  {/* Name + badges + actions row */}
  <div className="flex items-center gap-3">
    <h1 className="text-xl font-semibold tracking-tight">{project.name}</h1>
    <StageBadge stage={project.stage} />
    <TypeBadge type={project.type} />
    <div className="ml-auto flex items-center gap-2">
      {project.url && (
        <Button variant="ghost" size="sm" asChild>
          <a href={project.url} target="_blank" rel="noopener noreferrer">
            <ExternalLink size={14} className="mr-1.5" /> Visit
          </a>
        </Button>
      )}
    </div>
  </div>

  {/* Tabs flush to bottom of header */}
  <Tabs value={tab} onValueChange={setTab} className="mt-4">
    <TabsList className="bg-transparent p-0 h-auto border-b-0 gap-0">
      {TABS.map(t => (
        <TabsTrigger key={t.value} value={t.value}
          className="rounded-none border-b-2 border-transparent data-[state=active]:border-foreground data-[state=active]:bg-transparent pb-3 px-4">
          {t.label}
        </TabsTrigger>
      ))}
    </TabsList>
  </Tabs>
</div>
```

Define tabs (hide Revenue for open-source):
```typescript
const TABS = [
  { value: "overview", label: "Overview" },
  { value: "health", label: "Health" },
  ...(project.type === "for-profit" ? [{ value: "revenue", label: "Revenue" }] : []),
  { value: "compliance", label: "Compliance" },
  { value: "buildlog", label: "Build Log" },
  { value: "files", label: "Files" },
];
```

**Overview tab — 2+1 grid:**

Left (2/3): **Project info card** with inline edit
- Display mode: name, description, URL, type, stage, tech stack chips, last_deployed date
- Edit mode triggered by pencil `<Button variant="ghost" size="icon">`: fields become `<Input>` / `<Select>` / `<TagInput>`
- "Save" button calls `PUT /api/projects/:id` via `useMutation`
- "Cancel" button resets form state to project data

Left (2/3) continued: **Launch checklist card**
- `<Progress value={completedPct} className="h-1.5 mt-2" />`
- `<Checkbox>` per item — `useMutation` on check/uncheck → `PUT /api/projects/:id/launch-checklist/:itemId`
- Add item: `<Input>` + submit on Enter key or button → `POST`
- Delete item: trash icon on hover → `DELETE`

Right (1/3): **Links Hub card**
- Preset chips: GitHub, Vercel, Stripe, Supabase, etc. — clicking pre-fills label field
- Add form: label `<Input>` + URL `<Input>` + "Add" button
- Each link row: external link icon + label text + URL truncated + delete on hover
- `useMutation` for add/delete, invalidate `["project-links", id]`

Right (1/3) continued: **Danger Zone card**
- `<Button variant="destructive">Delete Project</Button>`
- Opens confirmation `<Dialog>`: "Type the project name to confirm" `<Input>`, delete button enabled when input matches

- [ ] **Step 3: Add API helpers to `client/src/lib/api.ts`** for checklist (verify already there from Task 3) — no new additions needed.

- [ ] **Step 4: Update `client/src/App.tsx`** to add `/projects/:id` route

```typescript
import ProjectDetail from "@/pages/ProjectDetail";
// ...
<Route path="/projects/:id" element={<ProjectDetail />} />
```

- [ ] **Step 5: Verify Overview tab in browser**

1. Click any project from Projects page → ProjectDetail loads
2. Sticky header shows breadcrumb, stage/type badges, Visit button (if URL set)
3. Tabs render correctly (Revenue hidden for open-source)
4. Edit project info, save → changes persist on refresh
5. Check/uncheck checklist items → progress bar updates
6. Add/delete links → list updates

- [ ] **Step 6: Commit**

```bash
git add .
git commit -m "feat: ProjectDetail sticky header, tabs, Overview tab with inline edit + checklist + links"
```

---

## Task 6: Health Tab

**Files:**
- Modify: `server/src/routes/projects.ts` (add tech debt routes)
- Modify: `client/src/lib/api.ts` (add tech debt + ping endpoints)
- Modify: `client/src/pages/ProjectDetail.tsx` (implement Health tab)

- [ ] **Step 1: Add tech debt routes to `server/src/routes/projects.ts`**

```typescript
// GET /api/projects/:id/tech-debt
router.get("/:id/tech-debt", (c) => {
  return c.json(
    db.query("SELECT * FROM tech_debt WHERE project_id = ? ORDER BY created_at DESC")
      .all(c.req.param("id"))
  );
});

// POST /api/projects/:id/tech-debt
router.post("/:id/tech-debt", async (c) => {
  const { note } = await c.req.json();
  if (!note) return c.json({ error: "note required" }, 400);
  const id = crypto.randomUUID();
  db.run("INSERT INTO tech_debt (id, project_id, note, resolved, created_at) VALUES (?, ?, ?, 0, ?)",
    [id, c.req.param("id"), note, Date.now()]);
  return c.json(db.query("SELECT * FROM tech_debt WHERE id = ?").get(id), 201);
});

// PUT /api/projects/:id/tech-debt/:debtId
router.put("/:id/tech-debt/:debtId", async (c) => {
  const { resolved } = await c.req.json();
  db.run("UPDATE tech_debt SET resolved = ? WHERE id = ? AND project_id = ?",
    [resolved ? 1 : 0, c.req.param("debtId"), c.req.param("id")]);
  return c.json({ ok: true });
});

// DELETE /api/projects/:id/tech-debt/:debtId
router.delete("/:id/tech-debt/:debtId", (c) => {
  db.run("DELETE FROM tech_debt WHERE id = ? AND project_id = ?",
    [c.req.param("debtId"), c.req.param("id")]);
  return c.json({ ok: true });
});
```

- [ ] **Step 2: Add tech debt and ping to `client/src/lib/api.ts`**

```typescript
techDebt: {
  list: (id: string) => req<TechDebtItem[]>(`/projects/${id}/tech-debt`),
  create: (id: string, note: string) =>
    req<TechDebtItem>(`/projects/${id}/tech-debt`, { method: "POST", body: JSON.stringify({ note }) }),
  update: (id: string, debtId: string, resolved: boolean) =>
    req<{ ok: true }>(`/projects/${id}/tech-debt/${debtId}`, { method: "PUT", body: JSON.stringify({ resolved }) }),
  delete: (id: string, debtId: string) =>
    req<{ ok: true }>(`/projects/${id}/tech-debt/${debtId}`, { method: "DELETE" }),
},
ping: (url: string) => req<{ status: "up" | "down"; latencyMs: number }>("/ping", { method: "POST", body: JSON.stringify({ url }) }),
```

- [ ] **Step 3: Implement Health tab in `ProjectDetail.tsx`**

```typescript
// Inside <TabsContent value="health">
<div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
  {/* Site Status card */}
  <Card>
    <CardHeader>
      <CardTitle className="text-sm font-medium">Site Status</CardTitle>
    </CardHeader>
    <CardContent>
      <div className="flex items-center gap-3">
        <PingDot status={pingStatus} />
        <span className="font-mono text-sm">{project.url ?? "No URL set"}</span>
        {pingLatency !== null && (
          <span className={cn("text-xs", pingStatus === "up" ? "text-success" : "text-destructive")}>
            {pingStatus === "up" ? `${pingLatency}ms` : "unreachable"}
          </span>
        )}
        <Button
          variant="secondary"
          size="sm"
          className="ml-auto gap-1.5"
          disabled={!project.url || pinging}
          onClick={handlePing}
        >
          <RefreshCw size={12} className={cn(pinging && "animate-spin")} />
          Ping Now
        </Button>
      </div>
    </CardContent>
  </Card>

  {/* Tech Debt card */}
  <Card>
    <CardHeader>
      <CardTitle className="text-sm font-medium">Tech Debt</CardTitle>
    </CardHeader>
    <CardContent className="space-y-2">
      {techDebt.map(item => (
        <div key={item.id} className={cn(
          "flex items-start gap-2 p-2 rounded border",
          item.resolved ? "border-success/20" : "border-warning/20"
        )}>
          <Checkbox
            checked={item.resolved === 1}
            onCheckedChange={(v) => updateDebt.mutate({ id: item.id, resolved: !!v })}
          />
          <span className={cn("text-sm flex-1", item.resolved && "line-through text-muted-foreground")}>
            {item.note}
          </span>
          <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-destructive"
            onClick={() => deleteDebt.mutate(item.id)}>
            <Trash2 size={12} />
          </Button>
        </div>
      ))}
      <form onSubmit={handleAddDebt} className="flex gap-2 mt-3">
        <Input value={debtNote} onChange={e => setDebtNote(e.target.value)} placeholder="Add tech debt item..." />
        <Button type="submit" variant="secondary" size="sm">Add</Button>
      </form>
    </CardContent>
  </Card>
</div>
```

Ping state: `const [pingStatus, setPingStatus] = useState<"up"|"down"|null>(null)` and `const [pingLatency, setPingLatency] = useState<number|null>(null)`. `handlePing` calls `api.ping(project.url)` and sets state.

- [ ] **Step 4: Verify Health tab**

1. Click "Ping Now" with a valid URL — dot turns green + latency shows
2. Ping a bad URL — dot turns red + "unreachable"
3. Add tech debt items, resolve them — border colour changes
4. Delete tech debt items

- [ ] **Step 5: Commit**

```bash
git add .
git commit -m "feat: Health tab — ping, tech debt CRUD"
```

---

## Task 7: Revenue Tab

**Files:**
- Modify: `server/src/routes/projects.ts` (add MRR + goals routes)
- Modify: `client/src/lib/api.ts` (add MRR + goals endpoints)
- Modify: `client/src/pages/ProjectDetail.tsx` (implement Revenue tab)

- [ ] **Step 1: Add MRR and goals routes to `server/src/routes/projects.ts`**

```typescript
// MRR routes
router.get("/:id/mrr", (c) => {
  return c.json(
    db.query("SELECT * FROM mrr_history WHERE project_id = ? ORDER BY recorded_at ASC")
      .all(c.req.param("id"))
  );
});

router.post("/:id/mrr", async (c) => {
  const { mrr, user_count } = await c.req.json();
  if (typeof mrr !== "number") return c.json({ error: "mrr (number) required" }, 400);
  const id = crypto.randomUUID();
  const now = Date.now();
  db.run("INSERT INTO mrr_history (id, project_id, mrr, user_count, recorded_at) VALUES (?, ?, ?, ?, ?)",
    [id, c.req.param("id"), mrr, user_count ?? 0, now]);
  return c.json(db.query("SELECT * FROM mrr_history WHERE id = ?").get(id), 201);
});

// Goals routes
router.get("/:id/goals", (c) => {
  return c.json(
    db.query("SELECT * FROM goals WHERE project_id = ? ORDER BY created_at ASC")
      .all(c.req.param("id"))
  );
});

router.post("/:id/goals", async (c) => {
  const { description, target_value, current_value, unit, target_date } = await c.req.json();
  if (!description || target_value == null) return c.json({ error: "description and target_value required" }, 400);
  const id = crypto.randomUUID();
  db.run(
    "INSERT INTO goals (id, project_id, description, target_value, current_value, unit, target_date, completed, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)",
    [id, c.req.param("id"), description, target_value, current_value ?? 0, unit ?? null, target_date ?? null, Date.now()]
  );
  return c.json(db.query("SELECT * FROM goals WHERE id = ?").get(id), 201);
});

router.put("/:id/goals/:goalId", async (c) => {
  const { description, target_value, current_value, unit, target_date, completed } = await c.req.json();
  db.run(
    "UPDATE goals SET description=?, target_value=?, current_value=?, unit=?, target_date=?, completed=? WHERE id=? AND project_id=?",
    [description, target_value, current_value, unit ?? null, target_date ?? null,
     completed ? 1 : 0, c.req.param("goalId"), c.req.param("id")]
  );
  return c.json({ ok: true });
});

router.delete("/:id/goals/:goalId", (c) => {
  db.run("DELETE FROM goals WHERE id = ? AND project_id = ?",
    [c.req.param("goalId"), c.req.param("id")]);
  return c.json({ ok: true });
});
```

- [ ] **Step 2: Add MRR + goals to `client/src/lib/api.ts`**

```typescript
mrr: {
  list: (id: string) => req<MrrEntry[]>(`/projects/${id}/mrr`),
  create: (id: string, data: { mrr: number; user_count: number }) =>
    req<MrrEntry>(`/projects/${id}/mrr`, { method: "POST", body: JSON.stringify(data) }),
},
goals: {
  list: (id: string) => req<Goal[]>(`/projects/${id}/goals`),
  create: (id: string, data: Partial<Goal>) =>
    req<Goal>(`/projects/${id}/goals`, { method: "POST", body: JSON.stringify(data) }),
  update: (id: string, goalId: string, data: Partial<Goal>) =>
    req<{ ok: true }>(`/projects/${id}/goals/${goalId}`, { method: "PUT", body: JSON.stringify(data) }),
  delete: (id: string, goalId: string) =>
    req<{ ok: true }>(`/projects/${id}/goals/${goalId}`, { method: "DELETE" }),
},
```

- [ ] **Step 3: Implement Revenue tab in `ProjectDetail.tsx`**

```typescript
// <TabsContent value="revenue">
// Only rendered when project.type === "for-profit" (tab is hidden for open-source)

// Derived values
const latestMrr = mrrHistory.at(-1)?.mrr ?? 0;
const latestUsers = mrrHistory.at(-1)?.user_count ?? 0;
const arr = latestMrr * 12;

// Stat cards row
<div className="grid grid-cols-3 gap-4">
  <Card><CardContent className="p-5">
    <p className="text-xs text-muted-foreground uppercase tracking-wider">MRR</p>
    <p className="font-mono text-3xl font-medium text-success mt-2">{fmt(latestMrr)}</p>
  </CardContent></Card>
  {/* Users — foreground, ARR — info */}
</div>

// Recharts AreaChart
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
const chartData = mrrHistory.map(e => ({
  date: new Date(e.recorded_at).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
  mrr: e.mrr,
}));

<Card>
  <CardHeader><CardTitle className="text-sm font-medium">MRR over time</CardTitle></CardHeader>
  <CardContent>
    <ResponsiveContainer width="100%" height={200}>
      <AreaChart data={chartData}>
        <defs>
          <linearGradient id="mrrGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="hsl(152 69% 50%)" stopOpacity={0.2} />
            <stop offset="95%" stopColor="hsl(152 69% 50%)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <XAxis dataKey="date" tick={{ fontSize: 11, fill: "hsl(0 0% 33.3%)" }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 11, fill: "hsl(0 0% 33.3%)" }} axisLine={false} tickLine={false}
          tickFormatter={(v) => `$${v}`} />
        <Tooltip
          contentStyle={{ background: "hsl(0 0% 5.9%)", border: "1px solid hsl(0 0% 10%)", borderRadius: "6px" }}
          labelStyle={{ color: "hsl(0 0% 92.5%)" }}
          formatter={(v: number) => [fmt(v), "MRR"]}
        />
        <Area type="monotone" dataKey="mrr" stroke="hsl(152 69% 50%)" strokeWidth={2}
          fill="url(#mrrGrad)" />
      </AreaChart>
    </ResponsiveContainer>
  </CardContent>
</Card>

// Log entry card — two inputs side-by-side + submit
<Card>
  <CardHeader><CardTitle className="text-sm font-medium">Log Entry</CardTitle></CardHeader>
  <CardContent>
    <form onSubmit={handleLogMrr} className="flex gap-3">
      <div className="flex-1"><Label>MRR ($)</Label><Input type="number" value={mrrInput} .../></div>
      <div className="flex-1"><Label>Users</Label><Input type="number" value={usersInput} .../></div>
      <Button type="submit" className="self-end">Log</Button>
    </form>
  </CardContent>
</Card>

// Goals card — Checkbox per goal, add via Dialog
```

Add Goal dialog fields: description, target_value (number), unit (text, optional), current_value (number), target_date (date input). Install `shadcn add alert-dialog` if needed for confirmation dialogs.

- [ ] **Step 4: Verify Revenue tab**

1. Log two MRR entries — chart renders and updates
2. ARR = MRR × 12 updates correctly
3. Add a goal via Dialog — appears with checkbox
4. Check goal as completed — checkbox toggles
5. Revenue tab hidden when viewing an open-source project

- [ ] **Step 5: Commit**

```bash
git add .
git commit -m "feat: Revenue tab — MRR history, Recharts chart, goals CRUD"
```

---

## Task 8: Compliance Tab

**Files:**
- Modify: `server/src/routes/projects.ts` (add countries + legal routes)
- Modify: `client/src/lib/api.ts` (add countries + legal endpoints)
- Modify: `client/src/pages/ProjectDetail.tsx` (implement Compliance tab)

- [ ] **Step 1: Add countries + legal routes to `server/src/routes/projects.ts`**

```typescript
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

// GET /api/projects/:id/countries
router.get("/:id/countries", (c) => {
  return c.json(
    db.query("SELECT * FROM project_countries WHERE project_id = ?").all(c.req.param("id"))
  );
});

// POST /api/projects/:id/countries — auto-seeds legal items
router.post("/:id/countries", async (c) => {
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

  return c.json(db.query("SELECT * FROM project_countries WHERE id = ?").get(id), 201);
});

// DELETE /api/projects/:id/countries/:cId — FK CASCADE removes legal_items automatically
router.delete("/:id/countries/:cId", (c) => {
  db.run("DELETE FROM project_countries WHERE id = ? AND project_id = ?",
    [c.req.param("cId"), c.req.param("id")]);
  return c.json({ ok: true });
});

// GET /api/projects/:id/legal
router.get("/:id/legal", (c) => {
  return c.json(
    db.query("SELECT * FROM legal_items WHERE project_id = ? ORDER BY country_code, created_at ASC")
      .all(c.req.param("id"))
  );
});

// POST /api/projects/:id/legal — add custom item
router.post("/:id/legal", async (c) => {
  const { country_code, item } = await c.req.json();
  if (!country_code || !item) return c.json({ error: "country_code and item required" }, 400);
  const id = crypto.randomUUID();
  db.run("INSERT INTO legal_items (id, project_id, country_code, item, completed, created_at) VALUES (?, ?, ?, ?, 0, ?)",
    [id, c.req.param("id"), country_code, item, Date.now()]);
  return c.json(db.query("SELECT * FROM legal_items WHERE id = ?").get(id), 201);
});

// PUT /api/projects/:id/legal/:itemId
router.put("/:id/legal/:itemId", async (c) => {
  const { completed } = await c.req.json();
  db.run("UPDATE legal_items SET completed = ? WHERE id = ? AND project_id = ?",
    [completed ? 1 : 0, c.req.param("itemId"), c.req.param("id")]);
  return c.json({ ok: true });
});

// DELETE /api/projects/:id/legal/:itemId
router.delete("/:id/legal/:itemId", (c) => {
  db.run("DELETE FROM legal_items WHERE id = ? AND project_id = ?",
    [c.req.param("itemId"), c.req.param("id")]);
  return c.json({ ok: true });
});
```

- [ ] **Step 2: Add compliance to `client/src/lib/api.ts`**

```typescript
countries: {
  list: (id: string) => req<ProjectCountry[]>(`/projects/${id}/countries`),
  add: (id: string, data: { country_code: string; country_name: string }) =>
    req<ProjectCountry>(`/projects/${id}/countries`, { method: "POST", body: JSON.stringify(data) }),
  remove: (id: string, cId: string) =>
    req<{ ok: true }>(`/projects/${id}/countries/${cId}`, { method: "DELETE" }),
},
legal: {
  list: (id: string) => req<LegalItem[]>(`/projects/${id}/legal`),
  create: (id: string, data: { country_code: string; item: string }) =>
    req<LegalItem>(`/projects/${id}/legal`, { method: "POST", body: JSON.stringify(data) }),
  update: (id: string, itemId: string, completed: boolean) =>
    req<{ ok: true }>(`/projects/${id}/legal/${itemId}`, { method: "PUT", body: JSON.stringify({ completed }) }),
  delete: (id: string, itemId: string) =>
    req<{ ok: true }>(`/projects/${id}/legal/${itemId}`, { method: "DELETE" }),
},
```

- [ ] **Step 3: Implement Compliance tab in `ProjectDetail.tsx`**

```typescript
// Top: Add country card
<Card>
  <CardContent className="p-4 flex gap-3 items-end">
    <div className="flex-1">
      <Label>Add country / region</Label>
      <Select value={countryCode} onValueChange={setCountryCode}>
        <SelectTrigger><SelectValue placeholder="Select country..." /></SelectTrigger>
        <SelectContent>
          {COUNTRIES.filter(c => !activeCountryCodes.includes(c.code)).map(c => (
            <SelectItem key={c.code} value={c.code}>{countryFlag(c.code)} {c.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
    <Button onClick={handleAddCountry} disabled={!countryCode}>Add</Button>
  </CardContent>
</Card>

// Active country chips
<div className="flex flex-wrap gap-2">
  {countries.map(c => (
    <Badge key={c.id} variant="secondary" className="gap-1.5 pl-2 pr-1">
      {countryFlag(c.country_code)} {c.country_name}
      <button onClick={() => removeCountry.mutate(c.id)} className="hover:text-destructive ml-0.5">
        <X size={10} />
      </button>
    </Badge>
  ))}
</div>

// Per-country legal cards
{countries.map(country => {
  const items = legalItems.filter(li => li.country_code === country.country_code);
  const done = items.filter(i => i.completed).length;
  return (
    <Card key={country.id}>
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <span className="text-2xl">{countryFlag(country.country_code)}</span>
          <CardTitle className="text-sm font-medium">{country.country_name}</CardTitle>
          <span className="ml-auto text-xs text-muted-foreground">{done}/{items.length}</span>
        </div>
        <Progress value={(done / (items.length || 1)) * 100} className="h-1" />
      </CardHeader>
      <CardContent className="space-y-1.5">
        {items.map(item => (
          <div key={item.id} className="flex items-center gap-2">
            <Checkbox checked={item.completed === 1}
              onCheckedChange={(v) => updateLegal.mutate({ id: item.id, completed: !!v })} />
            <span className={cn("text-sm flex-1", item.completed && "line-through text-muted-foreground")}>
              {item.item}
            </span>
            <Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100 hover:text-destructive"
              onClick={() => deleteLegal.mutate(item.id)}>
              <Trash2 size={11} />
            </Button>
          </div>
        ))}
        {/* Add custom item */}
        <AddCustomLegalItem projectId={id} countryCode={country.country_code}
          onSuccess={() => queryClient.invalidateQueries({ queryKey: ["legal", id] })} />
      </CardContent>
    </Card>
  );
})}
```

`AddCustomLegalItem` is a small component (can be inline): ghost button that expands to an input + submit.

- [ ] **Step 4: Verify Compliance tab**

1. Add EU → 6 legal items auto-seeded, progress bar shows 0/6
2. Add US → 4 more items in separate card
3. Check items → progress bars update
4. Add custom item → appears in correct country card
5. Remove a country → its card + legal items disappear (CASCADE)
6. Dashboard "Legal Pending" count updates

- [ ] **Step 5: Commit**

```bash
git add .
git commit -m "feat: Compliance tab — countries, legal auto-seed, per-country checklists"
```

---

## Task 9: Build Log + Notes Tab

**Files:**
- Modify: `server/src/routes/projects.ts` (add notes routes)
- Modify: `client/src/lib/api.ts` (add notes endpoints)
- Modify: `client/src/pages/ProjectDetail.tsx` (implement Build Log tab)
- Install shadcn: switch (if not already)

- [ ] **Step 1: Install shadcn switch**

```bash
cd client && bunx shadcn@latest add switch
```

- [ ] **Step 2: Add notes routes to `server/src/routes/projects.ts`**

```typescript
router.get("/:id/notes", (c) => {
  return c.json(
    db.query("SELECT * FROM notes WHERE project_id = ? ORDER BY created_at DESC")
      .all(c.req.param("id"))
  );
});

router.post("/:id/notes", async (c) => {
  const { content, is_build_log } = await c.req.json();
  if (!content) return c.json({ error: "content required" }, 400);
  const id = crypto.randomUUID();
  db.run("INSERT INTO notes (id, project_id, content, is_build_log, created_at) VALUES (?, ?, ?, ?, ?)",
    [id, c.req.param("id"), content, is_build_log ? 1 : 0, Date.now()]);
  return c.json(db.query("SELECT * FROM notes WHERE id = ?").get(id), 201);
});

router.delete("/:id/notes/:noteId", (c) => {
  db.run("DELETE FROM notes WHERE id = ? AND project_id = ?",
    [c.req.param("noteId"), c.req.param("id")]);
  return c.json({ ok: true });
});
```

- [ ] **Step 3: Add notes to `client/src/lib/api.ts`**

```typescript
notes: {
  list: (id: string) => req<Note[]>(`/projects/${id}/notes`),
  create: (id: string, data: { content: string; is_build_log: boolean }) =>
    req<Note>(`/projects/${id}/notes`, { method: "POST", body: JSON.stringify(data) }),
  delete: (id: string, noteId: string) =>
    req<{ ok: true }>(`/projects/${id}/notes/${noteId}`, { method: "DELETE" }),
},
```

- [ ] **Step 4: Implement Build Log tab in `ProjectDetail.tsx`**

```typescript
// <TabsContent value="buildlog">
const allNotes = useQuery({ queryKey: ["notes", id], queryFn: () => api.notes.list(id) });
const buildLogEntries = (allNotes.data ?? []).filter(n => n.is_build_log === 1);

// Composer card at top
<Card>
  <CardContent className="p-4 space-y-3">
    <Textarea
      value={noteContent}
      onChange={e => setNoteContent(e.target.value)}
      placeholder="What did you build today?"
      className="min-h-[100px] resize-none"
    />
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <Switch
          id="build-log-toggle"
          checked={isBuildLog}
          onCheckedChange={setIsBuildLog}
        />
        <Label htmlFor="build-log-toggle" className="text-sm text-muted-foreground cursor-pointer">
          Build log entry
        </Label>
      </div>
      <Button
        size="sm"
        disabled={!noteContent.trim() || addNote.isPending}
        onClick={() => addNote.mutate({ content: noteContent, is_build_log: isBuildLog })}
      >
        Save
      </Button>
    </div>
  </CardContent>
</Card>

// Build log feed
{buildLogEntries.length === 0 ? (
  <Empty icon={<BookOpen size={32} />} title="No build log entries yet"
    sub="Toggle 'Build log entry' when saving a note to add it here." />
) : (
  <div className="space-y-3">
    {buildLogEntries.map(entry => (
      <Card key={entry.id} className="group">
        <CardContent className="p-4">
          <div className="flex items-start justify-between gap-3">
            <p className="text-sm whitespace-pre-wrap flex-1">{entry.content}</p>
            <Button variant="ghost" size="icon"
              className="h-7 w-7 opacity-0 group-hover:opacity-100 hover:text-destructive shrink-0"
              onClick={() => deleteNote.mutate(entry.id)}>
              <Trash2 size={12} />
            </Button>
          </div>
          <p className="text-xs font-mono text-muted-foreground mt-2">
            {new Date(entry.created_at).toLocaleString()}
          </p>
        </CardContent>
      </Card>
    ))}
  </div>
)}
```

`addNote` mutation: on success, reset `noteContent` to `""`, keep `isBuildLog` state, invalidate `["notes", id]`.

- [ ] **Step 5: Verify Build Log tab**

1. Type a note with Switch OFF → save → does NOT appear in build log feed (is a plain note)
2. Type another with Switch ON → save → appears in feed with timestamp
3. Delete entry → removed from feed
4. Notes list (all notes) can be verified via `GET /api/projects/:id/notes` — should return both kinds

- [ ] **Step 6: Commit**

```bash
git add .
git commit -m "feat: Build Log tab — notes routes, build log feed with Switch toggle"
```

---

## Task 10: Ideas

**Files:**
- Create: `server/src/routes/ideas.ts`
- Modify: `server/src/index.ts` (mount ideas router)
- Modify: `client/src/lib/api.ts` (add ideas endpoints)
- Create: `client/src/pages/Ideas.tsx`
- Modify: `client/src/App.tsx` (replace Ideas placeholder)

- [ ] **Step 1: Create `server/src/routes/ideas.ts`**

```typescript
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

// Promote idea → creates a new project from it
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
```

Extract `DEFAULT_CHECKLIST` to a shared constant in `db/index.ts` or duplicate it — duplication is acceptable here.

- [ ] **Step 2: Mount ideas router**

```typescript
import ideasRouter from "./routes/ideas.ts";
app.route("/api/ideas", ideasRouter);
```

- [ ] **Step 3: Add ideas to `client/src/lib/api.ts`**

```typescript
ideas: {
  list: () => req<Idea[]>("/ideas"),
  create: (data: { title: string; body: string }) =>
    req<Idea>("/ideas", { method: "POST", body: JSON.stringify(data) }),
  update: (id: string, data: { title: string; body: string }) =>
    req<Idea>(`/ideas/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  delete: (id: string) => req<{ ok: true }>(`/ideas/${id}`, { method: "DELETE" }),
  promote: (id: string) =>
    req<{ idea: Idea; project: Project }>(`/ideas/${id}/promote`, { method: "POST" }),
},
```

- [ ] **Step 4: Create `client/src/pages/Ideas.tsx`**

Two-pane layout:
```typescript
// Left pane — 280px fixed width
<div className="w-[280px] border-r border-border h-[calc(100vh-0px)] flex flex-col">
  {/* Header with "New Idea" button */}
  <div className="p-4 border-b border-border flex items-center justify-between">
    <h1 className="font-semibold text-sm">Ideas</h1>
    <Button size="sm" onClick={() => { setSelected(null); setComposing(true); }}>New</Button>
  </div>
  {/* Idea list */}
  <ScrollArea className="flex-1">
    {ideas.map(idea => (
      <button key={idea.id}
        onClick={() => { setSelected(idea); setComposing(false); }}
        className={cn(
          "w-full text-left p-3 border-b border-border hover:bg-secondary/50 transition-colors",
          selected?.id === idea.id && "bg-secondary ring-1 ring-inset ring-border"
        )}>
        <p className="text-sm font-medium truncate">{idea.title}</p>
        <div className="flex items-center gap-2 mt-1">
          <Badge variant="outline" className={cn("text-xs",
            idea.status === "promoted" ? "border-success/30 text-success" : "border-border text-muted-foreground")}>
            {idea.status}
          </Badge>
          <span className="text-xs text-muted-foreground">
            {new Date(idea.created_at).toLocaleDateString()}
          </span>
        </div>
      </button>
    ))}
    {ideas.length === 0 && (
      <Empty icon={<Lightbulb size={24} />} title="No ideas yet" sub="Capture your first idea." />
    )}
  </ScrollArea>
</div>

// Right pane — flex-1
<div className="flex-1 p-6 overflow-auto">
  {composing ? <IdeaComposer onSave={handleSave} onCancel={() => setComposing(false)} /> :
   selected ? <IdeaDetail idea={selected} onUpdate={handleUpdate} onDelete={handleDelete} onPromote={handlePromote} /> :
   <Empty icon={<Lightbulb size={32} />} title="Select an idea" sub="Or create a new one." />}
</div>
```

`IdeaComposer`: large `<Input>` (text-lg font-semibold, no border, placeholder "Idea title...") + `<Textarea>` (min-h-[200px], no border, placeholder "Describe the idea...") + save/cancel buttons. On save: `createIdea.mutate(...)`.

`IdeaDetail`: title (editable on pencil click), status `<Badge>`, body text, `font-mono text-xs text-muted-foreground` timestamp. `<CardFooter>` with:
- "Edit" ghost button → enables editing
- "Promote to Project" secondary button (disabled if already promoted) → `promoteIdea.mutate(idea.id)` → on success `invalidateQueries(["ideas"])` + `invalidateQueries(["projects"])` + `invalidateQueries(["dashboard"])` + navigate to new project
- "Delete" destructive ghost button → confirmation then delete

- [ ] **Step 5: Update `client/src/App.tsx`**

```typescript
import Ideas from "@/pages/Ideas";
<Route path="/ideas" element={<Ideas />} />
```

- [ ] **Step 6: Verify Ideas page**

1. Create a new idea — appears in left pane
2. Click idea → detail shows in right pane
3. Edit title/body → saves
4. Promote → navigates to new project at `/projects/:id`
5. Promoted idea shows "promoted" badge; Promote button is disabled
6. Dashboard idea count decreases after promotion (status changes from 'raw')

- [ ] **Step 7: Commit**

```bash
git add .
git commit -m "feat: Ideas page — two-pane layout, create/edit/delete/promote flow"
```

---

## Task 11: Files

**Files:**
- Create: `server/src/routes/files.ts`
- Modify: `server/src/index.ts` (mount files router)
- Modify: `client/src/lib/api.ts` (add files endpoints)
- Create: `client/src/pages/Files.tsx`
- Modify: `client/src/pages/ProjectDetail.tsx` (implement Files tab)
- Modify: `client/src/App.tsx` (replace Files placeholder)

- [ ] **Step 1: Create `server/src/routes/files.ts`**

```typescript
import { Hono } from "hono";
import { db } from "../db/index.ts";
import { requireAuth } from "../middleware/auth.ts";
import { join } from "path";
import { mkdir } from "fs/promises";
import type { FileRecord } from "../types/index.ts";

const UPLOADS_DIR = process.env.UPLOADS_DIR ?? "./uploads";

const router = new Hono<{ Variables: { userId: string } }>();
router.use("*", requireAuth);

// GET /api/files?projectId=
router.get("/", (c) => {
  const projectId = c.req.query("projectId");
  const files = projectId
    ? db.query<FileRecord, [string, string]>(
        "SELECT * FROM files WHERE project_id = ? AND user_id = ? ORDER BY uploaded_at DESC"
      ).all(projectId, c.get("userId"))
    : db.query<FileRecord, [string]>(
        "SELECT * FROM files WHERE user_id = ? ORDER BY uploaded_at DESC"
      ).all(c.get("userId"));
  return c.json(files);
});

// POST /api/files?projectId= — multipart upload
router.post("/", async (c) => {
  const projectId = c.req.query("projectId") ?? null;
  const formData = await c.req.formData();
  const file = formData.get("file") as File | null;
  if (!file) return c.json({ error: "file required" }, 400);

  await mkdir(UPLOADS_DIR, { recursive: true });

  const ext = file.name.split(".").pop() ?? "";
  const filename = `${crypto.randomUUID()}${ext ? `.${ext}` : ""}`;
  const dest = join(UPLOADS_DIR, filename);

  await Bun.write(dest, file);

  const id = crypto.randomUUID();
  db.run(
    "INSERT INTO files (id, project_id, user_id, filename, original_name, mimetype, size, uploaded_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    [id, projectId, c.get("userId"), filename, file.name, file.type, file.size, Date.now()]
  );

  return c.json(db.query<FileRecord, [string]>("SELECT * FROM files WHERE id = ?").get(id), 201);
});

// GET /api/files/:id/download
router.get("/:id/download", async (c) => {
  const file = db.query<FileRecord, [string, string]>(
    "SELECT * FROM files WHERE id = ? AND user_id = ?"
  ).get(c.req.param("id"), c.get("userId"));
  if (!file) return c.json({ error: "Not found" }, 404);

  const path = join(UPLOADS_DIR, file.filename);
  const bunFile = Bun.file(path);
  if (!(await bunFile.exists())) return c.json({ error: "File not found on disk" }, 404);

  c.header("Content-Disposition", `attachment; filename="${file.original_name}"`);
  c.header("Content-Type", file.mimetype || "application/octet-stream");
  return new Response(bunFile);
});

// DELETE /api/files/:id
router.delete("/:id", async (c) => {
  const file = db.query<FileRecord, [string, string]>(
    "SELECT * FROM files WHERE id = ? AND user_id = ?"
  ).get(c.req.param("id"), c.get("userId"));
  if (!file) return c.json({ error: "Not found" }, 404);

  const path = join(UPLOADS_DIR, file.filename);
  try {
    await Bun.file(path).exists() && (await import("fs/promises")).unlink(path);
  } catch {
    // If disk file is already gone, still delete DB record
  }

  db.run("DELETE FROM files WHERE id = ?", [file.id]);
  return c.json({ ok: true });
});

export default router;
```

- [ ] **Step 2: Mount files router**

```typescript
import filesRouter from "./routes/files.ts";
app.route("/api/files", filesRouter);
```

- [ ] **Step 3: Add files to `client/src/lib/api.ts`**

File upload requires `FormData` — don't set `Content-Type` header (browser sets it with boundary):

```typescript
files: {
  list: (projectId?: string) =>
    req<FileRecord[]>(`/files${projectId ? `?projectId=${projectId}` : ""}`),
  upload: async (file: File, projectId?: string): Promise<FileRecord> => {
    const form = new FormData();
    form.append("file", file);
    const url = `/api/files${projectId ? `?projectId=${projectId}` : ""}`;
    const res = await fetch(url, { method: "POST", body: form, credentials: "include" });
    if (!res.ok) throw new Error((await res.json()).error);
    return res.json();
  },
  downloadUrl: (id: string) => `/api/files/${id}/download`,
  delete: (id: string) => req<{ ok: true }>(`/files/${id}`, { method: "DELETE" }),
},
```

Note: `upload` bypasses the `req()` helper because `FormData` must not have `Content-Type: application/json`.

- [ ] **Step 4: Create `client/src/pages/Files.tsx`** (global files page)

```typescript
// Grid/list toggle state
const [view, setView] = useState<"grid" | "list">("grid");
const [isDragging, setIsDragging] = useState(false);

// Drop zone handlers
const handleDrop = (e: React.DragEvent) => {
  e.preventDefault();
  setIsDragging(false);
  const files = Array.from(e.dataTransfer.files);
  files.forEach(f => uploadFile.mutate(f));
};

// Drop zone card
<Card
  className={cn(
    "border-2 border-dashed border-border transition-colors cursor-pointer",
    isDragging && "border-primary bg-primary/5"
  )}
  onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
  onDragLeave={() => setIsDragging(false)}
  onDrop={handleDrop}
  onClick={() => fileInputRef.current?.click()}
>
  <CardContent className="py-10 text-center">
    <Upload size={24} className="mx-auto text-muted-foreground mb-2" />
    <p className="text-sm text-muted-foreground">Drop files here or click to upload</p>
  </CardContent>
</Card>
<input ref={fileInputRef} type="file" multiple className="hidden"
  onChange={e => Array.from(e.target.files ?? []).forEach(f => uploadFile.mutate(f))} />

// Grid view — 5 column
<div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
  {files.map(file => (
    <Card key={file.id} className="group cursor-pointer hover:shadow-md transition-shadow">
      <CardContent className="p-3 text-center">
        <FileIcon mimetype={file.mimetype} />
        <p className="text-xs truncate mt-1.5 font-medium">{file.original_name}</p>
        <p className="text-xs text-muted-foreground">{formatBytes(file.size)}</p>
        <div className="flex gap-1 mt-2 opacity-0 group-hover:opacity-100 transition-opacity justify-center">
          <Button variant="ghost" size="icon" className="h-6 w-6" asChild>
            <a href={api.files.downloadUrl(file.id)} download={file.original_name}><Download size={11} /></a>
          </Button>
          <Button variant="ghost" size="icon" className="h-6 w-6 hover:text-destructive"
            onClick={() => deleteFile.mutate(file.id)}><Trash2 size={11} /></Button>
        </div>
      </CardContent>
    </Card>
  ))}
</div>

// List view — divide-y rows
<Card>
  <div className="divide-y divide-border">
    {files.map(file => (
      <div key={file.id} className="flex items-center gap-3 px-4 py-2.5 group">
        <FileIcon mimetype={file.mimetype} size={16} />
        <span className="text-sm flex-1 truncate">{file.original_name}</span>
        <span className="text-xs text-muted-foreground">{formatBytes(file.size)}</span>
        <span className="text-xs font-mono text-muted-foreground">
          {new Date(file.uploaded_at).toLocaleDateString()}
        </span>
        <div className="flex gap-1 opacity-0 group-hover:opacity-100">
          <Button variant="ghost" size="icon" className="h-7 w-7" asChild>
            <a href={api.files.downloadUrl(file.id)} download={file.original_name}><Download size={12} /></a>
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7 hover:text-destructive"
            onClick={() => deleteFile.mutate(file.id)}><Trash2 size={12} /></Button>
        </div>
      </div>
    ))}
  </div>
</Card>
```

`FileIcon` component: picks lucide icon based on mimetype (Image → ImageIcon, PDF → FileText, etc.)
`formatBytes(n)`: `n < 1024 ? n + " B" : n < 1024**2 ? (n/1024).toFixed(1) + " KB" : (n/1024**2).toFixed(1) + " MB"`

- [ ] **Step 5: Implement Files tab in `ProjectDetail.tsx`**

Same component as `Files.tsx` but pass `projectId` to `api.files.list(projectId)` and `api.files.upload(file, projectId)`. Can extract a shared `<FilesView projectId?: string>` component and use it in both pages.

Extract `FilesView` to `client/src/components/FilesView.tsx` and import in both `Files.tsx` and `ProjectDetail.tsx`.

- [ ] **Step 6: Update `client/src/App.tsx`**

```typescript
import Files from "@/pages/Files";
<Route path="/files" element={<Files />} />
```

- [ ] **Step 7: Verify Files**

```bash
# Upload a file via curl
curl -s -b /tmp/jar -X POST http://localhost:3001/api/files \
  -F "file=@/path/to/test.png" | jq .

# List files
curl -s -b /tmp/jar http://localhost:3001/api/files | jq .

# Download
FILE_ID=$(curl -s -b /tmp/jar http://localhost:3001/api/files | jq -r '.[0].id')
curl -s -b /tmp/jar -O -J "http://localhost:3001/api/files/$FILE_ID/download"
```

1. Drag and drop a file onto the drop zone → appears in grid
2. Toggle grid/list view
3. Download file — opens correct file
4. Delete file — removed from view
5. Files tab on ProjectDetail shows only that project's files

- [ ] **Step 8: Commit**

```bash
git add .
git commit -m "feat: Files — upload/download/delete routes, Files page + ProjectDetail Files tab"
```

---

## Task 12: Deployment

**Files:**
- Create: `Dockerfile`
- Create: `docker-compose.yml`
- Create: `deploy.sh`

- [ ] **Step 1: Create `Dockerfile`**

```dockerfile
# Stage 1: build
FROM oven/bun:1 AS builder
WORKDIR /app

COPY package.json bun.lockb* ./
COPY server/package.json ./server/
COPY client/package.json ./client/
RUN bun install --frozen-lockfile

COPY . .

RUN bun build client/src/main.tsx --outdir client/dist --minify
RUN cd client && bunx tailwindcss -i src/index.css -o dist/index.css --minify
COPY client/index.html client/dist/index.html

# Stage 2: runtime
FROM oven/bun:1-slim
WORKDIR /app

COPY --from=builder /app/server ./server
COPY --from=builder /app/client/dist ./client/dist
COPY --from=builder /app/node_modules ./node_modules

VOLUME ["/data", "/uploads"]

ENV DATABASE_PATH=/data/launchpad.db
ENV UPLOADS_DIR=/uploads
ENV PORT=3001

EXPOSE 3001

CMD ["bun", "server/src/index.ts"]
```

- [ ] **Step 2: Create `docker-compose.yml`**

```yaml
services:
  launchpad:
    build: .
    ports:
      - "3001:3001"
    volumes:
      - launchpad_data:/data
      - launchpad_uploads:/uploads
    env_file: .env
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3001/"]
      interval: 30s
      timeout: 10s
      retries: 3

volumes:
  launchpad_data:
  launchpad_uploads:
```

- [ ] **Step 3: Create `deploy.sh`**

```bash
#!/bin/bash
set -e

echo "Pulling latest changes..."
git pull origin main

echo "Building and starting containers..."
docker compose pull 2>/dev/null || true
docker compose up -d --build

echo "Removing unused images..."
docker image prune -f

echo "Done. Launchpad running at http://$(hostname -I | awk '{print $1}'):3001"
```

```bash
chmod +x deploy.sh
```

- [ ] **Step 4: Verify Docker build locally**

```bash
docker build -t launchpad-test .
```

Expected: build completes, no errors, image created.

- [ ] **Step 5: Verify Docker compose up**

```bash
docker compose up -d
```

Open `http://localhost:3001` — Login page loads.

Test full flow:
1. Register an account
2. Create a project
3. Log MRR, add a country, upload a file
4. Confirm data persists: `docker compose restart` → all data still there

- [ ] **Step 6: Verify data volume persistence**

```bash
docker compose down
docker compose up -d
# Navigate to app — all data should still be there
```

- [ ] **Step 7: Final commit**

```bash
git add .
git commit -m "feat: Dockerfile, docker-compose.yml, deploy.sh — production deployment ready"
```

---

## Appendix: Environment Variables

| Variable | Default | Description |
|---|---|---|
| `JWT_SECRET` | `dev-secret-change-me` | **Change for production** — long random string |
| `DATABASE_PATH` | `./launchpad.db` | SQLite file path |
| `UPLOADS_DIR` | `./uploads` | File storage directory |
| `PORT` | `3001` | HTTP port |

## Appendix: Common Stack Suggestions for TagInput

```typescript
const TECH_SUGGESTIONS = [
  "React", "Vue", "Svelte", "Next.js", "Nuxt", "SvelteKit",
  "Node.js", "Bun", "Deno", "Express", "Hono", "Fastify",
  "TypeScript", "JavaScript", "Python", "Go", "Rust",
  "PostgreSQL", "MySQL", "SQLite", "MongoDB", "Redis",
  "Tailwind CSS", "shadcn/ui", "Chakra UI", "MUI",
  "Stripe", "Supabase", "Firebase", "Vercel", "Railway",
  "Docker", "AWS", "Cloudflare", "Fly.io",
];
```

Use these as `suggestions` prop for `<TagInput>` in the New Project dialog.
