import { NextRequest, NextResponse } from "next/server";
import { readStudyFile, searchStudyFiles } from "@/lib/study";

export const dynamic = "force-dynamic";

const OLLAMA_URL = process.env.OLLAMA_URL ?? "http://localhost:11434";
const DEFAULT_MODEL = process.env.OLLAMA_MODEL ?? "qwen2.5-coder:7b";

type AgentMessage = {
  role: "user" | "assistant";
  content: string;
};

type AgentRequest = {
  messages: AgentMessage[];
  selectedPath?: string;
  notes?: string;
  model?: string;
};

function truncate(text: string, maxLength: number) {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength)}\n\n[truncated]`;
}

function extractSearchTerms(message: string) {
  return message
    .replace(/[`"'()[\]{}]/g, " ")
    .split(/\s+/)
    .map((word) => word.trim())
    .filter((word) => word.length >= 4)
    .slice(0, 6)
    .join(" ");
}

async function buildContext(selectedPath: string | undefined, prompt: string, notes = "") {
  const contextFiles: Array<{ path: string; content: string }> = [];
  const searchQuery = extractSearchTerms(prompt);
  const searchResults = searchQuery ? await searchStudyFiles(searchQuery) : [];

  if (selectedPath) {
    try {
      const selected = await readStudyFile(selectedPath);
      contextFiles.push({
        path: selected.path,
        content: truncate(selected.content, 18_000),
      });
    } catch {
      // Keep the agent useful even if the selected file cannot be read.
    }
  }

  for (const result of searchResults.slice(0, 5)) {
    if (contextFiles.some((file) => file.path === result.path)) continue;
    try {
      const related = await readStudyFile(result.path);
      contextFiles.push({
        path: related.path,
        content: truncate(related.content, 8_000),
      });
    } catch {
      continue;
    }
  }

  const contextText = [
    notes.trim() ? `USER STUDY NOTES:\n${truncate(notes.trim(), 3_000)}` : "",
    searchResults.length
      ? `LOCAL SEARCH RESULTS:\n${searchResults
          .slice(0, 12)
          .map((result) => `- ${result.path}:${result.line} ${result.preview}`)
          .join("\n")}`
      : "",
    contextFiles
      .map((file) => `FILE: ${file.path}\n\`\`\`\n${file.content}\n\`\`\``)
      .join("\n\n"),
  ]
    .filter(Boolean)
    .join("\n\n");

  return {
    contextFiles: contextFiles.map((file) => file.path),
    searchResults: searchResults.slice(0, 12),
    contextText,
  };
}

export async function POST(request: NextRequest) {
  let body: AgentRequest;

  try {
    body = (await request.json()) as AgentRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const messages = Array.isArray(body.messages) ? body.messages.slice(-8) : [];
  const latestUserMessage = [...messages].reverse().find((message) => message.role === "user");

  if (!latestUserMessage?.content?.trim()) {
    return NextResponse.json({ error: "Send a user question first." }, { status: 400 });
  }

  const context = await buildContext(body.selectedPath, latestUserMessage.content, body.notes);

  const systemPrompt = [
    "You are Local Code Study Agent, a careful local-only AI coding tutor.",
    "Your job is to help the learner understand this repository through the provided files and search results.",
    "Behave like a practical code-reading agent: explain, trace relationships, propose learning steps, and point to file paths and line hints when available.",
    "Do not claim you edited files or ran commands. This agent is read-only.",
    "If context is missing, say what to open or search next.",
    "Answer in simple Hinglish unless the user asks for another language.",
    "Use concise markdown with bullets and short code snippets when helpful.",
  ].join("\n");

  const ollamaMessages = [
    { role: "system", content: systemPrompt },
    {
      role: "system",
      content: context.contextText || "No repository context was available for this turn.",
    },
    ...messages.map((message) => ({
      role: message.role,
      content: message.content,
    })),
  ];

  try {
    const response = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: body.model?.trim() || DEFAULT_MODEL,
        messages: ollamaMessages,
        stream: false,
        options: {
          temperature: 0.2,
          num_ctx: 12000,
        },
      }),
      signal: AbortSignal.timeout(120_000),
    });

    if (!response.ok) {
      const detail = await response.text();
      return NextResponse.json(
        {
          error: `Ollama returned ${response.status}. ${detail}`,
          model: body.model?.trim() || DEFAULT_MODEL,
          contextFiles: context.contextFiles,
        },
        { status: 502 },
      );
    }

    const data = (await response.json()) as {
      message?: { content?: string };
      model?: string;
    };

    return NextResponse.json({
      message: data.message?.content ?? "No response from local model.",
      model: data.model ?? body.model?.trim() ?? DEFAULT_MODEL,
      contextFiles: context.contextFiles,
      searchResults: context.searchResults,
    });
  } catch {
    return NextResponse.json(
      {
        error:
          "Cannot reach Ollama at localhost:11434. Start Ollama and pull a model, for example: ollama pull qwen2.5-coder:7b",
        model: body.model?.trim() || DEFAULT_MODEL,
        contextFiles: context.contextFiles,
      },
      { status: 503 },
    );
  }
}
