# Launchpad Daily Driver Features — Design Spec

**Date:** 2026-04-04
**Scope:** Three features that make Launchpad a daily-use tool: Voice Ideas Capture, News Intelligence Feed, Daily Auto-Summary. Plus the shared LLM provider abstraction they all depend on.

---

## 0. Shared: LLM Provider Abstraction

### Architecture
A simple provider interface that routes to Ollama (default) or any OpenAI-compatible API.

```typescript
interface LLMProvider {
  generateText(prompt: string, options?: { maxTokens?: number; temperature?: number }): Promise<string>;
}
```

### Configuration
Env vars control the provider:
- `LLM_PROVIDER=ollama` (default) or `LLM_PROVIDER=openai`
- `LLM_BASE_URL=http://localhost:11434/v1` (Ollama default) or `https://api.anthropic.com/v1` etc.
- `LLM_MODEL=llama3.1` (default) or `claude-haiku-4-5-20251001` etc.
- `LLM_API_KEY=` (empty for Ollama, required for cloud providers)

### Implementation
Use the OpenAI-compatible chat completions format since Ollama supports it natively (`/v1/chat/completions`). This means ANY OpenAI-compatible provider works out of the box — Ollama, OpenAI, Anthropic (via proxy), Groq, Together, etc.

Single file: `server/src/lib/llm.ts` — exports `generateText()`.

---

## 1. Voice Ideas Capture

### User Flow
1. User clicks a microphone button on the Ideas page (or a global floating button)
2. Browser starts recording audio via MediaRecorder API
3. User speaks their idea (no time limit, but practical max ~5 minutes)
4. User clicks stop → audio blob is sent to the server
5. Server transcribes audio using Whisper
6. A new idea is created with the transcript as body
7. The original audio file is saved as an attachment (via existing files system)

### Transcription Backend
- **Primary:** Whisper.cpp via command-line execution
  - Install: user runs `brew install whisper-cpp` (or downloads binary)
  - Model: `base.en` (~150MB) for English, `small` (~500MB) for multilingual
  - Server shells out: `whisper-cpp -m <model-path> -f <audio-file> --output-txt`
  - Falls back gracefully if whisper-cpp is not installed (shows error, idea is created with "[transcription unavailable]" and audio attached)
- **Configuration:**
  - `WHISPER_MODEL_PATH=/path/to/ggml-base.en.bin` (required for voice features)
  - If not set, voice recording is disabled in the UI (mic button hidden)

### Audio Format
- Browser records as WebM/Opus (default MediaRecorder format)
- Whisper.cpp needs WAV — server converts using `ffmpeg` (or accepts WAV directly if browser supports)
- Alternative: use WAV recording in browser via AudioWorklet to skip conversion

### API Endpoints
- `POST /api/ideas/voice` — accepts multipart form with audio file
  - Transcribes audio → creates idea → saves audio file
  - Returns `{ idea: Idea, transcript: string }`
- `GET /api/health/whisper` — checks if whisper-cpp is available
  - Returns `{ available: boolean, model: string | null }`

### UI
- Mic button on Ideas page header (next to "New" button)
- Recording state: pulsing red dot, elapsed time counter, "Stop" button
- After recording stops: shows "Transcribing..." spinner
- On success: new idea appears in the list, selected automatically
- The idea body shows the transcript; a small audio player widget lets you replay the original

### Dependencies
- `whisper-cpp` (user-installed binary, not bundled)
- `ffmpeg` (for audio format conversion, user-installed)

---

## 2. News Intelligence Feed

### Architecture
A background job (cron or manual trigger) fetches news from configured sources, filters by relevance to the user's projects, and generates LLM summaries.

### Data Model
```sql
CREATE TABLE IF NOT EXISTS news_items (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source TEXT NOT NULL,           -- 'hackernews', 'rss', etc.
  source_id TEXT,                 -- external ID (HN item ID, RSS guid)
  title TEXT NOT NULL,
  url TEXT,
  summary TEXT,                   -- LLM-generated 2-3 sentence summary
  relevance_score REAL,           -- 0.0-1.0, how relevant to user's projects
  relevance_reason TEXT,          -- why it's relevant ("matches tech stack: React, Tailwind")
  read INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS news_sources (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,             -- 'hackernews', 'rss'
  name TEXT NOT NULL,             -- display name
  url TEXT,                       -- RSS feed URL (null for HN)
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL
);
```

### Sources
- **Hacker News** — built-in, uses HN Algolia API (`https://hn.algolia.com/api/v1/search`)
  - Fetches front page stories
  - Filters by relevance to user's tech stacks and project descriptions
- **RSS Feeds** — user can add custom RSS/Atom feed URLs
  - Parsed server-side with a simple XML parser (no heavy dependency)

### Relevance Filtering
Two-pass approach:
1. **Keyword match (fast, no LLM):** check if title/URL contains any of the user's tech stack items, project names, or project description keywords. Assign a base relevance score.
2. **LLM scoring (for top candidates):** for items that pass keyword filter, ask LLM: "Given these projects [list], rate this article's relevance 0-10 and explain why in one sentence." This keeps LLM calls minimal.

