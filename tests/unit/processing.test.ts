import { describe, expect, it, vi } from "vitest";
import { fetchUrlAsMarkdown, markdownForSource, sha256 } from "@/lib/processing";

describe("processing primitives", () => {
  it("creates stable SHA-256 hashes", () => {
    expect(sha256("second brain")).toBe(
      "88a3cb18bbbbe5e94d4773a93bc50963e6f3c6a85243d4799db4e971d4714c10"
    );
  });

  it("serializes source metadata and content as Markdown", () => {
    const markdown = markdownForSource({
      title: 'A "quoted" title',
      sourceType: "article",
      originalUrl: "https://example.com/note",
      body: "  Saved body.  ",
    });

    expect(markdown).toContain('title: "A \\"quoted\\" title"');
    expect(markdown).toContain('original_url: "https://example.com/note"');
    expect(markdown).toContain("# A \"quoted\" title");
    expect(markdown).toContain("Source: https://example.com/note\n\nSaved body.");
  });

  it("converts a basic HTML page to readable text", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          "<html><head><title> Example   Page </title><style>.x{}</style></head><body><h1>Hello &amp; welcome</h1><script>ignore()</script><p>Useful text.</p></body></html>",
          { status: 200 }
        )
      )
    );

    await expect(fetchUrlAsMarkdown("https://example.com")).resolves.toEqual({
      title: "Example Page",
      body: "Example Page Hello & welcome Useful text.",
    });
  });

  it("rejects non-success URL captures", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("missing", { status: 404 })));
    await expect(fetchUrlAsMarkdown("https://example.com/missing")).rejects.toThrow(
      "URL returned HTTP 404"
    );
  });
});
