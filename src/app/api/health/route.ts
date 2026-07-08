import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import {
  chatModel,
  dbPath,
  embeddingModel,
  qdrantCollection,
  vaultRoot,
} from "@/lib/config";
import { checkOllama } from "@/lib/ollama";
import { checkQdrant } from "@/lib/qdrant";

export const runtime = "nodejs";

export async function GET() {
  getDb();
  const [ollama, qdrant] = await Promise.all([checkOllama(), checkQdrant()]);

  return NextResponse.json({
    local: {
      vaultRoot,
      dbPath,
      chatModel,
      embeddingModel,
      qdrantCollection,
    },
    ollama,
    qdrant,
  });
}

