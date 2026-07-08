import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { getDb, insertWikiPage, listWikiPages, SourceRow, WikiPageRow } from "@/lib/db";
import { chunkText, estimateTokens, stripMarkdownFrontmatter } from "@/lib/chunk";
import { chat, embedMany, embedText } from "@/lib/ollama";
import { searchChunkVectors, upsertChunkVectors } from "@/lib/qdrant";
import {
  ExtractedKnowledge,
  fallbackExtraction,
  parseExtractionJson,
} from "@/lib/extract";
import {
  appendLog,
  appendWikiLog,
  slugify,
  uniqueMarkdownPath,
  vaultPath,
  writeMarkdown,
} from "@/lib/vault";

export function sha256(text: string) {
  return crypto.createHash("sha256").update(text).digest("hex");
}

export function markdownForSource(input: {
  title: string;
  sourceType: string;
  originalUrl?: string | null;
  body: string;
}) {
  return `---
title: ${JSON.stringify(input.title)}
source_type: ${JSON.stringify(input.sourceType)}
original_url: ${JSON.stringify(input.originalUrl ?? "")}
captured_at: ${JSON.stringify(new Date().toISOString())}
---

# ${input.title}

${input.originalUrl ? `Source: ${input.originalUrl}\n\n` : ""}${input.body.trim()}
`;
}

export async function fetchUrlAsMarkdown(url: string) {
  const response = await fetch(url, {
    headers: {
      "user-agent": "LocalSecondBrain/0.1 (+local capture)",
    },
  });

  if (!response.ok) {
    throw new Error(`URL returned HTTP ${response.status}`);
  }

  const html = await response.text();
  const title =
    html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]
      ?.replace(/\s+/g, " ")
      .trim() ?? new URL(url).hostname;
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();

  return { title, body: text };
}

export async function processInbox(limit = 10) {
  const database = getDb();
  const sources = database
    .prepare(
      `select * from sources where status != 'processed' order by datetime(created_at) asc limit ?`
    )
    .all(limit) as SourceRow[];

  const results = [];
  for (const source of sources) {
    results.push(await processSource(source));
  }

  return results;
}

export async function processSource(source: SourceRow) {
  const database = getDb();
  const text = fs.readFileSync(vaultPath(source.local_path), "utf8");
  const cleanText = stripMarkdownFrontmatter(text);
  const chunks = chunkText(cleanText);
  const warnings: string[] = [];

  database.prepare(`delete from chunks where source_id = ?`).run(source.id);
  const chunkRows = chunks.map((chunk, index) => {
    const result = database
      .prepare(
        `insert into chunks (source_id, chunk_index, text, token_count)
         values (?, ?, ?, ?)`
      )
      .run(source.id, index, chunk, estimateTokens(chunk));

    return {
      id: Number(result.lastInsertRowid),
      chunk_index: index,
      text: chunk,
    };
  });

  try {
    const embeddings = await embedMany(chunkRows.map((chunk) => chunk.text));
    await upsertChunkVectors(
      chunkRows.map((chunk, index) => ({
        id: chunk.id,
        vector: embeddings[index],
        payload: {
          type: "source_chunk",
          source_id: source.id,
          chunk_id: chunk.id,
          chunk_index: chunk.chunk_index,
          path: source.local_path,
          title: source.title,
          created_at: source.created_at,
          source_type: source.source_type,
          text: chunk.text,
        },
      }))
    );
  } catch (error) {
    warnings.push(
      `Embedding/vector indexing skipped: ${
        error instanceof Error ? error.message : "unknown error"
      }`
    );
  }

  const extraction = await extractKnowledge(source.title, cleanText, warnings);
  saveExtraction(source, extraction);
  const touchedPages = createWikiPages(source, extraction);

  const now = new Date().toISOString();
  database
    .prepare(
      `update sources set status = 'processed', processed_at = ?, summary = ? where id = ?`
    )
    .run(now, extraction.summary, source.id);

  appendLog(`## ${now} - ${source.title}

- Source: ${source.local_path}
- Chunks: ${chunkRows.length}
- Tags: ${extraction.tags.join(", ") || "none"}
- Entities: ${extraction.entities.map((entity) => entity.name).join(", ") || "none"}
${warnings.map((warning) => `- Warning: ${warning}`).join("\n")}
`);
  refreshWikiNavigation({
    action: "ingest",
    title: source.title,
    detailLines: [
      `- Source: ${source.local_path}`,
      `- Wiki pages touched: ${touchedPages.join(", ") || "none"}`,
      `- Tags: ${extraction.tags.join(", ") || "none"}`,
    ],
  });

  return {
    sourceId: source.id,
    title: source.title,
    chunks: chunkRows.length,
    tags: extraction.tags,
    entities: extraction.entities,
    warnings,
  };
}

