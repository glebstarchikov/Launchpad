# Launchpad — Design Spec

**Date:** 2026-03-23
**Status:** Approved
**Type:** Self-hosted founder OS for indie founders and solo developers

---

## 1. Overview

Launchpad is a single-user, self-hosted web application that gives indie founders a unified workspace to track projects, manage compliance, log revenue, capture ideas, and store files. It runs as a single Docker container on a VPS, accessed directly by IP with no domain or reverse proxy required.

---

## 2. Stack

| Layer | Choice | Rationale |
|---|---|---|
| Runtime | Bun | Built-in SQLite, native TS execution, `Bun.password`, `Bun.serve`, `Bun.build`, `crypto.randomUUID()` |
| Backend | Hono | Typed middleware, edge-native, lightweight |
| Database | `bun:sqlite` | Zero deps, zero ops, no native compilation |
| Auth | `jose` | Pure-JS JWT, no native deps |
| Frontend | React 18 + `bun build` | No Vite, no webpack |
| Styling | Tailwind CSS + shadcn/ui | `bunx tailwindcss` CLI, shadcn for all components |
| Charts | Recharts | React-native, lightweight |
| Routing | react-router-dom v6 | |
| Data fetching | @tanstack/react-query v5 | |
| Icons | lucide-react | Bundled with shadcn |

**Zero native addons. Zero node-gyp. Zero Vite. Zero webpack. Everything through Bun.**

---

## 3. Project Structure

```
launchpad/
├── server/
│   ├── src/
│   │   ├── db/index.ts
│   │   ├── middleware/auth.ts
│   │   ├── routes/
│   │   │   ├── auth.ts
│   │   │   ├── projects.ts
│   │   │   ├── ideas.ts
│   │   │   ├── files.ts
│   │   │   └── misc.ts
│   │   ├── types/index.ts
│   │   └── index.ts
│   ├── package.json
│   └── tsconfig.json
│
├── client/
│   ├── src/
│   │   ├── lib/
│   │   │   ├── api.ts
│   │   │   ├── types.ts
│   │   │   ├── countries.ts
│   │   │   └── utils.ts
│   │   ├── components/
│   │   │   ├── ui/               ← shadcn components
│   │   │   ├── Layout.tsx
│   │   │   ├── Sidebar.tsx
│   │   │   └── app-ui.tsx
│   │   ├── pages/
│   │   │   ├── Login.tsx
│   │   │   ├── Dashboard.tsx
│   │   │   ├── Projects.tsx
│   │   │   ├── ProjectDetail.tsx
│   │   │   ├── Ideas.tsx
│   │   │   └── Files.tsx
│   │   ├── App.tsx
│   │   ├── main.tsx
│   │   └── index.css
│   ├── index.html
│   ├── components.json
│   ├── tailwind.config.ts
│   └── tsconfig.json
│
├── scripts/dev.ts
├── Dockerfile
├── docker-compose.yml
├── deploy.sh
├── .env.example
└── package.json          ← Bun workspace root (workspaces: ["server", "client"])
```

---

## 4. Dev Server Architecture

Single port **3001**. No proxy. No CORS config needed.

```
bun run dev
  └── server/src/index.ts  (bun --hot)
        ├── /api/*          → Hono routes
        ├── /*              → serves client/dist/ static files
        └── fallback        → client/dist/index.html (SPA)

  └── bunx tailwindcss --watch   (parallel)
  └── bun build --watch          (parallel, client/src/main.tsx → client/dist/bundle.js)
```

`scripts/dev.ts` spawns all three processes. The server hot-reloads on server file changes. Client changes require a manual browser refresh (no HMR — `bun build` only). Scaffold (slice 1) ensures `client/dist/` exists with a minimal HTML shell so the server has something to serve immediately.

---

## 5. Database Schema

SQLite via `bun:sqlite`. WAL mode enabled. Foreign keys ON. All `CREATE TABLE IF NOT EXISTS`. No migration tool — intentional.

`db/index.ts` runs all `CREATE TABLE IF NOT EXISTS` statements at server startup, every time. All 12 tables are created in a single initialization block regardless of which feature slice is active. This means all schema is available from slice 2 onwards.

