import { $ } from "bun";

const WHISPER_MODEL_PATH = process.env.WHISPER_MODEL_PATH ?? "";

export async function isWhisperAvailable(): Promise<{ available: boolean; model: string; error?: string }> {
  if (!WHISPER_MODEL_PATH) {
    return { available: false, model: "", error: "WHISPER_MODEL_PATH not set" };
  }
  try {
    const result = await $`which whisper-cpp`.quiet().nothrow();
    if (result.exitCode !== 0) {
      const result2 = await $`which whisper`.quiet().nothrow();
      if (result2.exitCode !== 0) {
        return { available: false, model: WHISPER_MODEL_PATH, error: "whisper-cpp binary not found in PATH" };
      }
    }
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