export async function semanticSearch(query: string, limit = 8) {
  const queryVector = await embedText(query);
  const results = await searchChunkVectors(queryVector, limit);

  return results.map((result) => ({
    id: result.id,
    score: result.score,
    payload: result.payload,
  }));
}

export async function answerQuestion(question: string) {
  const matches = await semanticSearch(question, 8);
  const wikiContext = buildWikiQuestionContext(question);
  const context = matches
    .map((match, index) => {
      const payload = match.payload as Record<string, unknown>;
      return `[${index + 1}] ${payload.title}
Path: ${payload.path}
Text: ${payload.text}`;
    })
    .join("\n\n");

  const answer = await chat([
    {
      role: "system",
      content:
        "Answer only from the provided local second-brain context. Treat the wiki as the maintained synthesis and raw chunks as supporting evidence. If the context is insufficient, say what is missing. Cite local file paths inline.",
    },
    {
      role: "user",
      content: `Question: ${question}

Maintained wiki context:
${wikiContext || "No maintained wiki context found yet."}

Local context:
${context}`,
    },
  ]);

  return { answer, sources: matches };
}

export function fileAnswerToWiki(input: {
  question: string;
  answer: string;
  title?: string;
  sourcePaths?: string[];
}) {
  const title = uniqueWikiTitle(input.title?.trim() || titleFromQuestion(input.question));
  const localPath = uniqueMarkdownPath("wiki/answers", title);
  const now = new Date().toISOString();
  const sourceLines = [...new Set(input.sourcePaths ?? [])]
    .filter(Boolean)
    .map((sourcePath) => `- [${sourcePath}](../../${sourcePath})`)
    .join("\n");

  writeMarkdown(
    localPath,
    `# ${title}

## Question

${input.question}

## Answer

${input.answer.trim()}

## Related Sources

${sourceLines || "- No source paths were returned with this answer."}

## Related Pages

- 

## Open Questions

- 

## Last Updated

${now}
`
  );

  const id = insertWikiPage({
    title,
    path: localPath,
    pageType: "answer",
  });

  refreshWikiNavigation({
    action: "query",
    title,
    detailLines: [
      `- Filed answer: ${localPath}`,
      `- Question: ${input.question}`,
      `- Sources: ${[...new Set(input.sourcePaths ?? [])].join(", ") || "none"}`,
    ],
  });

  return { id, path: localPath, title };
}

async function extractKnowledge(
  title: string,
  text: string,
  warnings: string[]
): Promise<ExtractedKnowledge> {
  const fallback = fallbackExtraction(title, text);

  try {
    const raw = await chat(
      [
        {
          role: "system",
          content:
            "Extract source-backed personal knowledge. Return compact JSON with keys: summary string, tags string[], entities {name,type}[], claims {text,confidence}[], openQuestions string[]. Do not invent facts.",
        },
        {
          role: "user",
          content: `Title: ${title}

Source text:
${text.slice(0, 9000)}`,
        },
      ],
      "json"
    );
    const parsed = parseExtractionJson(raw);
    if (parsed?.summary) return parsed;
    warnings.push("Ollama extraction returned invalid JSON; used heuristic extraction.");
  } catch (error) {
    warnings.push(
      `Ollama extraction skipped: ${
        error instanceof Error ? error.message : "unknown error"
      }`
    );
  }

  return fallback;
}

