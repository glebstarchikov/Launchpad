# Contributing to Launchpad

Thanks for considering a contribution! Launchpad is a small project — every issue and PR helps.

## Quick start

```bash
git clone https://github.com/glebstarchikov/Launchpad && cd Launchpad
bun install
cp .env.example .env                # fill in your keys
bun dev                             # http://localhost:3001
```

At minimum set `JWT_SECRET` (`openssl rand -hex 32`) and `LAUNCHPAD_USER_EMAIL` in `.env`. LLM provider is optional (Ollama default; Anthropic opt-in). Telegram and GitHub integrations are optional. See [`.env.example`](.env.example) for the full reference.

## Before opening a PR

Run all of these and confirm they pass:

```bash
bun test server/tests/
bunx tsc --noEmit -p server/tsconfig.json
bunx tsc --noEmit -p client/tsconfig.json
```

If you change a UI component, also run `bun dev` and visually verify the change at desktop + phone widths.

## Conventions

### Commits — Conventional Commits with scope

```
feat(mcp): add transactional add_tech_debt write tool
fix(context): goals.completed=1 counts as met regardless of progress
refactor(db): extract assertOwnership helper
docs(mcp): add Claude Desktop setup steps
chore: bump dependencies
```

Scope is optional but encouraged. Past commit history shows the style.

### Architecture

For the overall repo layout, SQL and migration conventions, testing patterns, and data-flow expectations, see [AGENTS.md](AGENTS.md). That file is the primary source of truth for any coding agent (human or AI) working on this codebase.

### Pull requests

Keep PRs focused — one change per PR is ideal. Describe what and why in the body; our PR template covers the rest. Link related issues with `Fixes #N` or `Refs #N`.
