# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Launchpad is a full-stack project management app for solopreneurs to track projects, ideas, finances, legal compliance, and technical debt. Single-user SPA with JWT auth.

## Tech Stack

- **Runtime:** Bun (used for bundling, running, and as package manager)
- **Frontend:** React 18 + TypeScript, React Router v6, TanStack React Query v5
- **Backend:** Hono (lightweight web framework on Bun)
- **Database:** SQLite via `bun:sqlite` (no ORM — raw SQL with prepared statements)
- **Styling:** Tailwind CSS 3.4 with CSS custom properties for theming
- **UI Components:** shadcn/ui (Radix UI primitives) — config in `client/components.json`
- **Icons:** lucide-react
- **Auth:** JWT with HTTP-only cookies (jose library), 30-day expiration

## Commands

```bash
bun install          # Install all workspace dependencies
bun dev              # Run dev server + client bundler + tailwind watcher concurrently
bun build            # Production build (client JS + CSS minified to client/dist/)
```

Tests run with `bun test server/tests/`. No linter is configured.

## Architecture

**Monorepo with two workspaces:** `client/` and `server/` (defined in root `package.json`).

### Server (`server/src/`)

Hono app that serves both the API and the built SPA (static files from `client/dist/`).

- **Entry:** `index.ts` — mounts route groups, serves static files, SPA fallback
- **Routes:** `routes/` — one file per domain (`auth.ts`, `projects.ts`, `ideas.ts`, `files.ts`, `misc.ts`)
- **Database:** `db/index.ts` — schema initialization via `CREATE TABLE IF NOT EXISTS` (11 tables, 13 indexes). No migration system; schema evolves by adding new `CREATE TABLE IF NOT EXISTS` and `ALTER TABLE` statements
- **Auth middleware:** `middleware/auth.ts` — JWT verification, attaches `userId` to Hono context
- **All API routes** are prefixed with `/api/`

### Client (`client/src/`)

React SPA using React Router for client-side routing.

- **Entry:** `main.tsx` — React root with QueryClientProvider and BrowserRouter
- **Router:** `App.tsx` — route definitions, auth gate (redirects unauthenticated users to `/login`)
- **Pages:** `pages/` — one component per route (`Dashboard`, `Projects`, `ProjectDetail`, `Ideas`, `Files`)
- **API layer:** `lib/api.ts` — typed `api` object wrapping `fetch()` calls with credentials and error handling
- **Types:** `lib/types.ts` — shared TypeScript interfaces for all entities
- **UI components:** `components/ui/` — shadcn components (do not edit directly; use `bunx shadcn@latest add <component>`)
- **Path alias:** `@/*` maps to `client/src/*` (configured in `tsconfig.json`)

### Data Flow Pattern

1. React component calls `api.something.method()` via TanStack Query (`useQuery`/`useMutation`)
2. `api.ts` makes `fetch()` to `/api/...` with credentials
3. Hono route handler runs auth middleware, executes raw SQL, returns JSON
4. TanStack Query caches the response (30s stale time default)

### Database Conventions

- IDs are UUIDs stored as TEXT
- Timestamps are Unix epoch integers (milliseconds)
- `tech_stack` on projects is a JSON string array
- All user-scoped queries filter by `user_id` for authorization
- SQLite WAL mode and foreign keys are enabled at startup

## Environment Variables

See `.env.example`. Required for production:

- `JWT_SECRET` — signing key for JWT tokens (has insecure dev default)
- `DATABASE_PATH` — SQLite file path (default: `./launchpad.db`)
- `UPLOADS_DIR` — file upload directory (default: `./uploads`)
- `PORT` — server port (default: `3001`)

## Deployment

Docker-based: `Dockerfile` (multi-stage bun build) + `docker-compose.yml`. Volumes for `/data` (database) and `/uploads` (files). Deploy script: `deploy.sh` (git pull + docker compose up).
