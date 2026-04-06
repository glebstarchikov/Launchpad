const LLM_PROVIDER = process.env.LLM_PROVIDER ?? "ollama";
const LLM_BASE_URL = process.env.LLM_BASE_URL ?? (LLM_PROVIDER === "anthropic" ? "https://api.anthropic.com" : "http://localhost:11434/v1");
const LLM_MODEL = process.env.LLM_MODEL ?? (LLM_PROVIDER === "anthropic" ? "claude-haiku-4-5-20251001" : "llama3.1");
const LLM_API_KEY = process.env.LLM_API_KEY ?? "ollama";

interface GenerateOptions {
  maxTokens?: number;
  temperature?: number;
}

async function generateViaOpenAI(prompt: string, options: GenerateOptions): Promise<string> {
  const { maxTokens = 1024, temperature = 0.3 } = options;
  const res = await fetch(`${LLM_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(LLM_API_KEY !== "ollama" ? { Authorization: `Bearer ${LLM_API_KEY}` } : {}),
    },
    body: JSON.stringify({
      model: LLM_MODEL,
      messages: [{ role: "user", content: prompt }],
      max_tokens: maxTokens,
      temperature,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`LLM request failed (${res.status}): ${body}`);
  }
  const data = await res.json();
  return data.choices?.[0]?.message?.content?.trim() ?? "";
}

async function generateViaAnthropic(prompt: string, options: GenerateOptions): Promise<string> {
  const { maxTokens = 1024, temperature = 0.3 } = options;
  const res = await fetch(`${LLM_BASE_URL}/v1/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": LLM_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: LLM_MODEL,
      max_tokens: maxTokens,
      temperature,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Anthropic request failed (${res.status}): ${body}`);
  }
  const data = await res.json();
  return data.content?.[0]?.text?.trim() ?? "";
}

export async function generateText(prompt: string, options: GenerateOptions = {}): Promise<string> {
  if (LLM_PROVIDER === "anthropic") return generateViaAnthropic(prompt, options);
  return generateViaOpenAI(prompt, options);
}

export async function isLLMAvailable(): Promise<{ available: boolean; model: string; provider: string; error?: string }> {
  try {
    if (LLM_PROVIDER === "anthropic") {
      // Anthropic doesn't have a /models endpoint — do a minimal request
      const res = await fetch(`${LLM_BASE_URL}/v1/messages`, {
        method: "POST",
        signal: AbortSignal.timeout(5000),
        headers: {
          "Content-Type": "application/json",
          "x-api-key": LLM_API_KEY,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: LLM_MODEL,
          max_tokens: 1,
          messages: [{ role: "user", content: "hi" }],
        }),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        return { available: false, model: LLM_MODEL, provider: LLM_PROVIDER, error: `HTTP ${res.status}: ${body.slice(0, 100)}` };
      }
      return { available: true, model: LLM_MODEL, provider: LLM_PROVIDER };
    }
    // OpenAI-compatible (Ollama, etc.)
    const res = await fetch(`${LLM_BASE_URL}/models`, {
      signal: AbortSignal.timeout(3000),
      headers: LLM_API_KEY !== "ollama" ? { Authorization: `Bearer ${LLM_API_KEY}` } : {},
    });
    if (!res.ok) return { available: false, model: LLM_MODEL, provider: LLM_PROVIDER, error: `HTTP ${res.status}` };
    return { available: true, model: LLM_MODEL, provider: LLM_PROVIDER };
  } catch (e: any) {
    return { available: false, model: LLM_MODEL, provider: LLM_PROVIDER, error: e.message };
  }
}
