import { NextRequest, NextResponse } from "next/server";
import { processInbox } from "@/lib/processing";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const limit = Number(body.limit ?? 10);
    const results = await processInbox(limit);
    return NextResponse.json({ processed: results });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Processing failed" },
      { status: 500 }
    );
  }
}

