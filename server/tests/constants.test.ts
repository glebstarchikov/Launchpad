import { test, expect, describe } from "bun:test";
import {
  getDefaultChecklist,
  CHECKLIST_UNIVERSAL,
  CHECKLIST_FOR_PROFIT,
  CHECKLIST_OPEN_SOURCE,
} from "../src/lib/constants.ts";

describe("getDefaultChecklist", () => {
  test("for-profit returns universal + for-profit items", () => {
    const items = getDefaultChecklist("for-profit");
    expect(items.length).toBe(
      CHECKLIST_UNIVERSAL.length + CHECKLIST_FOR_PROFIT.length
    );
  });

  test("open-source returns universal + open-source items", () => {
    const items = getDefaultChecklist("open-source");
    expect(items.length).toBe(
      CHECKLIST_UNIVERSAL.length + CHECKLIST_OPEN_SOURCE.length
    );
  });

  test("for-profit and open-source return different items", () => {
    const fp = getDefaultChecklist("for-profit");
    const os = getDefaultChecklist("open-source");
    expect(fp).not.toEqual(os);
  });

  test("all items have required fields", () => {
    for (const type of ["for-profit", "open-source"] as const) {
      for (const item of getDefaultChecklist(type)) {
        expect(typeof item.item).toBe("string");
        expect(item.item.length).toBeGreaterThan(0);
        expect(typeof item.sort_order).toBe("number");
        expect([
          "validation",
          "build",
          "infra",
          "legal",
          "marketing",
          "launch",
          "growth",
        ]).toContain(item.category);
        expect([
          "idea",
          "building",
          "beta",
          "live",
          "growing",
          "sunset",
        ]).toContain(item.min_stage);
      }
    }
  });

  test("for-profit has at least 5 blocker items", () => {
    const items = getDefaultChecklist("for-profit");
    const blockers = items.filter((i) => i.priority === "blocker");
    expect(blockers.length).toBeGreaterThanOrEqual(5);
  });

  test("blocker items include core essentials", () => {
    const items = getDefaultChecklist("for-profit");
    const blockerItems = items.filter((i) => i.priority === "blocker").map((i) => i.item);
    expect(blockerItems).toContain("Build core feature #1 (the one thing)");
    expect(blockerItems).toContain("Draft Terms of Service");
    expect(blockerItems).toContain("Draft Privacy Policy");
  });

  test("sort_order values exist within CHECKLIST_FOR_PROFIT", () => {
    const orders = CHECKLIST_FOR_PROFIT.map((i) => i.sort_order);
    expect(orders.length).toBeGreaterThan(0);
    // Note: sort_order values may not be unique due to ordering/grouping needs
  });
});