function saveExtraction(source: SourceRow, extraction: ExtractedKnowledge) {
  const database = getDb();

  for (const tag of extraction.tags) {
    const normalized = tag.toLowerCase().trim();
    if (!normalized) continue;
    database.prepare(`insert or ignore into tags (name) values (?)`).run(normalized);
    const row = database
      .prepare(`select id from tags where name = ?`)
      .get(normalized) as { id: number };
    database
      .prepare(`insert or ignore into source_tags (source_id, tag_id) values (?, ?)`)
      .run(source.id, row.id);
  }

  for (const entity of extraction.entities) {
    const pagePath = wikiPathForEntity(entity.name, entity.type);
    database
      .prepare(
        `insert or ignore into entities (name, entity_type, canonical_page_path)
         values (?, ?, ?)`
      )
      .run(entity.name, entity.type, pagePath);
    const row = database
      .prepare(`select id from entities where name = ?`)
      .get(entity.name) as { id: number };
    database
      .prepare(
        `insert or ignore into source_entities (source_id, entity_id) values (?, ?)`
      )
      .run(source.id, row.id);
  }

  database.prepare(`delete from claims where source_id = ?`).run(source.id);
  for (const claim of extraction.claims) {
    database
      .prepare(
        `insert into claims (source_id, claim_text, confidence, page_path)
         values (?, ?, ?, ?)`
      )
      .run(source.id, claim.text, clampConfidence(claim.confidence), null);

    if (claim.confidence < 0.55) {
      database
        .prepare(
          `insert into review_items (item_type, title, payload, created_at)
           values ('low_confidence_claim', ?, ?, ?)`
        )
        .run(
          source.title,
          JSON.stringify({ sourceId: source.id, claim }),
          new Date().toISOString()
        );
    }
  }
}

function createWikiPages(source: SourceRow, extraction: ExtractedKnowledge) {
  const database = getDb();
  const entities = extraction.entities.slice(0, 8);
  const touchedPages: string[] = [];

  for (const entity of entities) {
    const pagePath = wikiPathForEntity(entity.name, entity.type);
    const absolutePath = vaultPath(pagePath);
    const now = new Date().toISOString();
    const sourceLink = path.relative(path.dirname(pagePath), source.local_path);
    const claimLines = extraction.claims
      .slice(0, 5)
      .map((claim) => `- ${claim.text} ([source](${sourceLink}))`)
      .join("\n");

    if (!fs.existsSync(absolutePath)) {
      writeMarkdown(
        pagePath,
        `# ${entity.name}

## Overview

Auto-created from [[${source.title}]].

## Key Points

${claimLines || "- No source-backed claims extracted yet."}

## Related Sources

- [${source.title}](${sourceLink})

## Related Pages

- 

## Open Questions

${extraction.openQuestions.map((question) => `- ${question}`).join("\n") || "- "}

## Last Updated

${now}
`
      );
      database
        .prepare(
          `insert or ignore into wiki_pages (title, path, page_type, updated_at)
           values (?, ?, ?, ?)`
        )
        .run(entity.name, pagePath, entity.type, now);
      touchedPages.push(pagePath);
    } else {
      fs.appendFileSync(
        absolutePath,
        `\n\n## Update - ${now}\n\nFrom [${source.title}](${sourceLink}):\n\n${
          claimLines || "- No source-backed claims extracted yet."
        }\n`,
        "utf8"
      );
      database
        .prepare(
          `insert into wiki_pages (title, path, page_type, updated_at)
           values (?, ?, ?, ?)
           on conflict(title) do update set updated_at = excluded.updated_at, path = excluded.path`
        )
        .run(entity.name, pagePath, entity.type, now);
      touchedPages.push(pagePath);
    }
  }

  return touchedPages;
}

