# Voice Ideas Capture — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add voice recording to the Ideas page — click a mic button, speak your idea, get it transcribed and saved as an idea with the audio file attached.

**Architecture:** Browser captures audio via MediaRecorder API (WebM/Opus format). Audio blob is sent to the server as multipart form data. Server converts WebM to WAV using ffmpeg, transcribes using whisper.cpp, creates an idea with the transcript as body, and saves the audio file. If whisper.cpp is not installed, the idea is created with "[Voice memo — transcription unavailable]" as body and the audio attached. A health check endpoint reports whether whisper.cpp is available.

**Tech Stack:** Browser MediaRecorder API, Bun + Hono (server), whisper.cpp + ffmpeg (user-installed binaries), existing files infrastructure for audio storage

---

## File Structure

| Action | Path | Responsibility |
|--------|------|---------------|
| Create | `server/src/lib/whisper.ts` | Whisper.cpp wrapper: transcribe audio files, health check |
| Create | `server/src/routes/voice.ts` | Voice API: POST /api/ideas/voice endpoint |
| Modify | `server/src/index.ts` | Mount voice router (or add to ideas router) |
| Modify | `server/src/routes/misc.ts` | Add whisper health check endpoint |
| Modify | `client/src/lib/api.ts` | Add voice recording API method |
| Modify | `client/src/lib/types.ts` | Add WhisperHealth type |
| Create | `client/src/components/VoiceRecorder.tsx` | Audio recording UI component |
| Modify | `client/src/pages/Ideas.tsx` | Add mic button + VoiceRecorder to Ideas page |
| Modify | `.env.example` | Add WHISPER_MODEL_PATH config |

---

### Task 1: Whisper.cpp Wrapper

**Files:**
- Create: `server/src/lib/whisper.ts`
- Modify: `server/src/routes/misc.ts`
- Modify: `.env.example`

- [ ] **Step 1: Create the whisper wrapper**

Create `server/src/lib/whisper.ts`:

```typescript
import { $ } from "bun";

const WHISPER_MODEL_PATH = process.env.WHISPER_MODEL_PATH ?? "";

export async function isWhisperAvailable(): Promise<{ available: boolean; model: string; error?: string }> {
  if (!WHISPER_MODEL_PATH) {
    return { available: false, model: "", error: "WHISPER_MODEL_PATH not set" };
  }
  try {
    // Check if whisper.cpp binary exists
    const result = await $`which whisper-cpp`.quiet().nothrow();
    if (result.exitCode !== 0) {
      // Try whisper-cli as alternative name
      const result2 = await $`which whisper`.quiet().nothrow();
      if (result2.exitCode !== 0) {
        return { available: false, model: WHISPER_MODEL_PATH, error: "whisper-cpp binary not found in PATH" };
      }
    }
    // Check if model file exists
    const file = Bun.file(WHISPER_MODEL_PATH);
    if (!(await file.exists())) {
      return { available: false, model: WHISPER_MODEL_PATH, error: "Model file not found" };
    }
    return { available: true, model: WHISPER_MODEL_PATH };
  } catch (e: any) {
    return { available: false, model: WHISPER_MODEL_PATH, error: e.message };
  }
}

export async function transcribeAudio(wavPath: string): Promise<string> {
  if (!WHISPER_MODEL_PATH) throw new Error("WHISPER_MODEL_PATH not set");

  // Try whisper-cpp first, then whisper as fallback
  let binary = "whisper-cpp";
  const check = await $`which whisper-cpp`.quiet().nothrow();
  if (check.exitCode !== 0) binary = "whisper";

  const result = await $`${binary} -m ${WHISPER_MODEL_PATH} -f ${wavPath} --no-timestamps -l auto`.quiet().nothrow();

  if (result.exitCode !== 0) {
    throw new Error(`Whisper failed (exit ${result.exitCode}): ${result.stderr.toString()}`);
  }

  return result.stdout.toString().trim();
}

export async function convertToWav(inputPath: string, outputPath: string): Promise<void> {
  const result = await $`ffmpeg -y -i ${inputPath} -ar 16000 -ac 1 -c:a pcm_s16le ${outputPath}`.quiet().nothrow();
  if (result.exitCode !== 0) {
    throw new Error(`ffmpeg conversion failed: ${result.stderr.toString()}`);
  }
}
```

- [ ] **Step 2: Add whisper health check endpoint**

