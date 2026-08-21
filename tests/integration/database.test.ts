import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

describe("SQLite repository", () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "second-brain-db-"));
  let db: typeof import("@/lib/db");

  beforeAll(async () => {
    vi.stubEnv("SECOND_BRAIN_VAULT_DIR", tempRoot);
    vi.stubEnv("SECOND_BRAIN_DB_PATH", path.join(tempRoot, "second-brain.sqlite"));
    vi.resetModules();
    db = await import("@/lib/db");
  });

  afterAll(() => {
    db.getDb().close();
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  it("migrates the database and maintains source records", () => {
    const id = db.insertSource({
      title: "Test capture",
      sourceType: "personal_note",
      localPath: "inbox/quick-notes/test-capture.md",
      hash: "original-hash",
    });

    expect(db.getSourceById(id)).toEqual(
      expect.objectContaining({
        title: "Test capture",
        status: "unprocessed",
        hash: "original-hash",
      })
    );
    expect(db.listSources()).toHaveLength(1);

    db.updateSourceRecord({
      id,
      title: "Updated capture",
      sourceType: "article",
      originalUrl: "https://example.com",
      status: "processed",
      hash: "new-hash",
    });
    expect(db.getSourceById(id)).toEqual(
      expect.objectContaining({ title: "Updated capture", status: "processed", hash: "new-hash" })
    );

    expect(db.getDashboardData().stats).toEqual({ sources: 1, unprocessed: 0, chunks: 0 });
    db.deleteSourceRecord(id);
    expect(db.getSourceById(id)).toBeUndefined();
  });

  it("creates, updates, lists, and deletes wiki pages", () => {
    const id = db.insertWikiPage({
      title: "SQLite",
      path: "wiki/concepts/sqlite.md",
      pageType: "concept",
    });
    expect(db.listWikiPages()).toEqual([
      expect.objectContaining({ id, title: "SQLite", page_type: "concept" }),
    ]);

    db.updateWikiPageRecord({ id, title: "SQLite Database", pageType: "technology" });
    expect(db.getWikiPageById(id)).toEqual(
      expect.objectContaining({ title: "SQLite Database", page_type: "technology" })
    );

    db.deleteWikiPageRecord(id);
    expect(db.getWikiPageById(id)).toBeUndefined();
  });
});
