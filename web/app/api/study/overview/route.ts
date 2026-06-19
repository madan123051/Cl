import { NextResponse } from "next/server";
import { getStudyOverview } from "@/lib/study";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(await getStudyOverview());
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load study overview.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
