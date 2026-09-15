"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";

type DashboardData = {
  vaultRoot: string;
  stats: { sources: number; unprocessed: number; chunks: number };
  recentSources: SourceItem[];
  recentWikiPages: WikiPageItem[];
  reviewItems: {
    id: number;
    item_type: string;
    title: string;
    created_at: string;
  }[];
  suggestedTopics: { name: string; count: number }[];
};

type SourceItem = {
  id: number;
  title: string;
  source_type: string;
  original_url: string | null;
  local_path: string;
  status: string;
  created_at: string;
  processed_at: string | null;
  summary: string | null;
};

type WikiPageItem = {
  id: number;
  title: string;
  path: string;
  page_type: string;
  updated_at: string;
};

type HealthData = {
  local: {
    vaultRoot: string;
    dbPath: string;
    chatModel: string;
    embeddingModel: string;
    qdrantCollection: string;
  };
  ollama: { ok: boolean; host: string; models?: string[]; error?: string };
  qdrant: { ok: boolean; url: string; collections?: string[]; error?: string };
};

type SearchResult = {
  id: string | number;
  score: number;
  payload?: {
    title?: string;
    path?: string;
    text?: string;
    source_type?: string;
  };
};

type EditorState =
  | {
      kind: "source";
      id: number;
      title: string;
      type: string;
      status: string;
      originalUrl: string;
      path: string;
      content: string;
    }
  | {
      kind: "wiki";
      id: number;
      title: string;
      type: string;
      path: string;
      content: string;
    };

type LibraryMode = "sources" | "wiki";
type AppView = "dashboard" | "capture" | "ask" | "library";

const navItems: { href: string; label: string; view: AppView }[] = [
  { href: "/", label: "Dashboard", view: "dashboard" },
  { href: "/capture", label: "Capture", view: "capture" },
  { href: "/ask", label: "Ask", view: "ask" },
  { href: "/library", label: "Library", view: "library" },
];

const pageTitles: Record<AppView, string> = {
  dashboard: "Your local knowledge base.",
  capture: "Capture now. Organize later.",
  ask: "Find and synthesize what you saved.",
  library: "Manage captures and wiki pages.",
};

const pageDescriptions: Record<AppView, string> = {
  dashboard:
    "A private workspace that turns scattered notes into searchable, source-grounded knowledge.",
  capture:
    "Drop in a thought, article, or Markdown file. Everything stays readable in your local vault.",
  ask:
    "Search semantically or ask a question. Answers are generated locally and linked back to their sources.",
  library:
    "Browse the files behind your knowledge graph, refine metadata, and edit the Markdown directly.",
};

