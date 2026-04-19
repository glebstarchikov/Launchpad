# Launchpad MCP Connector — Setup

The MCP connector lets Claude read your Launchpad project data and write build-log / tech-debt entries directly from any Claude client.

## 1. Server setup

Generate an API key and add it to your `.env`:

```bash
openssl rand -hex 32
# → copy the 64-character string
```

Edit `.env` (or the `environment` block in `docker-compose.yml`):

```
MCP_API_KEY=<paste the string>
```

Restart the service:

```bash
docker compose restart
# or, in dev:
bun dev
```

Your endpoint is now at: `https://<your-host>/api/mcp`

> The endpoint returns **503 mcp not configured** if `MCP_API_KEY` is empty. This is intentional — connecting without a key should fail loudly, not silently.

## 2. Claude Code (CLI)

```bash
claude mcp add launchpad \
  https://<your-host>/api/mcp \
  --header "Authorization: Bearer <your-key>"
```

Verify with `claude mcp list` and `claude mcp get launchpad`.

## 3. Claude Desktop

Open **Settings → Connectors → Add Custom Connector**:

- **Name:** Launchpad
- **URL:** `https://<your-host>/api/mcp`
- **Custom Headers:** `Authorization: Bearer <your-key>`

Click **Connect**. Claude should list 12 tools.

## 4. Claude.ai (web)

Same as Desktop — **Settings → Connectors → Custom Connector**. Paste the URL and add the `Authorization` header.

## Available tools

**Reads:**
- `list_projects` — all your projects (id, name, stage, url)
- `get_project_overview` — compact markdown snapshot of one project
- `get_build_log` — full build log (default 50, max 500 entries)
- `get_tech_debt` — tech debt items (open / resolved / all)
- `get_checklist` — launch checklist items
- `get_legal` — legal compliance items by country
- `get_goals` — active and completed goals with targets
- `get_mrr` — MRR history data points
- `get_github_commits` — recent commits from wired repos
- `get_site_health` — uptime monitoring status

**Writes (attributed to AI):**
- `append_build_log` — add an entry to a project's build log
- `add_tech_debt` — log a new tech debt item (also auto-appends a build log note)

Write actions appear with an "AI" pill in the Launchpad UI's build log — you can filter to them with the **AI** toggle above the build log feed.

## Rotating the key

Edit `.env`, replace `MCP_API_KEY`, restart the service. Remove the old value from each Claude client and re-add with the new one.

## Troubleshooting

- **401 unauthorized** — the `Authorization` header doesn't match `MCP_API_KEY`. Check for trailing whitespace.
- **503 mcp not configured** — `MCP_API_KEY` is empty or the env var didn't propagate. `docker compose restart` after `.env` changes.
- **503 no user found** — `LAUNCHPAD_USER_EMAIL` is set but doesn't match any user in the database. Fix the env var to your actual account email, or unset it to fall back to the first user.
- **400 malformed json** — the client sent a non-JSON body. Usually a client-side bug; try `mcp inspector` (`npx @modelcontextprotocol/inspector`) to confirm the endpoint round-trips a valid MCP message.
