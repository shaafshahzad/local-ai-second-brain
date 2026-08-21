import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

describe("vault filesystem", () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "second-brain-vault-"));
  let vault: typeof import("@/lib/vault");

  beforeAll(async () => {
    vi.stubEnv("SECOND_BRAIN_VAULT_DIR", tempRoot);
    vi.stubEnv("SECOND_BRAIN_DB_PATH", path.join(tempRoot, "test.sqlite"));
    vi.resetModules();
    vault = await import("@/lib/vault");
  });

  afterAll(() => {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  it("creates the complete vault skeleton and seed files idempotently", () => {
    vault.ensureVault();
    vault.ensureVault();

    expect(fs.existsSync(path.join(tempRoot, "inbox", "quick-notes"))).toBe(true);
    expect(fs.readFileSync(path.join(tempRoot, "wiki", "index.md"), "utf8")).toContain(
      "# Wiki Index"
    );
    expect(fs.readFileSync(path.join(tempRoot, "config", "agent-rules.md"), "utf8")).toContain(
      "Preserve raw sources"
    );
  });

  it("keeps resolved paths inside the vault", () => {
    expect(vault.vaultPath("wiki/concepts/sqlite.md")).toBe(
      path.join(tempRoot, "wiki", "concepts", "sqlite.md")
    );
    expect(() => vault.vaultPath("../../outside.txt")).toThrow(
      "Path escapes the second-brain vault"
    );
  });

  it("writes, reads, updates, and deletes Markdown", () => {
    const relativePath = "wiki/concepts/test-note.md";
    const absolutePath = vault.writeMarkdown(relativePath, "# First");
    expect(vault.toVaultRelative(absolutePath)).toBe(relativePath);
    expect(vault.readVaultFile(relativePath)).toBe("# First");

    vault.updateVaultFile(relativePath, "# Updated");
    expect(vault.readVaultFile(relativePath)).toBe("# Updated");

    vault.deleteVaultFile(relativePath);
    expect(fs.existsSync(absolutePath)).toBe(false);
    expect(() => vault.updateVaultFile(relativePath, "missing")).toThrow(
      "Vault file not found"
    );
  });

  it("creates safe slugs and collision-free Markdown paths", () => {
    expect(vault.slugify("Darius I: King's Rule")).toBe("darius-i-kings-rule");
    expect(vault.slugify("***")).toMatch(/^note-\d+$/);

    const first = vault.uniqueMarkdownPath("wiki/concepts", "Same title");
    vault.writeMarkdown(first, "first");
    expect(vault.uniqueMarkdownPath("wiki/concepts", "Same title")).toBe(
      "wiki/concepts/same-title-2.md"
    );
  });

  it("appends operational and wiki logs", () => {
    vault.appendLog("capture entry");
    vault.appendWikiLog("wiki entry");
    expect(vault.readVaultFile("logs/ingest-log.md")).toContain("capture entry");
    expect(vault.readVaultFile("wiki/log.md")).toContain("wiki entry");
  });
});
