// Static catalog of compliance items. Each item ships with full metadata.
// LLM at seed-time only personalizes the `action` field — never adds, removes, or renames items.

export type LegalPriority = "blocker" | "important" | "recommended";
export type LegalCategory = "privacy" | "tax" | "terms" | "ip" | "accessibility" | "data" | "corporate";
export type LegalProjectType = "for-profit" | "open-source";
export type LegalFeatureGate = "messaging" | "streaming" | "ai" | "fintech";

export interface LegalCatalogItem {
  /** Stable identifier used by the LLM to round-trip items without renaming them. */
  key: string;
  /** Human-readable item name shown in the UI. */
  item: string;
  priority: LegalPriority;
  category: LegalCategory;
  /** 1-2 sentence explanation of why the item exists. */
  why: string;
  /** Generic action text. The LLM may personalize this per project at seed time. */
  action: string;
  /** Curated resource links. Always static — never LLM-generated. */
  resources: { label: string; url: string }[];
  project_types: LegalProjectType[];
  /** Optional: only seed if the LLM detects this feature in the project description. */
  feature_gated?: LegalFeatureGate;
  /** Exactly one of `countries` or `region` must be set. */
  countries?: string[];
  region?: "eu";
}

export const EU_MEMBER_CODES = [
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR",
  "HU", "IE", "IT", "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK", "SI", "ES", "SE",
];

/**
 * Items will be added in subsequent tasks (3-5).
 * The empty array is exported so other modules can import it now without breaking.
 */
export const LEGAL_CATALOG: LegalCatalogItem[] = [];

export function isEuMember(countryCode: string): boolean {
  return EU_MEMBER_CODES.includes(countryCode);
}

export function itemsForCountry(
  countryCode: string,
  projectType: LegalProjectType
): LegalCatalogItem[] {
  return LEGAL_CATALOG.filter(
    (it) =>
      it.countries?.includes(countryCode) &&
      it.project_types.includes(projectType)
  );
}

export function itemsForRegion(
  region: "eu",
  projectType: LegalProjectType
): LegalCatalogItem[] {
  return LEGAL_CATALOG.filter(
    (it) => it.region === region && it.project_types.includes(projectType)
  );
}
