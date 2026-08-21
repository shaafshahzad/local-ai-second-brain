import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

type RouteContext = { params: Promise<{ id: string }> };

const jsonRequest = (url: string, method: string, body: unknown) =>
  new Request(url, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }) as NextRequest;

describe.sequential("App Router API integration", () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "second-brain-routes-"));
  let captureRoute: typeof import("@/app/api/capture/route");
  let dashboardRoute: typeof import("@/app/api/dashboard/route");
  let sourcesRoute: typeof import("@/app/api/sources/route");
  let sourceRoute: typeof import("@/app/api/sources/[id]/route");
  let wikiPagesRoute: typeof import("@/app/api/wiki-pages/route");
  let wikiPageRoute: typeof import("@/app/api/wiki-pages/[id]/route");
  let db: typeof import("@/lib/db");
  let sourceId = 0;
  let wikiId = 0;

  beforeAll(async () => {
    vi.stubEnv("SECOND_BRAIN_VAULT_DIR", tempRoot);
    vi.stubEnv("SECOND_BRAIN_DB_PATH", path.join(tempRoot, "second-brain.sqlite"));
    vi.stubEnv("QDRANT_URL", "http://qdrant.test");
    vi.resetModules();
    [captureRoute, dashboardRoute, sourcesRoute, sourceRoute, wikiPagesRoute, wikiPageRoute, db] =
      await Promise.all([
        import("@/app/api/capture/route"),
        import("@/app/api/dashboard/route"),
        import("@/app/api/sources/route"),
        import("@/app/api/sources/[id]/route"),
        import("@/app/api/wiki-pages/route"),
        import("@/app/api/wiki-pages/[id]/route"),
        import("@/lib/db"),
      ]);
  });

  afterAll(() => {
    db.getDb().close();
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  it("validates and captures a Markdown note", async () => {
    const invalid = await captureRoute.POST(jsonRequest("http://test/api/capture", "POST", {}));
    expect(invalid.status).toBe(400);

    const response = await captureRoute.POST(
      jsonRequest("http://test/api/capture", "POST", {
        title: "Integration note",
        content: "A durable source body.",
      })
    );
    const payload = await response.json();
    sourceId = payload.sourceId;

    expect(response.status).toBe(200);
    expect(payload).toEqual(
      expect.objectContaining({
        title: "Integration note",
        localPath: "inbox/quick-notes/integration-note.md",
      })
    );
    expect(fs.readFileSync(path.join(tempRoot, payload.localPath), "utf8")).toContain(
      "A durable source body."
    );
  });

  it("lists, reads, updates, and reports the captured source", async () => {
    const listPayload = await (await sourcesRoute.GET()).json();
    expect(listPayload.sources).toEqual([
      expect.objectContaining({ id: sourceId, title: "Integration note" }),
    ]);

    const context: RouteContext = { params: Promise.resolve({ id: String(sourceId) }) };
    const readResponse = await sourceRoute.GET(new Request("http://test") as NextRequest, context);
    expect((await readResponse.json()).content).toContain("A durable source body.");

    const updateResponse = await sourceRoute.PATCH(
      jsonRequest("http://test", "PATCH", {
        title: "Edited integration note",
        sourceType: "personal_note",
        originalUrl: null,
        status: "needs_review",
        content: "# Edited\n\nUpdated body.",
      }),
      context
    );
    expect(updateResponse.status).toBe(200);
    expect((await updateResponse.json()).source).toEqual(
      expect.objectContaining({ title: "Edited integration note", status: "needs_review" })
    );

    const dashboard = await (await dashboardRoute.GET()).json();
    expect(dashboard.stats).toEqual({ sources: 1, unprocessed: 1, chunks: 0 });
  });

  it("creates, reads, updates, and deletes a wiki page with navigation refresh", async () => {
    const createResponse = await wikiPagesRoute.POST(
      jsonRequest("http://test/api/wiki-pages", "POST", {
        title: "Integration Concept",
        pageType: "concept",
      })
    );
    const created = await createResponse.json();
    wikiId = created.id;
    expect(created.path).toBe("wiki/concepts/integration-concept.md");

    const listPayload = await (await wikiPagesRoute.GET()).json();
    expect(listPayload.pages).toEqual([
      expect.objectContaining({ id: wikiId, title: "Integration Concept" }),
    ]);

    const context: RouteContext = { params: Promise.resolve({ id: String(wikiId) }) };
    expect(
      (await (await wikiPageRoute.GET(new Request("http://test") as NextRequest, context)).json())
        .content
    ).toContain("# Integration Concept");

    const updateResponse = await wikiPageRoute.PATCH(
      jsonRequest("http://test", "PATCH", {
        title: "Edited Concept",
        pageType: "concept",
        content: "# Edited Concept\n\nVerified content.",
      }),
      context
    );
    expect((await updateResponse.json()).page.title).toBe("Edited Concept");

    const deleteResponse = await wikiPageRoute.DELETE(
      new Request("http://test") as NextRequest,
      context
    );
    expect(await deleteResponse.json()).toEqual({ deleted: true });
    expect(fs.existsSync(path.join(tempRoot, created.path))).toBe(false);
  });

  it("deletes a source even when the rebuildable vector index is offline", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    const context: RouteContext = { params: Promise.resolve({ id: String(sourceId) }) };
    const response = await sourceRoute.DELETE(new Request("http://test") as NextRequest, context);
    expect(await response.json()).toEqual({ deleted: true });
    expect((await (await sourcesRoute.GET()).json()).sources).toEqual([]);
  });

  it("returns 404 for missing source and wiki records", async () => {
    const context: RouteContext = { params: Promise.resolve({ id: "99999" }) };
    expect(
      (await sourceRoute.GET(new Request("http://test") as NextRequest, context)).status
    ).toBe(404);
    expect(
      (await wikiPageRoute.GET(new Request("http://test") as NextRequest, context)).status
    ).toBe(404);
  });
});
