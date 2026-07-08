export function stripMarkdownFrontmatter(text: string) {
  return text.replace(/^---\n[\s\S]*?\n---\n/, "").trim();
}

export function estimateTokens(text: string) {
  return Math.ceil(text.trim().split(/\s+/).filter(Boolean).length * 1.35);
}

export function chunkText(text: string, maxWords = 220, overlapWords = 45) {
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

