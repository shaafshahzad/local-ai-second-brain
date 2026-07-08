import fs from "node:fs";
import path from "node:path";
import { defaultVaultFolders, vaultRoot } from "@/lib/config";

const agentRules = `# Second Brain Agent Rules

You maintain my local personal knowledge base.

Your main job is not one-off retrieval. Your main job is to maintain a persistent,
source-backed wiki that compounds over time. Raw sources are immutable evidence.
The wiki is the compiled, interlinked understanding built from that evidence.

## Core principles

- Preserve raw sources.
- Do not invent facts.
- Keep source-backed claims traceable.
- Prefer Markdown files that are readable without the app.
- Update existing pages before creating duplicates.
- Treat the wiki as the durable working artifact, not a temporary answer cache.
- Use raw sources as citations and evidence, but synthesize in wiki pages.
- Flag contradictions when a new source challenges an older wiki claim.
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
9. Update wiki/index.md.
10. Append a parseable entry to wiki/log.md.

## Query handling

When answering a question:

1. Read wiki/index.md first to find relevant maintained pages.
2. Prefer the wiki's existing synthesis, then check raw source chunks for evidence.
3. Cite local source or wiki paths inline.
4. If the answer creates reusable synthesis, file it as a wiki page.

## Maintenance handling

Periodically lint the wiki for:

- contradictions between pages
- stale claims superseded by newer sources
- orphan pages
- missing backlinks
- important concepts mentioned without pages
- useful open questions or source gaps

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

const wikiSchema = `# Wiki Maintainer Schema

The vault has three layers:

1. Raw sources: immutable Markdown captures under sources/ and inbox/.
2. Wiki: LLM-maintained Markdown pages under wiki/.
3. Schema and logs: configuration in config/, navigation in wiki/index.md, chronology in wiki/log.md.

## Operations

### Ingest

- Normalize and preserve the source.
- Extract summary, tags, entities, claims, and open questions.
- Update existing wiki pages before creating new pages.
- Add source-backed claims with links to raw source files.
- Update wiki/index.md after page changes.
- Append a chronological entry to wiki/log.md.

### Query

- Search wiki/index.md and relevant wiki pages first.
- Use raw source chunks as supporting evidence.
- Produce cited answers.
- File durable analysis back into wiki/answers/ when the answer is reusable.

### Lint

- Look for contradictions, stale claims, duplicate pages, orphan pages, missing citations, and missing cross-links.
- Record unresolved research questions in questions/open-questions.md.
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
  writeIfMissing("config/wiki-maintainer-schema.md", wikiSchema);
  writeIfMissing("config/taxonomy.yaml", taxonomy);
  writeIfMissing("logs/ingest-log.md", "# Ingest Log\n");
  writeIfMissing("wiki/index.md", "# Wiki Index\n\nNo wiki pages yet.\n");
  writeIfMissing("wiki/log.md", "# Wiki Log\n");
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

export function appendWikiLog(entry: string) {
  fs.appendFileSync(vaultPath("wiki/log.md"), `\n${entry}\n`, "utf8");
}

function writeIfMissing(relativePath: string, content: string) {
  const absolutePath = vaultPath(relativePath);
  if (!fs.existsSync(absolutePath)) {
    fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
    fs.writeFileSync(absolutePath, content, "utf8");
  }
}
