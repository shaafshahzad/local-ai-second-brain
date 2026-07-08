import Database from "better-sqlite3";
import { dbPath } from "@/lib/config";
import { ensureVault } from "@/lib/vault";

let db: Database.Database | undefined;

export type SourceRow = {
  id: number;
  title: string;
  source_type: string;
  original_url: string | null;
  local_path: string;
  created_at: string;
  processed_at: string | null;
  status: string;
  hash: string;
  summary: string | null;
};

export type ChunkRow = {
  id: number;
  source_id: number;
  chunk_index: number;
  text: string;
  token_count: number;
};

export type WikiPageRow = {
  id: number;
  title: string;
  path: string;
  page_type: string;
  updated_at: string;
};

export function getDb() {
  if (!db) {
    ensureVault();
    db = new Database(dbPath);
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");
    migrate(db);
  }

  return db;
}

function migrate(database: Database.Database) {
  database.exec(`
    create table if not exists sources (
      id integer primary key autoincrement,
      title text not null,
      source_type text not null,
      original_url text,
      local_path text not null unique,
      created_at text not null,
      processed_at text,
      status text not null,
      hash text not null,
      summary text
    );

    create table if not exists chunks (
      id integer primary key autoincrement,
      source_id integer not null references sources(id) on delete cascade,
      chunk_index integer not null,
      text text not null,
      token_count integer not null,
      unique(source_id, chunk_index)
    );

    create table if not exists entities (
      id integer primary key autoincrement,
      name text not null unique,
      entity_type text not null,
      canonical_page_path text
    );

    create table if not exists source_entities (
      source_id integer not null references sources(id) on delete cascade,
      entity_id integer not null references entities(id) on delete cascade,
      primary key (source_id, entity_id)
    );

    create table if not exists wiki_pages (
      id integer primary key autoincrement,
      title text not null unique,
      path text not null unique,
      page_type text not null,
      updated_at text not null
    );

    create table if not exists claims (
      id integer primary key autoincrement,
      source_id integer not null references sources(id) on delete cascade,
      claim_text text not null,
      confidence real not null default 0.5,
      page_path text
    );

    create table if not exists tags (
      id integer primary key autoincrement,
      name text not null unique
    );

    create table if not exists source_tags (
      source_id integer not null references sources(id) on delete cascade,
      tag_id integer not null references tags(id) on delete cascade,
      primary key (source_id, tag_id)
    );

    create table if not exists review_items (
      id integer primary key autoincrement,
      item_type text not null,
      title text not null,
      payload text not null,
      status text not null default 'pending',
      created_at text not null
    );
  `);
}

export function insertSource(input: {
  title: string;
  sourceType: string;
  originalUrl?: string | null;
  localPath: string;
  hash: string;
}) {
  const database = getDb();
  const now = new Date().toISOString();
  const result = database
    .prepare(
      `insert into sources
       (title, source_type, original_url, local_path, created_at, status, hash)
       values (?, ?, ?, ?, ?, 'unprocessed', ?)`
    )
    .run(
      input.title,
      input.sourceType,
      input.originalUrl ?? null,
      input.localPath,
      now,
      input.hash
    );

  return Number(result.lastInsertRowid);
}

export function getDashboardData() {
  const database = getDb();
  const recentSources = database
    .prepare(
      `select * from sources order by datetime(created_at) desc limit 8`
    )
    .all() as SourceRow[];
  const unprocessedCount = database
    .prepare(`select count(*) as count from sources where status != 'processed'`)
    .get() as { count: number };
  const sourceCount = database
    .prepare(`select count(*) as count from sources`)
    .get() as { count: number };
  const chunkCount = database
    .prepare(`select count(*) as count from chunks`)
    .get() as { count: number };
  const tagRows = database
    .prepare(
      `select tags.name, count(*) as count
       from tags
       join source_tags on source_tags.tag_id = tags.id
       group by tags.id
       order by count desc, tags.name asc
       limit 10`
    )
    .all() as { name: string; count: number }[];
  const recentWikiPages = database
    .prepare(`select * from wiki_pages order by datetime(updated_at) desc limit 8`)
    .all() as { title: string; path: string; page_type: string; updated_at: string }[];
  const reviewItems = database
    .prepare(
      `select * from review_items where status = 'pending' order by datetime(created_at) desc limit 8`
    )
    .all() as {
      id: number;
      item_type: string;
      title: string;
      payload: string;
      status: string;
      created_at: string;
    }[];

  return {
    recentSources,
    recentWikiPages,
    reviewItems,
    stats: {
      sources: sourceCount.count,
      unprocessed: unprocessedCount.count,
      chunks: chunkCount.count,
    },
    suggestedTopics: tagRows,
  };
}

export function listSources() {
  return getDb()
    .prepare(`select * from sources order by datetime(created_at) desc`)
    .all() as SourceRow[];
}

export function getSourceById(id: number) {
  return getDb()
    .prepare(`select * from sources where id = ?`)
    .get(id) as SourceRow | undefined;
}

export function updateSourceRecord(input: {
  id: number;
  title: string;
  sourceType: string;
  originalUrl?: string | null;
  status: string;
  hash: string;
}) {
  getDb()
    .prepare(
      `update sources
       set title = ?, source_type = ?, original_url = ?, status = ?, hash = ?
       where id = ?`
    )
    .run(
      input.title,
      input.sourceType,
      input.originalUrl ?? null,
      input.status,
      input.hash,
      input.id
    );
}

export function deleteSourceRecord(id: number) {
  getDb().prepare(`delete from sources where id = ?`).run(id);
}

export function listWikiPages() {
  return getDb()
    .prepare(`select * from wiki_pages order by lower(title) asc`)
    .all() as WikiPageRow[];
}

export function getWikiPageById(id: number) {
  return getDb()
    .prepare(`select * from wiki_pages where id = ?`)
    .get(id) as WikiPageRow | undefined;
}

export function insertWikiPage(input: {
  title: string;
  path: string;
  pageType: string;
}) {
  const result = getDb()
    .prepare(
      `insert into wiki_pages (title, path, page_type, updated_at)
       values (?, ?, ?, ?)`
    )
    .run(input.title, input.path, input.pageType, new Date().toISOString());

  return Number(result.lastInsertRowid);
}

export function updateWikiPageRecord(input: {
  id: number;
  title: string;
  pageType: string;
}) {
  getDb()
    .prepare(
      `update wiki_pages
       set title = ?, page_type = ?, updated_at = ?
       where id = ?`
    )
    .run(input.title, input.pageType, new Date().toISOString(), input.id);
}

export function deleteWikiPageRecord(id: number) {
  getDb().prepare(`delete from wiki_pages where id = ?`).run(id);
}
