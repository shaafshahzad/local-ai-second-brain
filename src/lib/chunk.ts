export function stripMarkdownFrontmatter(text: string) {
  return text.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, "").trim();
}

export function estimateTokens(text: string) {
  return Math.ceil(text.trim().split(/\s+/).filter(Boolean).length * 1.35);
}

export function chunkText(text: string, maxWords = 220, overlapWords = 45) {
  if (!Number.isInteger(maxWords) || maxWords <= 0) {
    throw new RangeError("maxWords must be a positive integer");
  }
  if (
    !Number.isInteger(overlapWords) ||
    overlapWords < 0 ||
    overlapWords >= maxWords
  ) {
    throw new RangeError(
      "overlapWords must be a non-negative integer smaller than maxWords"
    );
  }

  const words = stripMarkdownFrontmatter(text).split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];

  const chunks: string[] = [];
  let start = 0;

  while (start < words.length) {
    const end = Math.min(words.length, start + maxWords);
    chunks.push(words.slice(start, end).join(" "));
    if (end === words.length) break;
    start = Math.max(0, end - overlapWords);
  }

  return chunks;
}
