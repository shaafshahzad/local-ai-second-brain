import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { insertWikiPage, listWikiPages } from "@/lib/db";
import { refreshWikiNavigation } from "@/lib/processing";
import { slugify, uniqueMarkdownPath, writeMarkdown } from "@/lib/vault";

export const runtime = "nodejs";

const wikiCreateSchema = z.object({
  title: z.string().min(1),
  pageType: z.string().min(1).default("concept"),
  content: z.string().optional(),
});

export async function GET() {
  return NextResponse.json({ pages: listWikiPages() });
}

export async function POST(request: NextRequest) {
  try {
    const body = wikiCreateSchema.parse(await request.json());
    const pageType = body.pageType.trim().toLowerCase();
    const folder =
      pageType === "person" || pageType === "people"
        ? "wiki/people"
        : pageType === "place" || pageType === "places"
          ? "wiki/places"
          : "wiki/concepts";
    const localPath = uniqueMarkdownPath(folder, body.title);
    const now = new Date().toISOString();
    const content =
      body.content?.trim() ||
      `# ${body.title}

## Overview


## Key Points

- 

## Related Sources

- 

## Related Pages

- 

## Open Questions

- 

## Last Updated

${now}
`;

    writeMarkdown(localPath, content);
    const id = insertWikiPage({
      title: body.title,
      path: localPath,
      pageType: slugify(pageType),
    });
    refreshWikiNavigation({
      action: "manual",
      title: body.title,
      detailLines: [`- Created page: ${localPath}`],
    });

    return NextResponse.json({ id, path: localPath });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Create failed" },
      { status: 400 }
    );
  }
}