### Fetch Schedule
- Manual trigger: "Refresh" button on the news feed
- Automatic: optional cron job, configurable interval (default: every 2 hours during working hours)
- `POST /api/news/fetch` — triggers a fetch for all enabled sources

### API Endpoints
- `GET /api/news` — list news items (paginated, filterable by source, read status)
- `POST /api/news/fetch` — trigger news fetch
- `PUT /api/news/:id/read` — mark as read
- `GET /api/news/sources` — list configured sources
- `POST /api/news/sources` — add source (type, name, url)
- `DELETE /api/news/sources/:id` — remove source

### UI
- New "News" page (add to sidebar nav + router)
- Two-column layout: list on left, article preview on right (similar to Ideas)
- Each item: title, source badge, relevance tag, summary, "mark as read" toggle
- Dashboard widget: "Today's Signals" — top 3-5 relevant items from today
- Sources management: settings section to add/remove RSS feeds

### Default Sources
On first use, auto-create one default source: Hacker News (enabled).

---

## 3. Daily Auto-Summary

### Architecture
A background job (triggered at end of day or manually) that:
1. Collects all activity from the past 24 hours
2. Feeds it to the LLM to generate a structured digest
3. Saves the digest as a special note entry

### Activity Collection
Gather from existing tables for the current user:
- **Projects updated** — name, what changed (stage, checklist items completed)
- **Checklist items completed** — count per project
- **Tech debt items resolved** — count per project
- **Notes/build logs added** — content snippets
- **Ideas created** — titles
- **Ideas promoted** — which became projects
- **Goals progress** — any goals that moved forward
- **MRR changes** — any new MRR entries logged

### LLM Prompt
```
Based on today's activity in my projects, generate a concise daily summary.

Activity:
{activity_json}

Format:
## Daily Summary — {date}
### What shipped
- bullet points of completed work
### What moved forward  
- bullet points of progress
### Open items
- things that are in progress but not done
### Tomorrow
- suggested focus areas based on what's in progress

Keep it concise. 3-5 bullets per section max. Skip empty sections.
```

### Data Model
```sql
CREATE TABLE IF NOT EXISTS daily_summaries (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  summary TEXT NOT NULL,
  activity_data TEXT NOT NULL,    -- JSON of raw activity used to generate
  date TEXT NOT NULL,             -- YYYY-MM-DD
  created_at INTEGER NOT NULL,
  UNIQUE(user_id, date)
);
```

### API Endpoints
- `POST /api/daily-summary/generate` — generate summary for today (or specific date)
- `GET /api/daily-summary` — list summaries (paginated)
- `GET /api/daily-summary/:date` — get summary for specific date

### UI
- Dashboard widget: "Today's Summary" card (if generated)
- "Generate Summary" button on Dashboard (manual trigger)
- Dedicated view: clicking the summary card expands to full markdown rendering
- History: accessible from a "Daily Log" link, shows past summaries as a timeline

### Schedule
- Manual first: user clicks "Generate Summary" when they want it
- Future: add cron-based auto-generation (e.g., 6pm daily)

---

## 4. Navigation Updates

### New Sidebar Items
Add "News" to the nav list (between "Ideas" and "Files"):
```typescript
const NAV = [
  { to: "/", icon: LayoutDashboard, label: "Home" },
  { to: "/projects", icon: FolderKanban, label: "Projects" },
  { to: "/ideas", icon: Lightbulb, label: "Ideas" },
  { to: "/news", icon: Newspaper, label: "News" },
  { to: "/files", icon: Files, label: "Files" },
];
```

### New Routes
- `/news` — News Intelligence Feed page

### Dashboard Additions
- "Today's Signals" widget — top relevant news items
- "Daily Summary" widget — today's auto-generated summary (or "Generate" button)

---

## 5. Implementation Order

**Batch 1: Foundation**
- LLM provider abstraction (`server/src/lib/llm.ts`)
- Ollama integration + health check endpoint

**Batch 2: Daily Auto-Summary**
- Activity collection logic
- Summary generation endpoint
- Dashboard widget + summary view
- (This is the simplest feature that uses the LLM, good for validating the integration)

**Batch 3: News Intelligence Feed**
- Database tables + API endpoints
- HN fetcher + RSS parser
- Relevance filtering (keyword + LLM scoring)
- News page UI + Dashboard widget

**Batch 4: Voice Ideas Capture**
- Whisper health check + transcription endpoint
- Browser audio recording component
- Voice idea creation flow
- Audio playback widget

---

## 6. Out of Scope (Future)

- GitHub integration (commits, PRs, issues)
- Telegram bot
- Coolify deployment tracking
- Stripe MRR automation
- Analytics integration (Plausible/PostHog)
- Uptime Robot integration
- Plane sync
- Matrix notifications
- Hetzner server status
