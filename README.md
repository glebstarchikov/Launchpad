# Launchpad

A self-hosted founder command center. Track your projects, ideas, revenue, legal compliance, tech debt, and daily activity — all in one place. Single-user by design, privacy-first, runs on your own server.

## Features

- **Project pipeline** — stage-aware tracker (idea → building → beta → live → growing → sunset)
- **Idea inbox** — capture raw ideas before they slip away
- **MRR tracking** — revenue history with month-over-month scoreboard
- **Launch checklist** — 80+ curated items by category and stage, for-profit or open-source flavored
- **Tech debt tracker** — log, categorize, and resolve technical debt by severity and effort
- **Goals** — set targets with progress tracking
- **Legal compliance** — curated catalog for 12+ countries + EU (GDPR, Russian 152-FZ, etc.) with LLM-powered review
- **GitHub integration** — connect repos to see commits, PRs, and issues per project
- **News feed** — Hacker News + RSS with LLM relevance scoring
- **Telegram bot** — capture ideas via message; receive a morning briefing with yesterday's activity + top signals
- **File storage** — attach files to projects
- **Dashboard** — stat cards, pipeline, action items triage, activity feed, and month-over-month scoreboard

## Stack

- **Runtime:** [Bun](https://bun.sh)
- **Backend:** [Hono](https://hono.dev) on Bun
- **Database:** SQLite via `bun:sqlite` (no ORM — raw SQL with migrations)
- **Frontend:** React 18 + TypeScript + React Router v6 + TanStack Query v5
- **Styling:** Tailwind CSS + shadcn/ui

## Self-hosting with Docker (recommended)

**Requirements:** Docker + Docker Compose

```bash
# 1. Clone the repo
git clone https://github.com/glebstarchikov/Launchpad.git
cd Launchpad

# 2. Create your .env file
cp .env.example .env
# Edit .env — at minimum set JWT_SECRET and LAUNCHPAD_USER_EMAIL

# 3. Generate a secure JWT_SECRET
openssl rand -hex 32

# 4. Start
docker compose up -d

# 5. Open http://localhost:3001 and register your account
```

> **Important:** Register your account immediately after the first start. Registration is permanently closed once the first user exists — this is by design for a single-user app.

Data is persisted in Docker volumes (`launchpad_data` for the SQLite DB, `launchpad_uploads` for files).

### Pre-built image (faster)

Skip the build step by using the pre-built image from GitHub Container Registry. Replace the `build: .` line in `docker-compose.yml` with:

```yaml
image: ghcr.io/glebstarchikov/launchpad:latest
```

## Self-hosting with Coolify

1. New Resource → Application → select your GitHub repo → branch `main`
2. **General tab:**
   - Build Pack: `Docker Image`
   - Docker Image: `ghcr.io/glebstarchikov/launchpad:latest`
   - Ports Exposes: `3001`
3. **Environment Variables tab** → click **Developer view** → paste the contents of `.env.example` and fill in your values
4. **Persistent Storage tab** → add two volumes:
   - Destination: `/data` (SQLite database)
   - Destination: `/uploads` (file attachments)
5. Deploy — then open the URL and register your account immediately

> The pre-built image (`ghcr.io/glebstarchikov/launchpad:latest`) is updated automatically on every push to `main` via GitHub Actions.

## Local development

**Requirements:** [Bun](https://bun.sh) ≥ 1.0

```bash
bun install
cp .env.example .env   # edit as needed
bun dev
# Open http://localhost:3001
```

## Environment variables

See [`.env.example`](.env.example) for the full list with comments. Required:

| Variable | Description |
|---|---|
| `JWT_SECRET` | Long random string — generate with `openssl rand -hex 32` |
| `LAUNCHPAD_USER_EMAIL` | Your login email — must match the email you registered with; used by the Telegram bot and cron |

Optional integrations:

| Variable | Description |
|---|---|
| `LLM_PROVIDER` | `anthropic` or `ollama` (default) |
| `LLM_API_KEY` | Anthropic API key (if using anthropic provider) |
| `GITHUB_PAT` | GitHub personal access token (repo:read scope) |
| `TELEGRAM_BOT_TOKEN` | Telegram bot token from @BotFather |
| `TELEGRAM_CHAT_ID` | Your Telegram chat ID (from @userinfobot) |
| `TELEGRAM_BRIEF_HOUR` | Hour (0–23) for morning briefing in server local time (default: 9) |
| `UPTIMEROBOT_API_KEY` | UptimeRobot API key for site-down action items |
| `WHISPER_MODEL_PATH` | Path to whisper.cpp model for voice idea capture |

## LLM features

Launchpad optionally uses an LLM for:
- Daily morning briefing summary (via Telegram)
- Legal compliance item personalization when adding a country
- On-demand legal compliance review (diff against curated catalog)

**Ollama (local, free):**
```bash
ollama serve
ollama pull llama3.1
# .env: LLM_PROVIDER=ollama
```

**Anthropic:**
```bash
# .env:
# LLM_PROVIDER=anthropic
# LLM_API_KEY=sk-ant-...
```

## Telegram bot setup

1. Create a bot via [@BotFather](https://t.me/botfather) → get `TELEGRAM_BOT_TOKEN`
2. Get your chat ID via [@userinfobot](https://t.me/userinfobot) → set `TELEGRAM_CHAT_ID`
3. Set both in `.env` and restart

Once configured:
- Send any message to the bot → saved as an idea in Launchpad
- Every morning at `TELEGRAM_BRIEF_HOUR` (default: 9 AM server time) → briefing with yesterday's summary + top news signals

## Upgrading

Schema migrations run automatically on startup. Pull and restart:

```bash
git pull
docker compose up -d --build
```

## Tests

```bash
bun test server/tests/
```

## License

MIT — see [LICENSE](LICENSE)