export default function SecondBrainApp({ view = "dashboard" }: { view?: AppView }) {
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [health, setHealth] = useState<HealthData | null>(null);
  const [content, setContent] = useState("");
  const [title, setTitle] = useState("");
  const [saveAndProcess, setSaveAndProcess] = useState(false);
  const [query, setQuery] = useState("");
  const [question, setQuestion] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [answer, setAnswer] = useState("");
  const [sources, setSources] = useState<SourceItem[]>([]);
  const [wikiPages, setWikiPages] = useState<WikiPageItem[]>([]);
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [libraryMode, setLibraryMode] = useState<LibraryMode>("sources");
  const [libraryFilter, setLibraryFilter] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState("");

  const localReady = useMemo(
    () => Boolean(health?.ollama.ok && health?.qdrant.ok),
    [health]
  );

  const filteredSources = useMemo(() => {
    const filter = libraryFilter.toLowerCase().trim();
    if (!filter) return sources;
    return sources.filter((source) =>
      `${source.title} ${source.source_type} ${source.status} ${source.local_path}`
        .toLowerCase()
        .includes(filter)
    );
  }, [libraryFilter, sources]);

  const filteredWikiPages = useMemo(() => {
    const filter = libraryFilter.toLowerCase().trim();
    if (!filter) return wikiPages;
    return wikiPages.filter((page) =>
      `${page.title} ${page.page_type} ${page.path}`.toLowerCase().includes(filter)
    );
  }, [libraryFilter, wikiPages]);

  useEffect(() => {
    void refresh();
  }, []);

  async function refresh() {
    const [dashboardResponse, healthResponse, sourcesResponse, wikiResponse] =
      await Promise.all([
        fetch("/api/dashboard"),
        fetch("/api/health"),
        fetch("/api/sources"),
        fetch("/api/wiki-pages"),
      ]);
    setDashboard(await dashboardResponse.json());
    setHealth(await healthResponse.json());
    setSources((await sourcesResponse.json()).sources ?? []);
    setWikiPages((await wikiResponse.json()).pages ?? []);
  }

  async function capture(event: FormEvent) {
    event.preventDefault();
    await saveCapture();
  }

  async function saveCapture() {
    if (!content.trim()) return;

    setBusy("capture");
    setNotice("");
    try {
      const response = await fetch("/api/capture", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          content,
          title: title || undefined,
          saveAndProcess,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Capture failed");
      setNotice(`Saved ${payload.title} to ${payload.localPath}`);
      setContent("");
      setTitle("");
      setLibraryMode("sources");
      await refresh();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Capture failed");
    } finally {
      setBusy(null);
    }
  }

  async function processInbox() {
    setBusy("process");
    setNotice("");
    try {
      const response = await fetch("/api/process", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ limit: 20 }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Processing failed");
      setNotice(`Processed ${payload.processed.length} source(s).`);
      await refresh();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Processing failed");
    } finally {
      setBusy(null);
    }
  }

  async function search(event: FormEvent) {
    event.preventDefault();
    if (!query.trim()) return;
    setBusy("search");
    setNotice("");
    try {
      const response = await fetch("/api/search", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ query }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Search failed");
      setSearchResults(payload.results);
      setAnswer("");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Search failed");
    } finally {
      setBusy(null);
    }
  }

  async function ask(event: FormEvent) {
    event.preventDefault();
    if (!question.trim()) return;
    setBusy("ask");
    setNotice("");
    try {
      const response = await fetch("/api/ask", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Ask failed");
      setAnswer(payload.answer);
      setSearchResults(payload.sources);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Ask failed");
    } finally {
      setBusy(null);
    }
  }

  async function fileAnswer() {
    if (!answer.trim() || !question.trim()) return;
    setBusy("file-answer");
    setNotice("");
    try {
      const sourcePaths = searchResults
        .map((result) => result.payload?.path)
        .filter((path): path is string => Boolean(path));
      const response = await fetch("/api/answers/file", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question, answer, sourcePaths }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Could not file answer");
      setNotice(`Filed answer to ${payload.path}.`);
      await refresh();
      setLibraryMode("wiki");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not file answer");
    } finally {
      setBusy(null);
    }
  }

  async function uploadFile(file: File) {
    const text = await file.text();
    setTitle(file.name.replace(/\.(md|markdown|txt)$/i, ""));
    setContent(text);
  }

  async function openSource(id: number) {
    setBusy(`source-${id}`);
    setNotice("");
    try {
      const response = await fetch(`/api/sources/${id}`);
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Could not open source");
      setLibraryMode("sources");
      setEditor({
        kind: "source",
        id: payload.source.id,
        title: payload.source.title,
        type: payload.source.source_type,
        status: payload.source.status,
        originalUrl: payload.source.original_url ?? "",
        path: payload.source.local_path,
        content: payload.content,
      });
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not open source");
    } finally {
      setBusy(null);
    }
  }

  async function openWikiPage(id: number) {
    setBusy(`wiki-${id}`);
    setNotice("");
    try {
      const response = await fetch(`/api/wiki-pages/${id}`);
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Could not open wiki page");
      setLibraryMode("wiki");
      setEditor({
        kind: "wiki",
        id: payload.page.id,
        title: payload.page.title,
        type: payload.page.page_type,
        path: payload.page.path,
        content: payload.content,
      });
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not open wiki page");
    } finally {
      setBusy(null);
    }
  }

  async function saveEditor() {
    if (!editor) return;
    setBusy("save-editor");
    setNotice("");
    try {
      const endpoint =
        editor.kind === "source"
          ? `/api/sources/${editor.id}`
          : `/api/wiki-pages/${editor.id}`;
      const body =
        editor.kind === "source"
          ? {
              title: editor.title,
              sourceType: editor.type,
              originalUrl: editor.originalUrl || null,
              status: editor.status,
              content: editor.content,
            }
          : {
              title: editor.title,
              pageType: editor.type,
              content: editor.content,
            };
      const response = await fetch(endpoint, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Save failed");
      setNotice(`Saved ${editor.title}.`);
      await refresh();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Save failed");
    } finally {
      setBusy(null);
    }
  }

  async function deleteEditor() {
    if (!editor) return;
    const confirmed = window.confirm(
      `Delete ${editor.title}? This removes the Markdown file.`
    );
    if (!confirmed) return;

    setBusy("delete-editor");
    setNotice("");
    try {
      const endpoint =
        editor.kind === "source"
          ? `/api/sources/${editor.id}`
          : `/api/wiki-pages/${editor.id}`;
      const response = await fetch(endpoint, { method: "DELETE" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Delete failed");
      setNotice(`Deleted ${editor.title}.`);
      setEditor(null);
      await refresh();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Delete failed");
    } finally {
      setBusy(null);
    }
  }

  async function createWikiPage() {
    const pageTitle = window.prompt("Wiki page title");
    if (!pageTitle?.trim()) return;

    setBusy("create-wiki");
    setNotice("");
    try {
      const response = await fetch("/api/wiki-pages", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: pageTitle, pageType: "concept" }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Create failed");
      setNotice(`Created ${pageTitle}.`);
      await refresh();
      await openWikiPage(payload.id);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Create failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <header className="product-bar">
        <Link className="brand" href="/" aria-label="Local AI Second Brain home">
          <span className="brand-mark" aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
          <span className="brand-copy">
            <strong>Second Brain</strong>
            <small>local knowledge system</small>
          </span>
        </Link>

        <nav className="app-nav" aria-label="Primary">
          {navItems.map((item) => (
            <Link
              aria-current={view === item.view ? "page" : undefined}
              className={view === item.view ? "active" : ""}
              href={item.href}
              key={item.href}
            >
              <NavIcon view={item.view} />
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>

        <div className="header-actions">
          <span
            className={localReady ? "service-pill ok" : "service-pill warn"}
            role="status"
          >
            <span className="status-dot" aria-hidden="true" />
            {localReady ? "Local AI ready" : "Services offline"}
          </span>
          <button
            aria-label="Refresh local service status"
            className="icon-button secondary-button"
            type="button"
            onClick={refresh}
          >
            <RefreshIcon />
          </button>
        </div>
      </header>

      <main id="main-content">
        <header className="app-header">
          <div>
            <p className="eyebrow">{view === "dashboard" ? "Workspace overview" : view}</p>
            <h1>{pageTitles[view]}</h1>
            <p className="page-description">{pageDescriptions[view]}</p>
          </div>
          <div className="privacy-note">
            <LockIcon />
            <span>
              <strong>Private by design</strong>
              Your notes and models stay on this machine.
            </span>
          </div>
        </header>

      {notice ? <p className="notice">{notice}</p> : null}

      {view === "dashboard" ? (
        <>
          <section className="dashboard-grid">
            <section className="quick-panel">
              <p className="eyebrow">Status</p>
              <div className="stat-strip">
                <Metric label="Sources" value={dashboard?.stats.sources ?? 0} />
                <Metric label="Queue" value={dashboard?.stats.unprocessed ?? 0} />
                <Metric label="Chunks" value={dashboard?.stats.chunks ?? 0} />
              </div>
              <button
                className="wide-button"
                type="button"
                disabled={busy === "process"}
                onClick={processInbox}
              >
                {busy === "process" ? "Processing..." : "Process inbox"}
              </button>
              <p className="small-path">{health?.local.vaultRoot ?? ""}</p>
            </section>
            <section className="quick-panel">
              <div className="panel-title-row">
                <h2>Next actions</h2>
                <span>{health?.local.chatModel ?? "local model"}</span>
              </div>
              <div className="action-list">
                <Link href="/capture">Add a capture</Link>
                <Link href="/ask">Ask your notes</Link>
                <Link href="/library">Review the library</Link>
              </div>
            </section>
          </section>

          <section className="dashboard-grid">
            <section className="quick-panel">
              <p className="eyebrow">Recent captures</p>
              <div className="compact-list">
                {(dashboard?.recentSources ?? []).length ? (
                  dashboard?.recentSources.slice(0, 5).map((source) => (
                    <div key={source.id}>
                      <strong>{source.title}</strong>
                      <code>{source.local_path}</code>
                    </div>
                  ))
                ) : (
                  <p className="muted">No captures yet.</p>
                )}
              </div>
            </section>
            <section className="quick-panel">
              <p className="eyebrow">Recent wiki pages</p>
              <div className="compact-list">
                {(dashboard?.recentWikiPages ?? []).length ? (
                  dashboard?.recentWikiPages.slice(0, 5).map((page) => (
                    <div key={page.id}>
                      <strong>{page.title}</strong>
                      <code>{page.path}</code>
                    </div>
                  ))
                ) : (
                  <p className="muted">No wiki pages yet.</p>
                )}
              </div>
            </section>
          </section>
        </>
      ) : null}

      {view === "capture" ? (
        <section className="command-grid">
          <form className="capture-card" onSubmit={capture}>
            <div className="capture-topline">
              <div>
                <h2>Capture</h2>
                <p>Paste text, a URL, or a quick note. Sorting can happen later.</p>
              </div>
              <label className="file-button">
                Upload
                <input
                  type="file"
                  accept=".md,.markdown,.txt,text/markdown,text/plain"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void uploadFile(file);
                  }}
                />
              </label>
            </div>
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Title, optional"
            />
            <textarea
              className="capture-textarea"
              value={content}
              onChange={(event) => setContent(event.target.value)}
              placeholder="Paste text, a URL, or a note..."
            />
            <div className="capture-actions">
              <label className="check-row">
                <input
                  type="checkbox"
                  checked={saveAndProcess}
                  onChange={(event) => setSaveAndProcess(event.target.checked)}
                />
                Process after saving
              </label>
              <button
                disabled={busy === "capture"}
                type="button"
                onClick={saveCapture}
              >
                {busy === "capture" ? "Saving..." : "Save capture"}
              </button>
            </div>
          </form>

          <aside className="side-stack">
            <section className="quick-panel">
              <div className="stat-strip">
                <Metric label="Sources" value={dashboard?.stats.sources ?? 0} />
                <Metric label="Queue" value={dashboard?.stats.unprocessed ?? 0} />
                <Metric label="Chunks" value={dashboard?.stats.chunks ?? 0} />
              </div>
              <button
                className="wide-button"
                type="button"
                disabled={busy === "process"}
                onClick={processInbox}
              >
                {busy === "process" ? "Processing..." : "Process inbox"}
              </button>
              <p className="small-path">{health?.local.vaultRoot ?? ""}</p>
            </section>
          </aside>
        </section>
      ) : null}

      {view === "ask" ? (
        <>
          <section className="ask-grid">
            <form className="quick-panel ask-panel" onSubmit={ask}>
              <div className="panel-title-row">
                <h2>Ask</h2>
                <span>{health?.local.chatModel ?? "local model"}</span>
              </div>
              <textarea
                className="question-input"
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                placeholder="Ask your notes..."
              />
              <button disabled={busy === "ask"} type="submit">
                {busy === "ask" ? "Thinking..." : "Ask my notes"}
              </button>
            </form>

            <form className="quick-panel ask-panel" onSubmit={search}>
              <div className="panel-title-row">
                <h2>Find</h2>
                <span>{health?.local.embeddingModel ?? "embedding model"}</span>
              </div>
              <textarea
                className="question-input"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Semantic search across saved chunks..."
              />
              <button disabled={busy === "search"} type="submit">
                {busy === "search" ? "Searching..." : "Search notes"}
              </button>
            </form>
          </section>

          {(answer || searchResults.length > 0) && (
            <section className="answer-grid">
              {answer ? (
                <article className="answer-card">
                  <div className="panel-title-row">
                    <p className="eyebrow">Answer</p>
                    <button
                      className="secondary-button"
                      type="button"
                      disabled={busy === "file-answer"}
                      onClick={fileAnswer}
                    >
                      {busy === "file-answer" ? "Filing..." : "File to wiki"}
                    </button>
                  </div>
                  <p>{answer}</p>
                </article>
              ) : null}

              {searchResults.length ? (
                <article className="matches-card">
                  <div className="panel-title-row">
                    <p className="eyebrow">Matches</p>
                    <button
                      className="text-button"
                      type="button"
                      onClick={() => setSearchResults([])}
                    >
                      Clear
                    </button>
                  </div>
                  <div className="match-list">
                    {searchResults.slice(0, 6).map((result) => (
                      <div className="match-row" key={result.id}>
                        <strong>{result.payload?.title ?? "Untitled"}</strong>
                        <span>{Number(result.score).toFixed(3)}</span>
                        <code>{result.payload?.path}</code>
                      </div>
                    ))}
                  </div>
                </article>
              ) : null}
            </section>
          )}
        </>
      ) : null}

      {view === "library" ? (
        <section className="library-shell">
        <div className="library-toolbar">
          <div>
            <p className="eyebrow">Library</p>
            <h2>Manage captures and wiki pages</h2>
          </div>
          <div className="toolbar-actions">
            <div className="segmented-control" aria-label="Library mode">
              <button
                className={libraryMode === "sources" ? "active" : ""}
                type="button"
                onClick={() => setLibraryMode("sources")}
              >
                Captures
              </button>
              <button
                className={libraryMode === "wiki" ? "active" : ""}
                type="button"
                onClick={() => setLibraryMode("wiki")}
              >
                Wiki
              </button>
            </div>
            <button
              className="secondary-button"
              type="button"
              disabled={busy === "create-wiki"}
              onClick={createWikiPage}
            >
              New wiki page
            </button>
          </div>
        </div>

        <div className="library-search-row">
          <input
            value={libraryFilter}
            onChange={(event) => setLibraryFilter(event.target.value)}
            placeholder={`Filter ${libraryMode === "sources" ? "captures" : "wiki pages"}`}
          />
        </div>

        <div className="library-grid">
          <section className="library-list" aria-label="Library list">
            {libraryMode === "sources" ? (
              filteredSources.length ? (
                filteredSources.map((source) => (
                  <button
                    className={isSelected(editor, "source", source.id)}
                    disabled={busy === `source-${source.id}`}
                    key={source.id}
                    onClick={() => void openSource(source.id)}
                    type="button"
                  >
                    <div>
                      <strong>{source.title}</strong>
                      <span>{source.status}</span>
                    </div>
                    <p>{source.summary || source.source_type}</p>
                    <code>{source.local_path}</code>
                  </button>
                ))
              ) : (
                <EmptyState title="No captures found" body="Save something above to start filling your library." />
              )
            ) : filteredWikiPages.length ? (
              filteredWikiPages.map((page) => (
                <button
                  className={isSelected(editor, "wiki", page.id)}
                  disabled={busy === `wiki-${page.id}`}
                  key={page.id}
                  onClick={() => void openWikiPage(page.id)}
                  type="button"
                >
                  <div>
                    <strong>{page.title}</strong>
                    <span>{page.page_type}</span>
                  </div>
                  <p>Updated {formatDate(page.updated_at)}</p>
                  <code>{page.path}</code>
                </button>
              ))
            ) : (
              <EmptyState title="No wiki pages found" body="Process captures or create a page manually." />
            )}
          </section>

          <section className="editor-panel">
            <div className="editor-header">
              <div>
                <p className="eyebrow">Markdown editor</p>
                <h2>{editor ? editor.title : "Nothing selected"}</h2>
              </div>
              {editor ? (
                <div className="button-row">
                  <button
                    type="button"
                    disabled={busy === "save-editor"}
                    onClick={saveEditor}
                  >
                    Save
                  </button>
                  <button
                    className="danger-button"
                    type="button"
                    disabled={busy === "delete-editor"}
                    onClick={deleteEditor}
                  >
                    Delete
                  </button>
                </div>
              ) : null}
            </div>

            {editor ? (
              <div className="editor-fields">
                <input
                  value={editor.title}
                  onChange={(event) =>
                    setEditor({ ...editor, title: event.target.value })
                  }
                  placeholder="Title"
                />
                <div className="inline-fields">
                  <input
                    value={editor.type}
                    onChange={(event) =>
                      setEditor({ ...editor, type: event.target.value })
                    }
                    placeholder={editor.kind === "source" ? "Source type" : "Page type"}
                  />
                  {editor.kind === "source" ? (
                    <select
                      value={editor.status}
                      onChange={(event) =>
                        setEditor({ ...editor, status: event.target.value })
                      }
                    >
                      <option value="unprocessed">unprocessed</option>
                      <option value="processed">processed</option>
                      <option value="needs_review">needs_review</option>
                    </select>
                  ) : null}
                </div>
                {editor.kind === "source" ? (
                  <input
                    value={editor.originalUrl}
                    onChange={(event) =>
                      setEditor({ ...editor, originalUrl: event.target.value })
                    }
                    placeholder="Original URL"
                  />
                ) : null}
                <code className="editor-path">{editor.path}</code>
                <textarea
                  className="markdown-textarea"
                  value={editor.content}
                  onChange={(event) =>
                    setEditor({ ...editor, content: event.target.value })
                  }
                />
              </div>
            ) : (
              <EmptyState
                title="Pick a capture or wiki page"
                body="The editor stays here so reviewing, fixing, and pruning notes is one click away."
              />
            )}
          </section>
        </div>
        </section>
      ) : null}

      {view !== "ask" ? (
        <footer className="footer-grid">
        <section>
          <p className="eyebrow">Topics</p>
          <div className="chip-row">
            {(dashboard?.suggestedTopics ?? []).length ? (
              dashboard?.suggestedTopics.map((topic) => (
                <span key={topic.name}>
                  {topic.name} · {topic.count}
                </span>
              ))
            ) : (
              <p className="muted">Tags appear after processing.</p>
            )}
          </div>
        </section>
        <section>
          <p className="eyebrow">Review</p>
          {(dashboard?.reviewItems ?? []).length ? (
            <div className="review-list">
              {dashboard?.reviewItems.slice(0, 4).map((item) => (
                <p key={item.id}>
                  {item.title} <span>{item.item_type}</span>
                </p>
              ))}
            </div>
          ) : (
            <p className="muted">No pending review items.</p>
          )}
        </section>
        </footer>
      ) : null}
      </main>
    </div>
  );
}

function NavIcon({ view }: { view: AppView }) {
  const paths: Record<AppView, React.ReactNode> = {
    dashboard: <path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z" />,
    capture: <path d="M12 5v14M5 12h14" />,
    ask: <path d="M5 5h14v11H9l-4 3V5Z" />,
    library: <path d="M5 4h5v16H5zM10 4h5v16h-5zM16 5l3-1 2 15-3 1z" />,
  };

  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      {paths[view]}
    </svg>
  );
}

function RefreshIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M20 6v5h-5M4 18v-5h5M18.2 9A7 7 0 0 0 6.6 6.6L4 9m16 6-2.6 2.4A7 7 0 0 1 5.8 15" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <rect x="5" y="10" width="14" height="10" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="empty-state">
      <strong>{title}</strong>
      <p>{body}</p>
    </div>
  );
}

function isSelected(editor: EditorState | null, kind: EditorState["kind"], id: number) {
  return editor?.kind === kind && editor.id === id ? "library-row selected" : "library-row";
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}
