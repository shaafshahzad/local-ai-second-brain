import { describe, expect, it } from "vitest";
import { fallbackExtraction, parseExtractionJson } from "@/lib/extract";

describe("knowledge extraction", () => {
  it("builds a deterministic fallback summary, claims, tags, and entities", () => {
    const result = fallbackExtraction(
      "Roman Roads",
      "Roman Roads connected important cities. Roman Roads supported trade. Marcus Aurelius travelled widely."
    );

    expect(result.summary).toContain("Roman Roads connected important cities.");
    expect(result.claims).toHaveLength(3);
    expect(result.tags[0]).toBe("roman");
    expect(result.entities).toContainEqual({ name: "Marcus Aurelius", type: "concept" });
    expect(result.openQuestions).toEqual([]);
  });

  it("uses the title when no sentence can be summarized", () => {
    expect(fallbackExtraction("Fallback title", "").summary).toBe("Fallback title");
  });

  it("normalizes a valid model response", () => {
    const result = parseExtractionJson(
      JSON.stringify({
        summary: "  concise summary  ",
        tags: [" history ", "", 42],
        entities: [{ name: "  Darius I ", type: " person " }, { name: "" }],
        claims: [
          { text: "  A supported claim. ", confidence: 1.4 },
          { text: "Low confidence", confidence: -2 },
          { text: "Unknown confidence", confidence: "not-a-number" },
          { text: "" },
        ],
        openQuestions: [" What changed? "],
      })
    );

    expect(result).toEqual({
      summary: "concise summary",
      tags: ["history", "42"],
      entities: [{ name: "Darius I", type: "person" }],
      claims: [
        { text: "A supported claim.", confidence: 1 },
        { text: "Low confidence", confidence: 0 },
        { text: "Unknown confidence", confidence: 0.5 },
      ],
      openQuestions: ["What changed?"],
    });
  });

  it("fills optional arrays and defaults entity types", () => {
    expect(
      parseExtractionJson(JSON.stringify({ summary: "Summary", entities: [{ name: "SQLite" }] }))
    ).toEqual({
      summary: "Summary",
      tags: [],
      entities: [{ name: "SQLite", type: "concept" }],
      claims: [],
      openQuestions: [],
    });
  });

  it("returns null for invalid JSON", () => {
    expect(parseExtractionJson("not json")).toBeNull();
  });
});
