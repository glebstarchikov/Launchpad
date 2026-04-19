import { test, expect, describe } from "bun:test";
import { looksLikeRefusal, looksLikeBinary, cleanSummary } from "../src/lib/llm-guards.ts";

describe("looksLikeRefusal", () => {
  test("empty string → true", () => {
    expect(looksLikeRefusal("")).toBe(true);
    expect(looksLikeRefusal(null)).toBe(true);
    expect(looksLikeRefusal(undefined)).toBe(true);
  });

  test("very short output → true", () => {
    expect(looksLikeRefusal("OK.")).toBe(true);
    expect(looksLikeRefusal("Yes, done.")).toBe(true);
  });

  test("'I don't have access to...' → true", () => {
    expect(
      looksLikeRefusal("I don't have access to information about yesterday's activities."),
    ).toBe(true);
  });

  test("'I cannot see timestamps...' → true", () => {
    expect(looksLikeRefusal("I cannot see timestamps or activity logs for any projects.")).toBe(
      true,
    );
  });

  test("'I apologize, but the PDF content...' → true", () => {
    expect(
      looksLikeRefusal("I apologize, but the PDF content you've provided appears to be corrupted."),
    ).toBe(true);
  });

  test("'Could you please provide...' → true", () => {
    expect(
      looksLikeRefusal("Could you please provide more details about the project activities?"),
    ).toBe(true);
  });

  test("'It seems like the data is missing' → true", () => {
    expect(looksLikeRefusal("It seems like the data is missing essential fields.")).toBe(true);
  });

  test("'Unfortunately, I can't...' → true", () => {
    expect(looksLikeRefusal("Unfortunately, I can't help with that request.")).toBe(true);
  });

  test("normal bullet summary → false", () => {
    expect(
      looksLikeRefusal(
        "- Shipped v2 of the landing page\n- Fixed 3 critical bugs\n- Added payment flow",
      ),
    ).toBe(false);
  });

  test("normal news summary → false", () => {
    expect(
      looksLikeRefusal(
        "Pausing a game is deceptively complex—developers must freeze animations, audio, UI, and game logic.",
      ),
    ).toBe(false);
  });
});

describe("looksLikeBinary", () => {
  test("empty/null → false (can't judge)", () => {
    expect(looksLikeBinary("")).toBe(false);
    expect(looksLikeBinary(null)).toBe(false);
  });

  test("short text → false (can't judge reliably)", () => {
    expect(looksLikeBinary("short text")).toBe(false);
  });

  test("plain English text → false", () => {
    const text = "The quick brown fox jumps over the lazy dog. ".repeat(30);
    expect(looksLikeBinary(text)).toBe(false);
  });

  test("binary-looking content (PDF-like) → true", () => {
    // Mix of control chars and random bytes simulating a stripped PDF
    const binary = Array.from({ length: 500 }, () =>
      String.fromCharCode(Math.floor(Math.random() * 256)),
    ).join("") + "some words here";
    expect(looksLikeBinary(binary)).toBe(true);
  });

  test("mostly printable with a few binary chars → false", () => {
    const text =
      "Normal article text with all printable characters and standard punctuation. ".repeat(20) +
      "\x00\x01"; // 2 binary chars out of ~1500
    expect(looksLikeBinary(text)).toBe(false);
  });
});

describe("cleanSummary", () => {
  test("strips leading markdown header", () => {
    expect(cleanSummary("# Summary for Software Founders\n\nActual summary here.")).toBe(
      "Actual summary here.",
    );
  });

  test("strips multiple leading headers", () => {
    expect(cleanSummary("# Big Title\n## Subtitle\n\nThe content.")).toBe("The content.");
  });

  test("strips 'Summary:' preamble", () => {
    expect(cleanSummary("Summary: The article discusses X.")).toBe("The article discusses X.");
  });

  test("strips 'TL;DR:' preamble", () => {
    expect(cleanSummary("TL;DR: Short summary here.")).toBe("Short summary here.");
  });

  test("leaves clean text alone", () => {
    expect(cleanSummary("Just a normal summary sentence.")).toBe("Just a normal summary sentence.");
  });

  test("empty/null → empty string", () => {
    expect(cleanSummary("")).toBe("");
    expect(cleanSummary(null)).toBe("");
  });

  test("trims whitespace", () => {
    expect(cleanSummary("  \n  hello  \n  ")).toBe("hello");
  });
});
