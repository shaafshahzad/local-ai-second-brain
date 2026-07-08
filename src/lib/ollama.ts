import { Ollama } from "ollama";
import { chatModel, embeddingModel, ollamaHost } from "@/lib/config";

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export const ollama = new Ollama({ host: ollamaHost });

export async function checkOllama() {
  try {
    const response = await fetch(`${ollamaHost}/api/tags`, {
      signal: AbortSignal.timeout(1500),
    });
    if (!response.ok) {
      return { ok: false, error: `Ollama returned ${response.status}` };
    }
    const data = (await response.json()) as { models?: { name: string }[] };
    return {
      ok: true,
      host: ollamaHost,
      models: data.models?.map((model) => model.name) ?? [],
    };
  } catch (error) {
    return {
      ok: false,
      host: ollamaHost,
      error: error instanceof Error ? error.message : "Ollama is unreachable",
    };
  }
}

export async function chat(messages: ChatMessage[], format?: "json") {
  const response = await ollama.chat({
    model: chatModel,
    messages,
    stream: false,
    format,
  });

  return response.message.content;
}

export async function embedText(input: string) {
  const response = await ollama.embed({
    model: embeddingModel,
    input,
  });

  return response.embeddings[0];
}

export async function embedMany(inputs: string[]) {
  if (inputs.length === 0) return [];
  const response = await ollama.embed({
    model: embeddingModel,
    input: inputs,
  });

  return response.embeddings;
}

