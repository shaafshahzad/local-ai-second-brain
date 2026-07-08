import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  deleteSourceRecord,
  getSourceById,
  updateSourceRecord,
} from "@/lib/db";
import { sha256 } from "@/lib/processing";
import {
  deleteVaultFile,
  readVaultFile,
  updateVaultFile,
} from "@/lib/vault";
import { deleteSourceVectors } from "@/lib/qdrant";

export const runtime = "nodejs";

const sourceUpdateSchema = z.object({
  title: z.string().min(1),
  sourceType: z.string().min(1),
  originalUrl: z.string().nullable().optional(),
  status: z.string().min(1),
  content: z.string(),
});

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: NextRequest, context: RouteContext) {
  const source = await loadSource(context);
  if (!source) {
    return NextResponse.json({ error: "Source not found" }, { status: 404 });
  }

  return NextResponse.json({
    source,
    content: readVaultFile(source.local_path),
  });
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const source = await loadSource(context);
  if (!source) {
    return NextResponse.json({ error: "Source not found" }, { status: 404 });
  }

  try {
    const body = sourceUpdateSchema.parse(await request.json());
    updateVaultFile(source.local_path, body.content);
    updateSourceRecord({
      id: source.id,
      title: body.title,
      sourceType: body.sourceType,
      originalUrl: body.originalUrl,
      status: body.status,
      hash: sha256(body.content),
    });

    return NextResponse.json({
      source: getSourceById(source.id),
      content: body.content,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Update failed" },
      { status: 400 }
    );
  }
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  const source = await loadSource(context);
  if (!source) {
    return NextResponse.json({ error: "Source not found" }, { status: 404 });
  }

  deleteVaultFile(source.local_path);
  deleteSourceRecord(source.id);

  try {
    await deleteSourceVectors(source.id);
  } catch {
    // Qdrant is rebuildable from Markdown, so source deletion should not fail
    // just because the vector index is offline.
  }

  return NextResponse.json({ deleted: true });
}

async function loadSource(context: RouteContext) {
  const { id } = await context.params;
  return getSourceById(Number(id));
}

