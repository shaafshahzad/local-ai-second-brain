import { NextResponse } from "next/server";
import { listSources } from "@/lib/db";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({ sources: listSources() });
}

