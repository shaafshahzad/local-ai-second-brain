const baseURL = new URL(process.argv[2] ?? "http://127.0.0.1:3000");
const runId = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
const sourceTitle = `Deployment smoke source ${runId}`;
const wikiTitle = `Deployment smoke wiki ${runId}`;

let sourceId;
let wikiId;

async function request(path, init) {
  const response = await fetch(new URL(path, baseURL), init);
  const contentType = response.headers.get("content-type") ?? "";
  const body = contentType.includes("application/json")
    ? await response.json()
    : await response.text();

  if (!response.ok) {
    throw new Error(`${init?.method ?? "GET"} ${path} returned ${response.status}: ${JSON.stringify(body)}`);
  }

  return body;
}

async function jsonRequest(path, method, body) {
  return request(path, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function cleanup() {
  const deletions = [];
  if (sourceId) deletions.push(request(`/api/sources/${sourceId}`, { method: "DELETE" }));
  if (wikiId) deletions.push(request(`/api/wiki-pages/${wikiId}`, { method: "DELETE" }));
  await Promise.allSettled(deletions);
}

try {
  const home = await request("/");
  assert(home.includes("Local AI Second Brain"), "Home page did not render the application shell");

  const health = await request("/api/health");
  assert(health.local?.vaultRoot, "Health response did not expose a vault path");
  assert(health.local?.dbPath, "Health response did not expose a database path");

  const capture = await jsonRequest("/api/capture", "POST", {
    title: sourceTitle,
    content: "This temporary note verifies deployed Markdown and SQLite persistence.",
  });
  sourceId = capture.sourceId;
  assert(sourceId, "Capture did not return a source ID");

  const source = await request(`/api/sources/${sourceId}`);
  assert(source.content.includes("temporary note"), "Captured Markdown could not be read back");

  const editedSource = await jsonRequest(`/api/sources/${sourceId}`, "PATCH", {
    title: sourceTitle,
    sourceType: "deployment_smoke",
    originalUrl: null,
    status: "needs_review",
    content: `# ${sourceTitle}\n\nUpdated by the deployment smoke test.`,
  });
  assert(editedSource.source?.status === "needs_review", "Source update did not persist");

  const wiki = await jsonRequest("/api/wiki-pages", "POST", {
    title: wikiTitle,
    pageType: "concept",
  });
  wikiId = wiki.id;
  const wikiPage = await request(`/api/wiki-pages/${wikiId}`);
  assert(wikiPage.content.includes(wikiTitle), "Wiki Markdown could not be read back");

  const dashboard = await request("/api/dashboard");
  assert(dashboard.stats?.sources >= 1, "Dashboard did not observe the smoke-test source");

  console.log(
    JSON.stringify(
      {
        ok: true,
        baseURL: baseURL.toString(),
        vaultRoot: health.local.vaultRoot,
        dbPath: health.local.dbPath,
        ollama: health.ollama,
        qdrant: health.qdrant,
      },
      null,
      2
    )
  );
} finally {
  await cleanup();
}
