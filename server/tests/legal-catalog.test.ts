import { test, expect, describe } from "bun:test";
import { LEGAL_CATALOG, EU_MEMBER_CODES } from "../src/lib/legal-catalog.ts";

describe("LEGAL_CATALOG", () => {
  test("catalog is non-empty", () => {
    expect(LEGAL_CATALOG.length).toBeGreaterThan(0);
  });

  test("all items have required fields", () => {
    for (const item of LEGAL_CATALOG) {
      expect(typeof item.key).toBe("string");
      expect(item.key.length).toBeGreaterThan(0);
      expect(typeof item.item).toBe("string");
      expect(item.item.length).toBeGreaterThan(0);
      expect(["blocker", "important", "recommended"]).toContain(
        item.priority
      );
      expect([
        "privacy",
        "tax",
        "terms",
        "ip",
        "accessibility",
        "data",
        "corporate",
      ]).toContain(item.category);
      expect(typeof item.why).toBe("string");
      expect(typeof item.action).toBe("string");
      expect(Array.isArray(item.resources)).toBe(true);
      expect(Array.isArray(item.project_types)).toBe(true);
    }
  });

  test("all keys are unique", () => {
    const keys = LEGAL_CATALOG.map((i) => i.key);
    const unique = new Set(keys);
    expect(unique.size).toBe(keys.length);
  });

  test("each item has exactly one of countries or region", () => {
    for (const item of LEGAL_CATALOG) {
      const hasCountries =
        Array.isArray(item.countries) && item.countries.length > 0;
      const hasRegion =
        typeof item.region === "string" && item.region.length > 0;
      expect(hasCountries || hasRegion).toBe(true);
      expect(hasCountries && hasRegion).toBe(false);
    }
  });

  test("Russia (RU) has at least 10 items", () => {
    const ruItems = LEGAL_CATALOG.filter((i) =>
      i.countries?.includes("RU")
    );
    expect(ruItems.length).toBeGreaterThanOrEqual(10);
  });

  test("Russia items include data localization coverage", () => {
    const ruItems = LEGAL_CATALOG.filter((i) =>
      i.countries?.includes("RU")
    );
    const hasDataLocalization = ruItems.some(
      (i) =>
        i.item.toLowerCase().includes("locali") ||
        i.key.includes("locali")
    );
    expect(hasDataLocalization).toBe(true);
  });

  test("EU items use region='eu'", () => {
    const euItems = LEGAL_CATALOG.filter((i) => i.region === "eu");
    expect(euItems.length).toBeGreaterThan(0);
  });

  test("GDPR privacy policy is a EU blocker", () => {
    const gdpr = LEGAL_CATALOG.find(
      (i) => i.key === "eu-gdpr-privacy-policy"
    );
    expect(gdpr).toBeDefined();
    expect(gdpr?.priority).toBe("blocker");
    expect(gdpr?.region).toBe("eu");
  });

  test("all resource links start with https://", () => {
    for (const item of LEGAL_CATALOG) {
      for (const res of item.resources) {
        expect(res.url.startsWith("https://")).toBe(true);
      }
    }
  });

  test("EU_MEMBER_CODES has 27 entries, all 2-character ISO codes", () => {
    expect(EU_MEMBER_CODES.length).toBe(27);
    for (const code of EU_MEMBER_CODES) {
      expect(code.length).toBe(2);
      expect(code).toBe(code.toUpperCase());
    }
  });
});
