import { generateText } from "./llm.ts";
import type { LegalCatalogItem, LegalPriority, LegalCategory } from "./legal-catalog.ts";

export interface LegalProjectContext {
  name: string;
  description: string | null;
  type: string;
  stage: string;
}

export interface EnrichmentResult {
  key: string;
  personalized_action: string;
  skip_due_to_feature_gate: boolean;
}

/**
 * Personalizes the `action` field of catalog items based on project context.
 * Constrained contract: the LLM cannot add, remove, or rename items — it only
 * rewrites action text. Returns generic actions on failure (never throws).
 */
export async function enrichSeedItems(
  project: LegalProjectContext,
  items: LegalCatalogItem[]
): Promise<EnrichmentResult[]> {
  if (items.length === 0) return [];

  const systemPrompt = `You personalize compliance action text for a specific project. You DO NOT add, remove, or rename items. You only rewrite the \`action\` field to be specific to this project's tech stack and description. If the generic action is already specific enough, return it verbatim.

Rules:
- Never invent items not in the input
- If an input item has \`feature_gated\` and the project description gives no evidence of that feature, set \`skip_due_to_feature_gate: true\`
- Personalize using concrete tech stack details from the description when possible (e.g., "Your stack uses PostHog and Supabase — your privacy policy must list these processors")
- Keep personalized actions under 200 words
- Output VALID JSON only, no surrounding prose`;

  const userPayload = {
    project: {
      name: project.name,
      description: project.description ?? "",
      type: project.type,
      stage: project.stage,
    },
    items: items.map((it) => ({
      key: it.key,
      item: it.item,
      why: it.why,
      generic_action: it.action,
      feature_gated: it.feature_gated ?? null,
    })),
  };

  const prompt = `${systemPrompt}\n\nINPUT:\n${JSON.stringify(userPayload, null, 2)}\n\nOUTPUT (JSON only):\n{ "items": [{ "key": "...", "personalized_action": "...", "skip_due_to_feature_gate": false }] }`;

  try {
    const response = await Promise.race([
      generateText(prompt, { maxTokens: 4096, temperature: 0.2 }),
      new Promise<string>((_, reject) =>
        setTimeout(() => reject(new Error("LLM timeout")), 5000)
      ),
    ]);

    const parsed = parseJsonResponse(response);
    if (!parsed?.items || !Array.isArray(parsed.items)) {
      throw new Error("LLM response missing items array");
    }

    // Build a result map keyed by item key, so we can safely fall back per-item
    const resultByKey = new Map<string, EnrichmentResult>();
    for (const r of parsed.items) {
      if (typeof r?.key === "string" && typeof r?.personalized_action === "string") {
        resultByKey.set(r.key, {
          key: r.key,
          personalized_action: r.personalized_action,
          skip_due_to_feature_gate: r.skip_due_to_feature_gate === true,
        });
      }
    }

    return items.map((it) => {
      const r = resultByKey.get(it.key);
      if (r) return r;
      return { key: it.key, personalized_action: it.action, skip_due_to_feature_gate: false };
    });
  } catch (err) {
    console.warn("[legal-llm] enrichSeedItems failed, falling back to generic actions:", (err as Error).message);
    return items.map((it) => ({
      key: it.key,
      personalized_action: it.action,
      skip_due_to_feature_gate: false,
    }));
  }
}

export interface ReviewedItem {
  id: string;
  country_code: string;
  scope: "country" | "region";
  scope_code: string | null;
  item: string;
  priority: LegalPriority | null;
  category: LegalCategory | null;
  why: string | null;
  action: string | null;
}

export interface MissingItem {
  item: string;
  priority: LegalPriority;
  category: LegalCategory;
  why: string;
  action: string;
  resources: { label: string; url: string }[];
  country_code: string;
  scope: "country" | "region";
  scope_code: string | null;
}

export interface LegalReviewDiff {
  ok: string[];
  stale: { id: string; status_note: string }[];
  rename: { id: string; new_item: string }[];
  missing: MissingItem[];
  removed: string[];
}