- **IDs:** `crypto.randomUUID()`
- **Timestamps:** Unix milliseconds (`Date.now()`)
- **Booleans:** `0 | 1`
- **All FK deletes:** CASCADE

```sql
users
  id TEXT PK, name TEXT, email TEXT UNIQUE, password_hash TEXT,
  created_at INT, updated_at INT

projects
  id TEXT PK, user_id→users, name TEXT, description TEXT, url TEXT,
  type TEXT, stage TEXT, tech_stack TEXT (JSON array),
  last_deployed INT|null, created_at INT, updated_at INT

project_links
  id TEXT PK, project_id→projects, label TEXT, url TEXT, icon TEXT

project_countries
  id TEXT PK, project_id→projects, country_code TEXT, country_name TEXT

legal_items
  id TEXT PK, project_id→projects, country_code TEXT, item TEXT,
  completed INT (0|1), created_at INT

launch_checklist
  id TEXT PK, project_id→projects, item TEXT,
  completed INT (0|1), created_at INT

mrr_history
  id TEXT PK, project_id→projects, mrr INT, user_count INT, recorded_at INT

goals
  id TEXT PK, project_id→projects, description TEXT,
  target_value REAL, current_value REAL, unit TEXT|null,
  target_date INT|null, completed INT (0|1), created_at INT

ideas
  id TEXT PK, user_id→users, title TEXT, body TEXT,
  status TEXT ('raw'|'promoted'),
  promoted_to_project_id TEXT|null →projects,
  created_at INT, updated_at INT

notes
  id TEXT PK, project_id→projects, content TEXT,
  is_build_log INT (0|1), created_at INT

tech_debt
  id TEXT PK, project_id→projects, note TEXT,
  resolved INT (0|1), created_at INT

files
  id TEXT PK, project_id TEXT|null →projects, user_id→users,
  filename TEXT, original_name TEXT, mimetype TEXT,
  size INT, uploaded_at INT
```

---

## 6. Auth

- `Bun.password.hash()` / `Bun.password.verify()` for password storage
- 30-day JWT issued by `jose`, stored in httpOnly SameSite=Lax cookie
- `requireAuth` Hono middleware reads cookie, verifies JWT, sets `c.set("userId", ...)`
- Frontend: `credentials: "include"` on all fetch calls
- React Query `["me"]` query on mount → 401 redirects to `/login`
- No `localStorage` / `sessionStorage`

---

## 7. API Routes

All under `/api`. `requireAuth` on all except auth endpoints. Response conventions:
- Success with data: return resource object or array
- Success without data: `{ ok: true }`
- Error: `{ error: string }`

```
POST   /api/auth/register
POST   /api/auth/login
POST   /api/auth/logout
GET    /api/auth/me

GET    /api/dashboard
POST   /api/ping

GET    /api/projects
POST   /api/projects
GET    /api/projects/:id
PUT    /api/projects/:id
DELETE /api/projects/:id

GET    /api/projects/:id/links
POST   /api/projects/:id/links
DELETE /api/projects/:id/links/:linkId

GET    /api/projects/:id/countries
POST   /api/projects/:id/countries        ← auto-seeds legal_items
DELETE /api/projects/:id/countries/:cId

GET    /api/projects/:id/legal
POST   /api/projects/:id/legal
PUT    /api/projects/:id/legal/:itemId
DELETE /api/projects/:id/legal/:itemId

GET    /api/projects/:id/launch-checklist
POST   /api/projects/:id/launch-checklist
PUT    /api/projects/:id/launch-checklist/:itemId
DELETE /api/projects/:id/launch-checklist/:itemId

GET    /api/projects/:id/mrr
POST   /api/projects/:id/mrr

GET    /api/projects/:id/goals
POST   /api/projects/:id/goals
PUT    /api/projects/:id/goals/:goalId
DELETE /api/projects/:id/goals/:goalId

GET    /api/projects/:id/notes
POST   /api/projects/:id/notes
DELETE /api/projects/:id/notes/:noteId

GET    /api/projects/:id/tech-debt
POST   /api/projects/:id/tech-debt
PUT    /api/projects/:id/tech-debt/:debtId
DELETE /api/projects/:id/tech-debt/:debtId

GET    /api/ideas
POST   /api/ideas
PUT    /api/ideas/:id
DELETE /api/ideas/:id
POST   /api/ideas/:id/promote

GET    /api/files?projectId=
POST   /api/files?projectId=
GET    /api/files/:id/download
DELETE /api/files/:id
```

