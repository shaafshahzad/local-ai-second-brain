import { beforeEach, describe, expect, it, vi } from "vitest";

const collectionResponse = (names: string[]) =>
  new Response(
    JSON.stringify({ result: { collections: names.map((name) => ({ name })) } }),
    { status: 200, headers: { "content-type": "application/json" } }
  );

describe("Qdrant REST client", () => {
  beforeEach(() => {
    vi.stubEnv("QDRANT_URL", "http://qdrant.test:6333");
    vi.stubEnv("QDRANT_COLLECTION", "test_chunks");
    vi.resetModules();
  });

  it("reports collection health", async () => {
    const fetchMock = vi.fn().mockResolvedValue(collectionResponse(["one", "two"]));
    vi.stubGlobal("fetch", fetchMock);
    const { checkQdrant } = await import("@/lib/qdrant");

    await expect(checkQdrant()).resolves.toEqual({
      ok: true,
      url: "http://qdrant.test:6333",
      collections: ["one", "two"],
    });
  });

  it("returns a useful health error when Qdrant is unreachable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("connection refused")));
    const { checkQdrant } = await import("@/lib/qdrant");

    await expect(checkQdrant()).resolves.toEqual({
      ok: false,
      url: "http://qdrant.test:6333",
      error: "connection refused",
    });
  });

  it("creates a missing collection with the embedding dimension", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(collectionResponse([]))
      .mockResolvedValueOnce(new Response(JSON.stringify({ result: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const { ensureChunkCollection } = await import("@/lib/qdrant");

    await ensureChunkCollection(3);
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "http://qdrant.test:6333/collections/test_chunks",
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({ vectors: { size: 3, distance: "Cosine" } }),
      })
    );
  });

  it("does not recreate an existing collection", async () => {
    const fetchMock = vi.fn().mockResolvedValue(collectionResponse(["test_chunks"]));
    vi.stubGlobal("fetch", fetchMock);
    const { ensureChunkCollection } = await import("@/lib/qdrant");

    await ensureChunkCollection(3);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("upserts, searches, and deletes vectors using the expected payloads", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(collectionResponse(["test_chunks"]))
      .mockResolvedValueOnce(new Response(JSON.stringify({ result: true }), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ result: [{ id: 7, score: 0.91, payload: { title: "Match" } }] }),
          { status: 200 }
        )
      )
      .mockResolvedValueOnce(collectionResponse(["test_chunks"]))
      .mockResolvedValueOnce(new Response(JSON.stringify({ result: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const { deleteSourceVectors, searchChunkVectors, upsertChunkVectors } = await import(
      "@/lib/qdrant"
    );

    await upsertChunkVectors([{ id: 1, vector: [0.1, 0.2], payload: { source_id: 4 } }]);
    await expect(searchChunkVectors([0.2, 0.3], 5)).resolves.toEqual([
      { id: 7, score: 0.91, payload: { title: "Match" } },
    ]);
    await deleteSourceVectors(4);

    expect(fetchMock.mock.calls[1][1]).toEqual(
      expect.objectContaining({ method: "PUT", body: expect.stringContaining('"points"') })
    );
    expect(fetchMock.mock.calls[2][1]).toEqual(
      expect.objectContaining({ method: "POST", body: expect.stringContaining('"limit":5') })
    );
    expect(fetchMock.mock.calls[4][1]).toEqual(
      expect.objectContaining({ method: "POST", body: expect.stringContaining('"source_id"') })
    );
  });

  it("skips empty upserts and deletions when the collection is absent", async () => {
    const fetchMock = vi.fn().mockResolvedValue(collectionResponse([]));
    vi.stubGlobal("fetch", fetchMock);
    const { deleteSourceVectors, upsertChunkVectors } = await import("@/lib/qdrant");

    await upsertChunkVectors([]);
    await deleteSourceVectors(9);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("includes the response body in HTTP errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("bad request", { status: 400 }))
    );
    const { searchChunkVectors } = await import("@/lib/qdrant");

    await expect(searchChunkVectors([0.1])).rejects.toThrow("Qdrant 400: bad request");
  });
});
