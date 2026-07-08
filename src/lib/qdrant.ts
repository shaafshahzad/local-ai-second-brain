import { qdrantCollection, qdrantUrl } from "@/lib/config";

type QdrantCollectionList = {
  result?: { collections?: { name: string }[] };
};

type QdrantSearchResponse = {
  result?: {
    id: string | number;
    score: number;
    payload?: Record<string, unknown>;
  }[];
};

export async function checkQdrant() {
  try {
    const collections = await getCollections();
    return {
      ok: true,
      url: qdrantUrl,
      collections,
    };
  } catch (error) {
    return {
      ok: false,
      url: qdrantUrl,
      error: error instanceof Error ? error.message : "Qdrant is unreachable",
    };
  }
}

export async function ensureChunkCollection(vectorSize: number) {
  const collections = await getCollections();
  const exists = collections.includes(qdrantCollection);

  if (!exists) {
    await qdrantFetch(`/collections/${encodeURIComponent(qdrantCollection)}`, {
      method: "PUT",
      body: JSON.stringify({
        vectors: {
          size: vectorSize,
          distance: "Cosine",
        },
      }),
    });
  }
}

export async function upsertChunkVectors(
  points: {
    id: number;
    vector: number[];
    payload: Record<string, unknown>;
  }[]
) {
  if (points.length === 0) return;
  await ensureChunkCollection(points[0].vector.length);
  await qdrantFetch(
    `/collections/${encodeURIComponent(qdrantCollection)}/points?wait=true`,
    {
      method: "PUT",
      body: JSON.stringify({ points }),
    }
  );
}

export async function searchChunkVectors(vector: number[], limit = 8) {
  const response = (await qdrantFetch(
    `/collections/${encodeURIComponent(qdrantCollection)}/points/search`,
    {
      method: "POST",
      body: JSON.stringify({
        vector,
        limit,
        with_payload: true,
      }),
    }
  )) as QdrantSearchResponse;

  return response.result ?? [];
}

export async function deleteSourceVectors(sourceId: number) {
  const collections = await getCollections();
  if (!collections.includes(qdrantCollection)) return;

  await qdrantFetch(
    `/collections/${encodeURIComponent(qdrantCollection)}/points/delete?wait=true`,
    {
      method: "POST",
      body: JSON.stringify({
        filter: {
          must: [
            {
              key: "source_id",
              match: {
                value: sourceId,
              },
            },
          ],
        },
      }),
    }
  );
}

async function getCollections() {
  const response = (await qdrantFetch("/collections")) as QdrantCollectionList;
  return response.result?.collections?.map((collection) => collection.name) ?? [];
}

async function qdrantFetch(path: string, init?: RequestInit) {
  const response = await fetch(`${qdrantUrl}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Qdrant ${response.status}: ${body}`);
  }

  return response.json();
}