**Route file mapping:**
- `auth.ts` → all `/api/auth/*` routes
- `projects.ts` → all `/api/projects/*` routes
- `ideas.ts` → all `/api/ideas/*` routes
- `files.ts` → all `/api/files/*` routes
- `misc.ts` → `GET /api/dashboard`, `POST /api/ping`

**Special behaviors:**
- `POST /api/projects` — after inserting the project, seeds `launch_checklist` with the 15 default items from section 9
- `POST /api/projects/:id/countries` — inserts country, then seeds `legal_items` from `LEGAL_REQUIREMENTS` map for that country code (skips if items already exist for that country). `DELETE /api/projects/:id/countries/:cId` removes the country row; FK CASCADE automatically removes all associated `legal_items` rows — no extra cleanup needed
- `GET /api/projects/:id/links` / `POST` / `DELETE` — links are add/delete-only; no PUT. The label and URL set at creation time are immutable
- `GET /api/projects/:id/notes` — returns all notes for the project regardless of `is_build_log` value. Filtering to build log entries is done client-side (`notes.filter(n => n.is_build_log === 1)`)
- `POST /api/ping` — performs live HTTP fetch to project URL, returns `{ status: "up"|"down", latencyMs: number }`
- `GET /api/dashboard` — single aggregated query: total MRR (latest entry per project), project count, raw idea count, pending legal item count, stage distribution, 5 most recent projects

---

