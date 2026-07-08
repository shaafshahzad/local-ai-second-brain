import { NextRequest, NextResponse } from "next/server";
import { semanticSearch } from "@/lib/processing";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { query?: string; limit?: number };
    if (!body.query?.trim()) {
      return NextResponse.json({ error: "Query is required" }, { status: 400 });
    }

    const results = await semanticSearch(body.query, body.limit ?? 8);
    return NextResponse.json({ results });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Search failed" },
      { status: 500 }
    );
  }
}

