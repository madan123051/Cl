import { NextRequest, NextResponse } from "next/server";
import { searchStudyFiles } from "@/lib/study";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("q") ?? "";

  try {
    return NextResponse.json({ results: await searchStudyFiles(query) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to search files.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
