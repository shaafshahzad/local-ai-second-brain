import { NextResponse } from "next/server";
import { getDashboardData } from "@/lib/db";
import { vaultRoot } from "@/lib/config";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({
    vaultRoot,
    ...getDashboardData(),
  });
}

