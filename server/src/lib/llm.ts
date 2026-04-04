const LLM_BASE_URL = process.env.LLM_BASE_URL ?? "http://localhost:11434/v1";
const LLM_MODEL = process.env.LLM_MODEL ?? "llama3.1";
const LLM_API_KEY = process.env.LLM_API_KEY ?? "ollama";

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface GenerateOptions {
  maxTokens?: number;
  temperature?: number;
}

export async function generateText(
  prompt: string,
  options: GenerateOptions = {}
): Promise<string> {
  const { maxTokens = 1024, temperature = 0.3 } = options;

  const messages: ChatMessage[] = [{ role: "user", content: prompt }];

  const res = await fetch(`${LLM_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(LLM_API_KEY !== "ollama" ? { Authorization: `Bearer ${LLM_API_KEY}` } : {}),
    },
    body: JSON.stringify({
      model: LLM_MODEL,
      messages,
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

export async function isLLMAvailable(): Promise<{ available: boolean; model: string; error?: string }> {
  try {
    const res = await fetch(`${LLM_BASE_URL}/models`, {
      signal: AbortSignal.timeout(3000),
      headers: LLM_API_KEY !== "ollama" ? { Authorization: `Bearer ${LLM_API_KEY}` } : {},
    });
    if (!res.ok) return { available: false, model: LLM_MODEL, error: `HTTP ${res.status}` };
    return { available: true, model: LLM_MODEL };
  } catch (e: any) {
    return { available: false, model: LLM_MODEL, error: e.message };
  }
}
