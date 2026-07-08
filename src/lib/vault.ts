import fs from "node:fs";
import path from "node:path";
import { defaultVaultFolders, vaultRoot } from "@/lib/config";

const agentRules = `# Second Brain Agent Rules

You maintain my local personal knowledge base.

## Core principles

- Preserve raw sources.
- Do not invent facts.
- Keep source-backed claims traceable.
- Prefer Markdown files that are readable without the app.
- Update existing pages before creating duplicates.
- Mark uncertainty clearly.
- Add unresolved questions to the questions folder.
- Do not delete user notes unless explicitly requested.

## Source handling

For each new source:

1. Create a raw source file.
2. Extract the title, author, URL, date, and source type when available.
3. Write a concise summary.
4. Extract important claims.
5. Extract people, places, dates, events, and concepts.
6. Suggest tags.
7. Link the source to relevant wiki pages.
8. Create new wiki pages only when useful.
9. Add a log entry.

## Wiki page format

Each wiki page should use:

- Overview
- Key points
- Related sources
- Related pages
- Open questions
- Last updated

## Citation rule

Every factual claim added to a wiki page should link back to a source file whenever possible.
`;

const taxonomy = `topics:
  - history
  - home
  - programming
  - islam
  - health
  - finance
  - people
  - places
  - concepts
`;

export function ensureVault() {
  fs.mkdirSync(vaultRoot, { recursive: true });

  for (const folder of defaultVaultFolders) {
    fs.mkdirSync(path.join(vaultRoot, folder), { recursive: true });
  }

  writeIfMissing("config/agent-rules.md", agentRules);
  writeIfMissing("config/taxonomy.yaml", taxonomy);
  writeIfMissing("logs/ingest-log.md", "# Ingest Log\n");
  writeIfMissing("questions/open-questions.md", "# Open Questions\n");
  writeIfMissing("questions/research-threads.md", "# Research Threads\n");
}

export function vaultPath(relativePath: string) {
  const normalized = relativePath.replace(/^[/\\]+/, "");
  const absolutePath = path.resolve(vaultRoot, normalized);

  if (absolutePath !== vaultRoot && !absolutePath.startsWith(`${vaultRoot}${path.sep}`)) {
    throw new Error("Path escapes the second-brain vault");
  }

  return absolutePath;
}

export function toVaultRelative(absolutePath: string) {
  return path.relative(vaultRoot, absolutePath).split(path.sep).join("/");
}

export function slugify(value: string) {
  const slug = value
    .toLowerCase()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);

  return slug || `note-${Date.now()}`;
}

export function uniqueMarkdownPath(folder: string, title: string) {
  const base = slugify(title);
  let candidate = path.join(folder, `${base}.md`);
  let index = 2;

  while (fs.existsSync(vaultPath(candidate))) {
    candidate = path.join(folder, `${base}-${index}.md`);
    index += 1;
  }

  return candidate.split(path.sep).join("/");
}

export function writeMarkdown(relativePath: string, content: string) {
  const absolutePath = vaultPath(relativePath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, content, "utf8");
  return absolutePath;
}

export function readVaultFile(relativePath: string) {
  return fs.readFileSync(vaultPath(relativePath), "utf8");
}

export function updateVaultFile(relativePath: string, content: string) {
  const absolutePath = vaultPath(relativePath);
  if (!fs.existsSync(absolutePath)) {
    throw new Error(`Vault file not found: ${relativePath}`);
  }
  fs.writeFileSync(absolutePath, content, "utf8");
}

export function deleteVaultFile(relativePath: string) {
  const absolutePath = vaultPath(relativePath);
  if (fs.existsSync(absolutePath)) {
    fs.unlinkSync(absolutePath);
  }
}

export function appendLog(entry: string) {
  fs.appendFileSync(vaultPath("logs/ingest-log.md"), `\n${entry}\n`, "utf8");
}

function writeIfMissing(relativePath: string, content: string) {
  const absolutePath = vaultPath(relativePath);
  if (!fs.existsSync(absolutePath)) {
    fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
    fs.writeFileSync(absolutePath, content, "utf8");
  }
}
