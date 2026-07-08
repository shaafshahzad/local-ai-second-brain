import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { insertSource } from "@/lib/db";
import {
  fetchUrlAsMarkdown,
  markdownForSource,
  processSource,
  sha256,
} from "@/lib/processing";
import { readVaultFile, uniqueMarkdownPath, writeMarkdown } from "@/lib/vault";

export const runtime = "nodejs";

const captureSchema = z.object({
  content: z.string().min(1),
  title: z.string().optional(),
  sourceType: z.string().optional(),
  saveAndProcess: z.boolean().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const body = captureSchema.parse(await request.json());
    const maybeUrl = parseUrl(body.content.trim());
    const sourceType = body.sourceType ?? (maybeUrl ? "article" : "personal_note");
    const folder = maybeUrl ? "inbox/clipped-pages" : "inbox/quick-notes";
    let title = body.title?.trim();
    let content = body.content.trim();

    if (maybeUrl) {
      const fetched = await fetchUrlAsMarkdown(maybeUrl.toString());
      title = title || fetched.title;
      content = fetched.body;
    }

    title = title || content.split(/\n/)[0]?.slice(0, 80) || "Untitled note";
    const markdown = markdownForSource({
      title,
      sourceType,
      originalUrl: maybeUrl?.toString(),
      body: content,
    });
    const localPath = uniqueMarkdownPath(folder, title);
    writeMarkdown(localPath, markdown);
    const sourceId = insertSource({
      title,
      sourceType,
      originalUrl: maybeUrl?.toString(),
      localPath,
      hash: sha256(markdown),
    });

    let processed = null;
    if (body.saveAndProcess) {
      processed = await processSource({
        id: sourceId,
        title,
        source_type: sourceType,
        original_url: maybeUrl?.toString() ?? null,
        local_path: localPath,
        created_at: new Date().toISOString(),
        processed_at: null,
        status: "unprocessed",
        hash: sha256(readVaultFile(localPath)),
        summary: null,
      });
    }

    return NextResponse.json({
      sourceId,
      title,
      localPath,
      processed,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Capture failed" },
      { status: 400 }
    );
  }
}

function parseUrl(value: string) {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) ? url : null;
  } catch {
    return null;
  }
}