In `server/src/routes/misc.ts`, add the import at the top:

```typescript
import { isWhisperAvailable } from "../lib/whisper.ts";
```

Add a new route before `export default router` (and before the `requireAuth` middleware, so it's public like the LLM health check):

```typescript
router.get("/health/whisper", async (c) => {
  const status = await isWhisperAvailable();
  return c.json(status);
});
```

**IMPORTANT:** This route must be BEFORE the `router.use("*", requireAuth)` line, just like the existing `/health/llm` route.

- [ ] **Step 3: Update .env.example**

Add to `.env.example`:

```
# Voice transcription (optional — requires whisper.cpp + ffmpeg installed)
# WHISPER_MODEL_PATH=/path/to/ggml-base.en.bin
```

- [ ] **Step 4: Commit**

```bash
git add server/src/lib/whisper.ts server/src/routes/misc.ts .env.example
git commit -m "feat: add whisper.cpp wrapper for voice transcription"
```

---

### Task 2: Voice API Endpoint

**Files:**
- Create: `server/src/routes/voice.ts`
- Modify: `server/src/index.ts`

- [ ] **Step 1: Create the voice route**

Create `server/src/routes/voice.ts`:

```typescript
import { Hono } from "hono";
import { db } from "../db/index.ts";
import { requireAuth } from "../middleware/auth.ts";
import { transcribeAudio, convertToWav, isWhisperAvailable } from "../lib/whisper.ts";
import { join } from "path";

const UPLOADS_DIR = process.env.UPLOADS_DIR ?? "./uploads";

const router = new Hono<{ Variables: { userId: string } }>();
router.use("*", requireAuth);

// POST /api/ideas/voice — upload audio, transcribe, create idea
router.post("/", async (c) => {
  const userId = c.get("userId");
  const body = await c.req.parseBody();
  const audioFile = body["audio"];

  if (!audioFile || !(audioFile instanceof File)) {
    return c.json({ error: "audio file required" }, 400);
  }

  // Save the uploaded audio file
  const audioId = crypto.randomUUID();
  const audioExt = audioFile.name?.split(".").pop() ?? "webm";
  const audioFilename = `${audioId}.${audioExt}`;
  const audioPath = join(UPLOADS_DIR, audioFilename);

  const arrayBuffer = await audioFile.arrayBuffer();
  await Bun.write(audioPath, arrayBuffer);

  // Save audio as a file record
  const now = Date.now();
  db.run(
    "INSERT INTO files (id, project_id, user_id, filename, original_name, mimetype, size, uploaded_at) VALUES (?, null, ?, ?, ?, ?, ?, ?)",
    [audioId, userId, audioFilename, audioFile.name ?? "voice-memo.webm", audioFile.type ?? "audio/webm", audioFile.size, now]
  );

  // Attempt transcription
  let transcript = "";
  const whisperStatus = await isWhisperAvailable();

  if (whisperStatus.available) {
    try {
      // Convert WebM to WAV for whisper.cpp
      const wavPath = join(UPLOADS_DIR, `${audioId}.wav`);
      await convertToWav(audioPath, wavPath);
      transcript = await transcribeAudio(wavPath);
      // Clean up temporary WAV file
      try { await Bun.file(wavPath).exists() && Bun.write(wavPath, ""); } catch {}
      try { const { unlinkSync } = require("fs"); unlinkSync(wavPath); } catch {}
    } catch (e: any) {
      console.error("Transcription failed:", e.message);
      transcript = "";
    }
  }

  // Create the idea
  const ideaId = crypto.randomUUID();
  const title = transcript
    ? transcript.split(/[.!?]/)[0]?.trim().slice(0, 100) || "Voice memo"
    : "Voice memo";
  const ideaBody = transcript || "[Voice memo — transcription unavailable]";

  db.run(
    "INSERT INTO ideas (id, user_id, title, body, status, promoted_to_project_id, created_at, updated_at) VALUES (?, ?, ?, ?, 'raw', null, ?, ?)",
    [ideaId, userId, title, ideaBody, now, now]
  );

  const idea = db.query("SELECT * FROM ideas WHERE id = ?").get(ideaId);

  return c.json({
    idea,
    transcript,
    audioFileId: audioId,
    whisperAvailable: whisperStatus.available,
  }, 201);
});

export default router;
```

- [ ] **Step 2: Mount the voice router**

In `server/src/index.ts`, add the import:

```typescript
import voiceRouter from "./routes/voice.ts";
```

Add the route after the ideas router:

```typescript
app.route("/api/ideas/voice", voiceRouter);
```

**IMPORTANT:** This must be mounted BEFORE `app.route("/api/ideas", ideasRouter)` because Hono matches routes in order, and `/api/ideas/voice` would otherwise match the ideas router's `/:id` param pattern. Move the voice route above the ideas route:

```typescript
app.route("/api/ideas/voice", voiceRouter);
app.route("/api/ideas", ideasRouter);
```

- [ ] **Step 3: Commit**

```bash
git add server/src/routes/voice.ts server/src/index.ts
git commit -m "feat: add voice idea API endpoint (upload, transcribe, create idea)"
```

---

### Task 3: Client Types and API

**Files:**
- Modify: `client/src/lib/types.ts`
- Modify: `client/src/lib/api.ts`

- [ ] **Step 1: Add WhisperHealth type**

In `client/src/lib/types.ts`, add at the end:

```typescript
export interface WhisperHealth {
  available: boolean;
  model: string;
  error?: string;
}

export interface VoiceIdeaResult {
  idea: Idea;
  transcript: string;
  audioFileId: string;
  whisperAvailable: boolean;
}
```

- [ ] **Step 2: Add voice API methods**

In `client/src/lib/api.ts`, update the import to include new types:

```typescript
import type { User, Project, ProjectLink, LaunchChecklistItem, TechDebtItem, MrrEntry, Goal, ProjectStage, ProjectType, DashboardData, ProjectCountry, LegalItem, Note, Idea, FileRecord, DailySummary, LLMHealth, NewsItem, NewsSource, WhisperHealth, VoiceIdeaResult } from "./types";
```

Add a `voice` method inside the `ideas` namespace, after the `promote` method:

```typescript
    voice: async (audioBlob: Blob): Promise<VoiceIdeaResult> => {
      const form = new FormData();
      form.append("audio", audioBlob, "voice-memo.webm");
      const res = await fetch(`${BASE}/ideas/voice`, {
        method: "POST",
        body: form,
        credentials: "include",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(body.error ?? res.statusText);
      }
      return res.json();
    },
```

Add `whisper` to the `health` namespace:

```typescript
  health: {
    llm: () => req<LLMHealth>("/health/llm"),
    whisper: () => req<WhisperHealth>("/health/whisper"),
  },
```

- [ ] **Step 3: Build and verify**

```bash
cd /Users/glebstarcikov/Launchpad && bun build client/src/main.tsx --outdir client/dist --target browser 2>&1 | tail -5
```

- [ ] **Step 4: Commit**

```bash
git add client/src/lib/types.ts client/src/lib/api.ts
git commit -m "feat: add voice idea types and API client"
```

---

### Task 4: VoiceRecorder Component

**Files:**
- Create: `client/src/components/VoiceRecorder.tsx`

- [ ] **Step 1: Create the voice recorder component**

Create `client/src/components/VoiceRecorder.tsx`:

```tsx
import { useState, useRef, useCallback } from "react";
import { Mic, Square, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface VoiceRecorderProps {
  onRecorded: (audioBlob: Blob) => void;
  isProcessing: boolean;
  disabled?: boolean;
}

export default function VoiceRecorder({ onRecorded, isProcessing, disabled }: VoiceRecorderProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval>>();

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
          ? "audio/webm;codecs=opus"
          : "audio/webm",
      });

      chunks.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.current.push(e.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(chunks.current, { type: recorder.mimeType });
        stream.getTracks().forEach((t) => t.stop());
        onRecorded(blob);
      };

      recorder.start(1000); // collect data every second
      mediaRecorder.current = recorder;
      setIsRecording(true);
      setElapsed(0);

      timerRef.current = setInterval(() => {
        setElapsed((prev) => prev + 1);
      }, 1000);
    } catch (err) {
      console.error("Microphone access denied:", err);
    }
  }, [onRecorded]);

  const stopRecording = useCallback(() => {
    if (mediaRecorder.current && mediaRecorder.current.state !== "inactive") {
      mediaRecorder.current.stop();
    }
    setIsRecording(false);
    clearInterval(timerRef.current);
  }, []);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  if (isProcessing) {
    return (
      <Button size="sm" disabled className="h-8 gap-1.5">
        <Loader2 size={14} className="animate-spin" />
        Transcribing...
      </Button>
    );
  }

  if (isRecording) {
    return (
      <Button
        size="sm"
        variant="destructive"
        onClick={stopRecording}
        className="h-8 gap-1.5"
      >
        <Square size={12} className="fill-current" />
        <span className="font-mono text-xs tabular-nums">{formatTime(elapsed)}</span>
        Stop
      </Button>
    );
  }

  return (
    <Button
      size="sm"
      variant="outline"
      onClick={startRecording}
      disabled={disabled}
      className="h-8 gap-1.5"
    >
      <Mic size={14} />
      Record
    </Button>
  );
}
```

- [ ] **Step 2: Build and verify**

```bash
cd /Users/glebstarcikov/Launchpad && bun build client/src/main.tsx --outdir client/dist --target browser 2>&1 | tail -5
```

- [ ] **Step 3: Commit**

```bash
git add client/src/components/VoiceRecorder.tsx
git commit -m "feat: add VoiceRecorder component (mic button, recording state, timer)"
```

---

### Task 5: Integrate VoiceRecorder into Ideas Page

**Files:**
- Modify: `client/src/pages/Ideas.tsx`

- [ ] **Step 1: Add voice recording to Ideas page**

In `client/src/pages/Ideas.tsx`:

**Add imports** — add to the existing imports:

```typescript
import VoiceRecorder from "@/components/VoiceRecorder";
```

**Add voice mutation** — inside the `Ideas` component, after the existing `promoteIdea` mutation:

```typescript
  const voiceIdea = useMutation({
    mutationFn: (audioBlob: Blob) => api.ideas.voice(audioBlob),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["ideas"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      setComposing(false);
      setSelected(result.idea);
    },
  });
```

**Add VoiceRecorder to the header** — find the Ideas page header:

```tsx
        <div className="p-4 border-b border-border flex items-center justify-between">
          <h1 className="text-lg font-semibold">Ideas</h1>
          <Button size="sm" onClick={() => { setSelected(null); setComposing(true); }}>
            New
          </Button>
        </div>
```

Replace it with:

```tsx
        <div className="p-4 border-b border-border flex items-center justify-between">
          <h1 className="text-lg font-semibold">Ideas</h1>
          <div className="flex items-center gap-2">
            <VoiceRecorder
              onRecorded={(blob) => voiceIdea.mutate(blob)}
              isProcessing={voiceIdea.isPending}
            />
            <Button size="sm" onClick={() => { setSelected(null); setComposing(true); }}>
              New
            </Button>
          </div>
        </div>
```

- [ ] **Step 2: Build and verify**

```bash
cd /Users/glebstarcikov/Launchpad && bun build client/src/main.tsx --outdir client/dist --target browser 2>&1 | tail -5
```

```bash
cd /Users/glebstarcikov/Launchpad/client && npx tailwindcss -i src/index.css -o dist/index.css 2>&1 | tail -3
```

- [ ] **Step 3: Commit**

```bash
git add client/src/pages/Ideas.tsx
git commit -m "feat: integrate voice recording into Ideas page header"
```

---

### Task 6: Playwright E2E Verification

**Files:**
- No new files — uses Playwright MCP tools

- [ ] **Step 1: Restart dev server**

```bash
cd /Users/glebstarcikov/Launchpad && lsof -ti:3001 | xargs kill -9 2>/dev/null; bun run dev &
```

- [ ] **Step 2: Verify whisper health endpoint**

Navigate to `http://localhost:3001/api/health/whisper` (or test via fetch). Expected response: `{ available: false, model: "", error: "WHISPER_MODEL_PATH not set" }` (since whisper isn't configured).

- [ ] **Step 3: Navigate to Ideas page**

Go to `http://localhost:3001/ideas`. Verify:
- "Record" button with mic icon appears next to "New" button in the header
- The button is enabled and clickable

- [ ] **Step 4: Verify voice recording UI states**

Click "Record" button. Verify:
- Browser asks for microphone permission (if not already granted)
- After granting: button changes to red "Stop" with a timer counting up
- Click "Stop": button changes to "Transcribing..." with spinner
- After processing: a new idea appears in the list

(If whisper.cpp is not installed, the idea body will be "[Voice memo — transcription unavailable]" but the flow should still complete.)

- [ ] **Step 5: Take screenshots**

Take screenshots of:
- Ideas page with Record button visible
- Recording state (if possible)
