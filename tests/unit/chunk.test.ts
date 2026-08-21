import { describe, expect, it } from "vitest";
import {
  chunkText,
  estimateTokens,
  stripMarkdownFrontmatter,
} from "@/lib/chunk";

describe("chunk helpers", () => {
  it("strips LF and CRLF frontmatter", () => {
    expect(stripMarkdownFrontmatter("---\ntitle: Test\n---\nBody")).toBe("Body");
    expect(stripMarkdownFrontmatter("---\r\ntitle: Test\r\n---\r\nBody")).toBe(
      "Body"
    );
  });

  it("leaves ordinary Markdown intact apart from surrounding whitespace", () => {
    expect(stripMarkdownFrontmatter("  # Heading\n\nText  ")).toBe(
      "# Heading\n\nText"
    );
  });

  it("estimates tokens from normalized word count", () => {
    expect(estimateTokens("one two three four")).toBe(6);
    expect(estimateTokens("   ")).toBe(0);
  });

  it("creates overlapping chunks without duplicating the final window", () => {
    expect(chunkText("one two three four five six seven", 4, 1)).toEqual([
      "one two three four",
      "four five six seven",
    ]);
  });

  it("returns no chunks for empty or frontmatter-only input", () => {
    expect(chunkText("  ")).toEqual([]);
    expect(chunkText("---\ntitle: Empty\n---\n")).toEqual([]);
  });

  it("rejects chunk settings that could stall or skip progress", () => {
    expect(() => chunkText("text", 0, 0)).toThrow(RangeError);
    expect(() => chunkText("text", 5, -1)).toThrow(RangeError);
    expect(() => chunkText("text", 5, 5)).toThrow(RangeError);
    expect(() => chunkText("text", 5.5, 1)).toThrow(RangeError);
  });
});
