import { NextRequest, NextResponse } from "next/server";
import { answerQuestion } from "@/lib/processing";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { question?: string };
    if (!body.question?.trim()) {
      return NextResponse.json({ error: "Question is required" }, { status: 400 });
    }

    const result = await answerQuestion(body.question);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Ask failed" },
      { status: 500 }
    );
  }
}

