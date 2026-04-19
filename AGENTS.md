# Repository Guidelines

Launchpad is a self-hosted project management app for solopreneurs, built as a monorepo with Bun workspaces. This file captures the conventions any AI coding agent (Claude, Gemini, Cursor, Copilot) should follow when working on this codebase.

## Project structure

- `client/` — React SPA (`pages/`, `components/`, `hooks/`, `lib/`). UI primitives live in `components/ui/` (shadcn). Path alias `@/*` maps to `client/src/*`.
- `server/` — Hono API + business logic.
  - `routes/` — one file per domain (`auth.ts`, `projects.ts`, `ideas.ts`, `mcp.ts`, etc.)
  - `lib/` — pure library functions, injectable DB (see `context.ts`, `cron.ts`, `mcp-tools.ts`)
  - `db/` — schema init + migrations (in-code, keyed by `PRAGMA user_version`)
  - `middleware/` — `auth.ts` (JWT verification, attaches `userId` to Hono context)
  - `tests/` — `bun:test` with in-memory SQLite via `createTestDb()` pattern
- `docs/` — `mcp-setup.md` and (gitignored) superpowers specs/plans
- `scripts/` — one-off maintenance scripts (`reset-password.ts`, etc.)

## Tech stack

- **Runtime** — Bun
- **Backend** — Hono on Bun; raw SQL via `bun:sqlite`; in-code migrations
- **Frontend** — React 18 + TypeScript + React Router v6 + TanStack Query v5
- **Styling** — Tailwind CSS + shadcn/ui
- **AI** — Anthropic Claude (configurable: Anthropic / Ollama / OpenAI-compatible)

## Conventions

- **SQL:** raw parameterized queries, no ORM. All user-scoped queries filter by `user_id` for authorization. Use `?` placeholders — never string-interpolate user input.
- **Migrations:** in-code at `server/src/db/migrations.ts`, keyed by `PRAGMA user_version`. Never modify an existing migration body — add a new entry.
- **Errors:** library functions throw `Error` (or `McpToolError` for user-visible failures). Routes catch and map to HTTP status. Same message for "not found" and "not owned" — no ownership leak.
- **Tests:** `bun:test` with in-memory SQLite. Use the `createTestDb()` helper pattern. Library functions take an injectable `database` parameter (`fn(userId, ..., database = defaultDb)`).
- **Commits:** Conventional Commits with scope (`feat(mcp): ...`, `fix(context): ...`). See `CONTRIBUTING.md`.

## Useful commands

```bash
bun install
bun dev                                       # concurrent server + tailwind + client bundler
bun build                                     # production client bundle to client/dist/
bun test server/tests/
bunx tsc --noEmit -p server/tsconfig.json
bunx tsc --noEmit -p client/tsconfig.json
```

## Before you commit

- Tests pass: `bun test server/tests/`
- Typecheck passes for both workspaces
- `.env` and `*.db*` files stay out of the working index (both are gitignored — do not force-add)

## Data flow

1. React component calls `api.something.method()` via TanStack Query (`useQuery` / `useMutation`).
2. `client/src/lib/api.ts` makes `fetch()` to `/api/...` with `credentials: "include"`.
3. Hono route runs auth middleware (attaches `userId` to context), executes SQL, returns JSON.
4. TanStack Query caches the response (default 30s stale time).

## Database conventions

- IDs are UUIDs stored as TEXT (`crypto.randomUUID()`)
- Timestamps are Unix epoch integers (milliseconds via `Date.now()`)
- `tech_stack` on projects is a JSON string array
- All user-scoped queries filter by `user_id`
- SQLite WAL mode and foreign keys are enabled at startup
