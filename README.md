# Local AI Second Brain

A local-first second brain MVP built with Next.js, Markdown files, SQLite, Ollama, and Qdrant.

## What Works

- Paste text, URLs, quick notes, or uploaded `.md` / `.txt` content into the inbox.
- Save raw Markdown sources under a configurable local vault.
- Track source metadata, chunks, entities, tags, claims, wiki pages, and review items in SQLite.
- Process unprocessed sources into chunks.
- Use Ollama for local summaries, entities, claims, tags, embeddings, and answers.
- Use Qdrant for local semantic search over source chunks.
- Auto-create Markdown wiki pages from extracted entities with source links.
- Ask questions over retrieved local snippets with local-only LLM responses.

## Local Setup

```bash
bun install
docker compose up -d qdrant
brew install ollama
ollama serve
ollama pull llama3.1
ollama pull nomic-embed-text
bun run dev
```

Open [http://localhost:3000](http://localhost:3000).

If Ollama is already installed, skip `brew install ollama`.

## Configuration

Copy `.env.example` to `.env.local` if you want to override defaults.

```bash
SECOND_BRAIN_VAULT_DIR=/absolute/path/to/second-brain
SECOND_BRAIN_DB_PATH=/absolute/path/to/second-brain/second-brain.sqlite
OLLAMA_HOST=http://127.0.0.1:11434
OLLAMA_CHAT_MODEL=llama3.1
OLLAMA_EMBEDDING_MODEL=nomic-embed-text
QDRANT_URL=http://127.0.0.1:6333
QDRANT_COLLECTION=second_brain_chunks
```

By default, the app creates a `second-brain/` vault inside this project directory.

## Useful Commands

```bash
bun run dev
bun run lint
bun run typecheck
bun run test
bun run test:coverage
bun run test:e2e
bun run verify
bun run build
bun run qdrant:up
bun run ollama:pull
```

`bun run test` runs unit, component, filesystem, SQLite, and route-handler tests.
`bun run test:e2e` builds the production app and runs Chromium through the
capture, library, and wiki CRUD workflows using an isolated test vault.

## Vault Layout

The app creates this local vault shape:

```text
second-brain/
  inbox/
  sources/
  wiki/
  maps/
  questions/
  logs/
  config/
  second-brain.sqlite
```

Raw captures stay as Markdown. SQLite and Qdrant are rebuildable indexes over the vault.

## Current Limits

- URL capture uses a basic HTML-to-text stripper. A later phase should add a proper readability extractor.
- Review queue persistence exists for low-confidence claims, but approve/reject/edit UI actions are not implemented yet.
- PDF OCR, YouTube transcripts, browser extension capture, voice notes, and scheduled processing are intentionally deferred.