function wikiPathForEntity(name: string, type: string) {
  const folder =
    type.toLowerCase().includes("person") || type.toLowerCase() === "people"
      ? "wiki/people"
      : type.toLowerCase().includes("place")
        ? "wiki/places"
        : "wiki/concepts";

  return `${folder}/${slugify(name)}.md`;
}

function clampConfidence(confidence: number) {
  if (Number.isNaN(confidence)) return 0.5;
  return Math.max(0, Math.min(1, confidence));
}

export function refreshWikiNavigation(input: {
  action: "ingest" | "query" | "lint" | "manual";
  title: string;
  detailLines: string[];
}) {
  rebuildWikiIndex();
  const date = new Date().toISOString().slice(0, 10);
  appendWikiLog(`## [${date}] ${input.action} | ${input.title}

${input.detailLines.join("\n")}
`);
}

function rebuildWikiIndex() {
  const pages = listWikiPages();
  const grouped = pages.reduce<Record<string, WikiPageRow[]>>((accumulator, page) => {
    const key = page.page_type || "page";
    accumulator[key] ??= [];
    accumulator[key].push(page);
    return accumulator;
  }, {});
  const sections = Object.entries(grouped)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([pageType, rows]) => {
      const pageLines = rows
        .sort((left, right) => left.title.localeCompare(right.title))
        .map(
          (page) =>
            `- [${page.title}](./${path.relative("wiki", page.path).split(path.sep).join("/")}) - ${page.page_type}; updated ${page.updated_at.slice(0, 10)}`
        )
        .join("\n");
      return `## ${titleCase(pageType)}\n\n${pageLines}`;
    })
    .join("\n\n");

  writeMarkdown(
    "wiki/index.md",
    `# Wiki Index

This is the content-oriented catalog of the maintained wiki. The app updates it after ingests and filed answers.

${sections || "No wiki pages yet."}
`
  );
}

function buildWikiQuestionContext(question: string) {
  const index = safeReadVaultFile("wiki/index.md");
  const pages = listWikiPages();
  const tokens = tokenize(question);
  const rankedPages = pages
    .map((page) => ({
      page,
      score: scoreWikiPage(page, tokens),
    }))
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, 4)
    .map(({ page }) => {
      const text = safeReadVaultFile(page.path).slice(0, 3500);
      return `Page: ${page.title}
Path: ${page.path}
${text}`;
    })
    .join("\n\n");

  return [`Index:\n${index.slice(0, 5000)}`, rankedPages].filter(Boolean).join("\n\n");
}

function scoreWikiPage(page: WikiPageRow, tokens: string[]) {
  const haystack = `${page.title} ${page.path} ${page.page_type}`.toLowerCase();
  return tokens.reduce((score, token) => score + (haystack.includes(token) ? 1 : 0), 0);
}

function safeReadVaultFile(relativePath: string) {
  try {
    return fs.readFileSync(vaultPath(relativePath), "utf8");
  } catch {
    return "";
  }
}

function tokenize(value: string) {
  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 2);
}

function titleFromQuestion(question: string) {
  const cleaned = question
    .replace(/[?!.]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return "Filed Answer";
  return cleaned.length > 70 ? `${cleaned.slice(0, 67).trim()}...` : cleaned;
}

function uniqueWikiTitle(title: string) {
  const existingTitles = new Set(
    listWikiPages().map((page) => page.title.trim().toLowerCase())
  );
  let candidate = title;
  let index = 2;

  while (existingTitles.has(candidate.toLowerCase())) {
    candidate = `${title} ${index}`;
    index += 1;
  }

  return candidate;
}

function titleCase(value: string) {
  return value.replace(/\b\w/g, (character) => character.toUpperCase());
}
