import path from "node:path";

export const appRoot = process.cwd();

export const vaultRoot =
  process.env.SECOND_BRAIN_VAULT_DIR ??
  path.join(appRoot, "second-brain");

export const dbPath =
  process.env.SECOND_BRAIN_DB_PATH ?? path.join(vaultRoot, "second-brain.sqlite");

export const ollamaHost =
  process.env.OLLAMA_HOST ?? "http://127.0.0.1:11434";

export const chatModel = process.env.OLLAMA_CHAT_MODEL ?? "llama3.1";

export const embeddingModel =
  process.env.OLLAMA_EMBEDDING_MODEL ?? "nomic-embed-text";

export const qdrantUrl = process.env.QDRANT_URL ?? "http://127.0.0.1:6333";

export const qdrantCollection =
  process.env.QDRANT_COLLECTION ?? "second_brain_chunks";

export const defaultVaultFolders = [
  "inbox/quick-notes",
  "inbox/clipped-pages",
  "inbox/uploads",
  "sources/articles",
  "sources/wikipedia",
  "sources/pdfs",
  "sources/videos",
  "sources/books",
  "sources/personal-notes",
  "wiki/history",
  "wiki/home",
  "wiki/programming",
  "wiki/islam",
  "wiki/health",
  "wiki/finance",
  "wiki/people",
  "wiki/places",
  "wiki/concepts",
  "maps",
  "questions",
  "logs",
  "config",
];

