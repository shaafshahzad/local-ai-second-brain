import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  deleteWikiPageRecord,
  getWikiPageById,
  updateWikiPageRecord,
} from "@/lib/db";
import {
  deleteVaultFile,
  readVaultFile,
  updateVaultFile,
} from "@/lib/vault";

export const runtime = "nodejs";

const wikiUpdateSchema = z.object({
  title: z.string().min(1),
  pageType: z.string().min(1),
  content: z.string(),
});

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: NextRequest, context: RouteContext) {
  const page = await loadWikiPage(context);
  if (!page) {
    return NextResponse.json({ error: "Wiki page not found" }, { status: 404 });
  }

  return NextResponse.json({
    page,
    content: readVaultFile(page.path),
  });
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const page = await loadWikiPage(context);
  if (!page) {
    return NextResponse.json({ error: "Wiki page not found" }, { status: 404 });
  }

  try {
    const body = wikiUpdateSchema.parse(await request.json());
    updateVaultFile(page.path, body.content);
    updateWikiPageRecord({
      id: page.id,
      title: body.title,
      pageType: body.pageType,
    });

    return NextResponse.json({
      page: getWikiPageById(page.id),
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
  const page = await loadWikiPage(context);
  if (!page) {
    return NextResponse.json({ error: "Wiki page not found" }, { status: 404 });
  }

  deleteVaultFile(page.path);
  deleteWikiPageRecord(page.id);
  return NextResponse.json({ deleted: true });
}

async function loadWikiPage(context: RouteContext) {
  const { id } = await context.params;
  return getWikiPageById(Number(id));
}

