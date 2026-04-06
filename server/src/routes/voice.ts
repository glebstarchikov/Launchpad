import { Hono } from "hono";
import { db } from "../db/index.ts";
import { requireAuth } from "../middleware/auth.ts";
import { transcribeAudio, convertToWav, isWhisperAvailable } from "../lib/whisper.ts";
import { join } from "path";
import { unlinkSync } from "fs";

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
      const wavPath = join(UPLOADS_DIR, `${audioId}.wav`);
      await convertToWav(audioPath, wavPath);
      transcript = await transcribeAudio(wavPath);
      // Clean up temporary WAV file
      try { unlinkSync(wavPath); } catch {}
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