/**
 * Audits current items against the catalog snapshot. Returns a structured diff.
 * Prefers conservative output (default to `ok` when uncertain). Throws on
 * unrecoverable errors so the caller can return HTTP 503 with retry info.
 */
export async function reviewItems(
  project: LegalProjectContext,
  currentItems: ReviewedItem[],
  catalog: LegalCatalogItem[]
): Promise<LegalReviewDiff> {
  const systemPrompt = `You audit a project's compliance items against a catalog of canonical requirements. You return a structured diff of what's stale, missing, renamed, or no longer applicable. You are conservative — when in legal uncertainty, mark items as \`ok\` rather than \`stale\` or \`removed\`.

Rules:
- For \`missing\`, prefer items from the catalog. Only include LLM-suggested items not in the catalog if you are highly confident
- For \`removed\`, only include items where you are confident the requirement was repealed or doesn't apply
- For \`stale\`, the \`status_note\` must be specific (e.g., "EU AI Act Article 50 transparency requirements take effect August 2026")
- Default to \`ok\` when uncertain
- Output VALID JSON only, no surrounding prose`;

  const userPayload = {
    project: {
      name: project.name,
      description: project.description ?? "",
      type: project.type,
      stage: project.stage,
    },
    current_items: currentItems,
    catalog: catalog.map((it) => ({
      item: it.item,
      priority: it.priority,
      category: it.category,
      why: it.why,
      action: it.action,
      resources: it.resources,
      countries: it.countries ?? null,
      region: it.region ?? null,
    })),
  };

  const prompt = `${systemPrompt}\n\nINPUT:\n${JSON.stringify(userPayload, null, 2)}\n\nOUTPUT (JSON only):\n{ "ok": ["<id>"], "stale": [{"id":"<id>","status_note":"..."}], "rename": [{"id":"<id>","new_item":"..."}], "missing": [{"item":"...","priority":"...","category":"...","why":"...","action":"...","resources":[],"country_code":"...","scope":"country","scope_code":null}], "removed": ["<id>"] }`;

  const response = await Promise.race([
    generateText(prompt, { maxTokens: 8192, temperature: 0.2 }),
    new Promise<string>((_, reject) =>
      setTimeout(() => reject(new Error("LLM timeout")), 15000)
    ),
  ]);

  const parsed = parseJsonResponse(response);
  if (!parsed) throw new Error("LLM returned invalid JSON");

  return {
    ok: Array.isArray(parsed.ok) ? parsed.ok.filter((x: unknown) => typeof x === "string") : [],
    stale: Array.isArray(parsed.stale)
      ? parsed.stale.filter((x: any) => typeof x?.id === "string" && typeof x?.status_note === "string")
      : [],
    rename: Array.isArray(parsed.rename)
      ? parsed.rename.filter((x: any) => typeof x?.id === "string" && typeof x?.new_item === "string")
      : [],
    missing: Array.isArray(parsed.missing)
      ? parsed.missing.filter((x: any) => typeof x?.item === "string" && typeof x?.country_code === "string")
      : [],
    removed: Array.isArray(parsed.removed) ? parsed.removed.filter((x: unknown) => typeof x === "string") : [],
  };
}

/**
 * Extracts the first JSON object from an LLM response. Handles cases where
 * the model wraps the JSON in markdown fences or surrounding prose.
 */
function parseJsonResponse(text: string): any {
  if (!text) return null;
  // Try direct parse first
  try {
    return JSON.parse(text);
  } catch {}
  // Strip markdown code fences
  const fenceMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
  if (fenceMatch) {
    try {
      return JSON.parse(fenceMatch[1]);
    } catch {}
  }
  // Find first { and last } and try parsing that slice
  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  if (first !== -1 && last !== -1 && last > first) {
    try {
      return JSON.parse(text.slice(first, last + 1));
    } catch {}
  }
  return null;
}
