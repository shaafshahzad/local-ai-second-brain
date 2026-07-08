export type ExtractedKnowledge = {
  summary: string;
  tags: string[];
  entities: { name: string; type: string }[];
  claims: { text: string; confidence: number }[];
  openQuestions: string[];
};

export function fallbackExtraction(title: string, text: string): ExtractedKnowledge {
  const sentences = text
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
  const words = text.toLowerCase().match(/[a-z][a-z-]{3,}/g) ?? [];
  const frequencies = new Map<string, number>();

  for (const word of words) {
    if (stopWords.has(word)) continue;
    frequencies.set(word, (frequencies.get(word) ?? 0) + 1);
  }

  const tags = [...frequencies.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([word]) => word);
  const names = [...text.matchAll(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3})\b/g)]
    .map((match) => match[1])
    .filter((name) => !["The", "This", "For", "From", "When"].includes(name));
  const uniqueNames = [...new Set(names)].slice(0, 8);

  return {
    summary: sentences.slice(0, 3).join(" ") || title,
    tags,
    entities: uniqueNames.map((name) => ({ name, type: "concept" })),
    claims: sentences.slice(0, 5).map((sentence) => ({
      text: sentence,
      confidence: 0.45,
    })),
    openQuestions: [],
  };
}

export function parseExtractionJson(raw: string): ExtractedKnowledge | null {
  try {
    const parsed = JSON.parse(raw) as Partial<ExtractedKnowledge>;
    return {
      summary: String(parsed.summary ?? "").trim(),
      tags: normalizeStringArray(parsed.tags),
      entities: Array.isArray(parsed.entities)
        ? parsed.entities
            .map((entity) => ({
              name: String(entity?.name ?? "").trim(),
              type: String(entity?.type ?? "concept").trim() || "concept",
            }))
            .filter((entity) => entity.name)
        : [],
      claims: Array.isArray(parsed.claims)
        ? parsed.claims
            .map((claim) => ({
              text: String(claim?.text ?? "").trim(),
              confidence: Number(claim?.confidence ?? 0.5),
            }))
            .filter((claim) => claim.text)
        : [],
      openQuestions: normalizeStringArray(parsed.openQuestions),
    };
  } catch {
    return null;
  }
}

function normalizeStringArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item).trim()).filter(Boolean);
}

const stopWords = new Set([
  "about",
  "after",
  "also",
  "because",
  "been",
  "being",
  "could",
  "from",
  "have",
  "into",
  "more",
  "most",
  "only",
  "other",
  "over",
  "should",
  "some",
  "such",
  "than",
  "that",
  "their",
  "there",
  "these",
  "they",
  "this",
  "through",
  "were",
  "what",
  "when",
  "where",
  "which",
  "with",
  "would",
]);

