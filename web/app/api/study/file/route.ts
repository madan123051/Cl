import { NextRequest, NextResponse } from "next/server";
import { readStudyFile } from "@/lib/study";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const filePath = request.nextUrl.searchParams.get("path");

  if (!filePath) {
    return NextResponse.json({ error: "path parameter required" }, { status: 400 });
  }

  try {
    return NextResponse.json(await readStudyFile(filePath));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to read file.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