## 8. Country → Legal Auto-Seed

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
}
```

---

## 9. Launch Checklist — Default Seed

Seeded when a new project is created:

```
Custom domain connected · SSL certificate active · Privacy Policy published ·
Terms of Service published · OG meta tags set · Favicon uploaded ·
Analytics wired up · Error tracking connected · Payment flow tested end-to-end ·
Email transactional flow tested · Mobile responsiveness checked ·
Lighthouse score > 80 · 404 page exists · Uptime monitor set ·
Backup strategy in place
```

---

## 10. TypeScript Types

Defined once in `server/src/types/index.ts`, mirrored exactly in `client/src/lib/types.ts`.

```typescript
type ProjectStage = "idea" | "building" | "beta" | "live" | "growing" | "sunset"
type ProjectType  = "for-profit" | "open-source"
type IdeaStatus   = "raw" | "promoted"
```

DB booleans typed as `0 | 1`. Nullable fields typed as `T | null`.

---

## 11. Design System

### Philosophy
Always-dark. Colour communicates meaning, not decoration. Base palette is near-black with precise grey steps. Each semantic colour is used only for its meaning — never decoratively.

### CSS Variables (defined in `index.css`)

```css
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
  /* secondary text / body text / descriptions — used as text-[hsl(var(--ink-2))] */
  --ink-2:                0 0% 63%;
  --primary:              0 0% 100%;
  --primary-foreground:   0 0% 3.9%;
  --secondary:            0 0% 8.6%;
  /* shadcn convention: foreground text on --secondary button background */
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
}
```

### Stage → Colour Mapping
```
idea     → muted-foreground on muted
building → info (#0ea5e9)
beta     → purple (#a78bfa)
live     → success (#3ecf8e)
growing  → warning (#f59e0b)
sunset   → muted-foreground, opacity 60%
```

### Type → Colour Mapping
```
for-profit   → warning (#f59e0b)
open-source  → purple (#a78bfa)
```

**`--ink-2` usage:** Secondary text, body copy, descriptions — apply as `text-[hsl(var(--ink-2))]` or via a `text-ink-2` Tailwind utility in `tailwind.config.ts`. Do not confuse with `--secondary-foreground`, which is text on the secondary button background.

### Typography
- Font: Geist / Geist Mono (`geist` npm package)
- Base: 14px, line-height 1.5
- Headings: letter-spacing `-0.02em`

### Shadows
```css
--shadow-sm: 0 1px 2px rgba(0,0,0,0.4);
--shadow-md: 0 4px 8px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.04);
--shadow-lg: 0 8px 24px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.06);
--shadow-xl: 0 24px 64px rgba(0,0,0,0.8), 0 0 0 1px rgba(255,255,255,0.06);
```
Cards use `shadow-md`. Modals/dropdowns use `shadow-xl`. No coloured glow shadows.

---

## 12. shadcn Components

Installed into `client/src/components/ui/`:

```
button · input · textarea · label · badge · card · dialog ·
dropdown-menu · select · separator · switch · tabs ·
tooltip · progress · scroll-area · avatar · checkbox
```

Config (`components.json`): style=default, baseColor=zinc, cssVariables=true, tsx=true.

All UI built on shadcn. Raw `<button>` / `<input>` never used. Extensions via `cn()` from `@/lib/utils`.

---

## 13. App-Specific Primitives (`app-ui.tsx`)

```typescript
StageBadge({ stage })        // wraps shadcn Badge with stage colour
TypeBadge({ type })          // wraps shadcn Badge with type colour
PingDot({ status })          // up=success+animate-pulse, down=destructive, null=muted
Empty({ icon, title, sub, action })  // empty state with optional CTA
fmt(n: number): string       // 1200 → "$1.2k"
STAGE_META                   // record of stage label + variant
TagInput(...)                // shadcn Input + Badge + Popover/Command autocomplete
```

---

## 14. Pages

### Login
Centred card (max-width 400px). Launchpad wordmark + Rocket icon (no colour). shadcn Card with form. Toggle register/login via plain text link. Error via `<Alert variant="destructive">`.

### Dashboard
- **4 stat cards** (lg:4-col, md:2-col): Total MRR (success), Projects (foreground), Idea Inbox (warning), Legal Pending (destructive)
- **Pipeline bar**: segmented progress bar — each stage a coloured segment proportional to count
- **Recent Projects**: rows with name + StageBadge + TypeBadge + URL + chevron
- **Idea Inbox preview**: up to 5 raw ideas, empty state if none

### Projects
- Filter row: search input + stage pills + type pills
- Grid: 1/2/3 columns. Cards with tech stack badges, stage + type badges
- New Project: Dialog with stage/type Select, TagInput for tech stack

### ProjectDetail
Sticky header: breadcrumb + badges + Visit button. 6 tabs via shadcn Tabs:

**Overview tab**
- Left (2/3): Project info card (inline edit — fields swap to inputs on pencil click, saved as a whole via a single "Save" button that calls `PUT /api/projects/:id`), Launch checklist card (Progress bar + Checkboxes + add-item input)
- Right (1/3): Links Hub card (preset chips + add form + delete on hover; links are add/delete-only, no inline edit), Danger Zone card

**Health tab**
- Site Status card: URL + PingDot + ping result + "Ping Now" button
- Tech Debt card: Checkbox items (warning border if unresolved, success if resolved) + add-item form

**Revenue tab** (hidden for open-source)
- 3 stat cards: Current MRR (success), Users (foreground), ARR (info)
- MRR chart: Recharts AreaChart with success colour stroke + gradient fill
- Log entry card: MRR + user count inputs + submit
- Goals card: Checkbox per goal + target value with unit label in mono + deadline in muted + add via Dialog (fields: description, target_value, unit, current_value, target_date)

**Compliance tab**
- Add country card: Select + primary button
- Active countries as Badge chips with remove
- Per-country card: flag (Unicode emoji regional indicator derived from `country_code`, no library) + name, Progress bar, Checkbox list, "Add custom item" ghost button

**Build Log tab**
- Reverse-chronological feed of notes where `is_build_log = 1`
- Composer: Textarea + Switch ("Mark as build log entry") + submit
- If switch off: note is saved as a plain note (not shown in feed)
- Entries displayed as Cards with timestamp in muted mono

**Files tab**
- Drop zone Card: dashed border, transitions to `border-primary` on drag
- Grid/list toggle (ghost icon buttons)
- Grid: 5-col icon cells. List: divide-y rows. Both show filename, size, upload date, delete button

### Ideas
Two-pane layout. Left (280px): ScrollArea with idea Cards (hover/active ring). Right: composer (Input title, Textarea body) or detail view (title, status Badge, body, timestamp, actions in CardFooter). Promote action creates a new project from the idea.

### Files (global)
Same as Files tab but scoped to all files. Supports `?projectId=` filter.

---

## 15. Sidebar

Fixed left, 240px wide, full height.
- `bg-background border-r border-border`
- Logo: Rocket icon (16px, no colour) + "Launchpad" Geist Bold 15px
- Nav items: `Button variant="ghost"` with `justify-start gap-3 w-full`. Active = `bg-secondary text-foreground` + `border-l-2 border-foreground`. Inactive = `text-muted-foreground`
- User row: Avatar (initials) + name + email + logout ghost icon button

---

## 16. Frontend Conventions

- `cn()` from `@/lib/utils` on every element with conditional classes
- React Query keys: `["resource"]` for lists, `["resource", id]` for singles
- Always invalidate `["dashboard"]` after any mutation affecting stats
- After `POST /api/ideas/:id/promote`, also invalidate `["projects"]` — promote creates a new project, which would otherwise leave the Projects page stale
- `useMutation` for all writes — never bare `api.*` calls in event handlers
- No `any` without inline explanation comment

---

## 17. File Storage

Files stored on disk at `UPLOADS_DIR` (env var, defaults to `./uploads`). Served via `/api/files/:id/download` — never exposed directly. In Docker: named volume `launchpad_uploads` mounted at `/uploads`.

---

## 18. Build Slices (Vertical, Option A)

| # | Slice | Deliverable |
|---|---|---|
| 1 | Scaffolding | Directory structure, package.json files, tsconfigs, tailwind, shadcn config, scripts/dev.ts, .env.example, minimal client/dist shell |
| 2 | DB + Auth | Schema init, users table, register/login/logout/me, JWT middleware, Login page |
| 3 | Projects CRUD | projects table + routes, Projects page + New Project dialog, all shadcn components |
| 4 | Dashboard | Dashboard route + aggregation query, Dashboard page (stat cards, pipeline bar, recent projects, idea preview) |
| 5 | ProjectDetail shell + Overview tab | Sticky header, tab scaffold, Overview tab (info, links, checklist) |
| 6 | Health tab | Ping route, tech debt routes, Health tab UI |
| 7 | Revenue tab | MRR + goals routes, Revenue tab UI with Recharts |
| 8 | Compliance tab | Countries + legal auto-seed routes, Compliance tab UI |
| 9 | Build Log + Notes tab | Notes routes, Build Log tab UI with Switch |
| 10 | Ideas | Ideas + promote routes, Ideas page (two-pane) |
| 11 | Files | File upload/download/delete routes (disk), Files page (drag-drop, grid/list) |
| 12 | Deployment | Multi-stage Dockerfile, docker-compose.yml, deploy.sh |

---

## 19. Deployment

```dockerfile
# Stage 1: build
FROM oven/bun:1 AS builder
WORKDIR /app
COPY . .
RUN bun install
RUN bun build client/src/main.tsx --outdir client/dist --minify
RUN bunx tailwindcss -i client/src/index.css -o client/dist/index.css --minify

# Stage 2: run
FROM oven/bun:1-slim
WORKDIR /app
COPY --from=builder /app/server ./server
COPY --from=builder /app/client/dist ./client/dist
# Bun workspaces hoist all dependencies to root node_modules — no sub-package node_modules to copy
COPY --from=builder /app/node_modules ./node_modules
VOLUME ["/data", "/uploads"]
ENV DATABASE_PATH=/data/launchpad.db
ENV UPLOADS_DIR=/uploads
EXPOSE 3001
CMD ["bun", "server/src/index.ts"]
```

```yaml
# docker-compose.yml
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

volumes:
  launchpad_data:
  launchpad_uploads:
```

Access at `http://YOUR_VPS_IP:3001`. No Caddy, no nginx, no TLS.

---

## 20. What NOT To Do

- No Vite, webpack, Rollup, Parcel
- No `better-sqlite3`, `bcryptjs`, `uuid`, `multer`
- No `localStorage` / `sessionStorage`
- No custom modal logic — shadcn `<Dialog>` only
- No raw `<button>` or `<input>`
- No migration tool
- No team/multi-user features
- No coloured glow box-shadows
- No single accent colour — every colour carries semantic meaning
- No `any` without inline explanation
- No placeholder content or TODO comments
