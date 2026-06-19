import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const OLLAMA_URL = process.env.OLLAMA_URL ?? "http://localhost:11434";

export async function GET() {
  try {
    const response = await fetch(`${OLLAMA_URL}/api/tags`, {
      cache: "no-store",
      signal: AbortSignal.timeout(4000),
    });

    if (!response.ok) {
      return NextResponse.json({
        ok: false,
        url: OLLAMA_URL,
        models: [],
        error: `Ollama returned ${response.status}`,
      });
    }

    const data = (await response.json()) as {
      models?: Array<{ name?: string; model?: string }>;
    };

    return NextResponse.json({
      ok: true,
      url: OLLAMA_URL,
      models: (data.models ?? []).map((model) => model.name ?? model.model).filter(Boolean),
      defaultModel: process.env.OLLAMA_MODEL ?? "qwen2.5-coder:7b",
    });
  } catch {
    return NextResponse.json({
      ok: false,
      url: OLLAMA_URL,
      models: [],
      defaultModel: process.env.OLLAMA_MODEL ?? "qwen2.5-coder:7b",
      error: "Ollama is not running. Start Ollama, then pull a coder model.",
    });
  }
}
