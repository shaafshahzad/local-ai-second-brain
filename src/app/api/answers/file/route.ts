import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { fileAnswerToWiki } from "@/lib/processing";

export const runtime = "nodejs";

const fileAnswerSchema = z.object({
  question: z.string().min(1),
  answer: z.string().min(1),
  title: z.string().optional(),
  sourcePaths: z.array(z.string()).optional(),
});

export async function POST(request: NextRequest) {
  try {
    const body = fileAnswerSchema.parse(await request.json());
    const result = fileAnswerToWiki(body);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "File answer failed" },
      { status: 400 }
    );
  }
}
