"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Bookmark,
  BookOpen,
  Bot,
  Code2,
  FileCode2,
  Files,
  FolderSearch,
  GitBranch,
  Library,
  Loader2,
  NotebookPen,
  Search,
  Send,
  Server,
  Sparkles,
  Star,
  Wrench,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { MarkdownContent } from "@/components/chat/MarkdownContent";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type StudyFile = {
  path: string;
  name: string;
  kind: "file" | "directory";
  size: number;
  modified: string;
};

type StudyOverview = {
  repoRoot: string;
  stats: {
    sourceFiles: number;
    docFiles: number;
    toolFiles: number;
    commandFiles: number;
  };
  learningTracks: Array<{
    title: string;
    files: string[];
  }>;
  quickFiles: string[];
  files: StudyFile[];
};

type StudySearchResult = {
  path: string;
  line: number;
  preview: string;
};

type StudyFileContent = {
  path: string;
  content: string;
  size: number;
  modified: string;
};

type AgentMessage = {
  role: "user" | "assistant";
  content: string;
  contextFiles?: string[];
};

type AgentStatus = {
  ok: boolean;
  url: string;
  models: string[];
  defaultModel: string;
  error?: string;
};

const tabs = [
  { id: "overview", label: "Overview", icon: Library },
  { id: "files", label: "Files", icon: Files },
  { id: "search", label: "Search", icon: FolderSearch },
  { id: "notes", label: "Notes", icon: NotebookPen },
] as const;

type TabId = (typeof tabs)[number]["id"];

const fallbackOverview: StudyOverview = {
  repoRoot: "",
  stats: {
    sourceFiles: 0,
    docFiles: 0,
    toolFiles: 0,
    commandFiles: 0,
  },
  learningTracks: [],
  quickFiles: [],
  files: [],
};

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function extensionOf(filePath: string) {
  const match = filePath.match(/\.([^.]+)$/);
  return match ? match[1].toUpperCase() : "TXT";
}

function firstUsefulLines(content: string) {
  return content
    .split(/\r?\n/)
    .filter((line) => line.trim() && !line.trim().startsWith("#"))
    .slice(0, 5)
    .join("\n");
}

const starterAgentMessages: AgentMessage[] = [
  {
    role: "assistant",
    content:
      "Main local study agent hoon. File select karo, phir mujhse pucho: explain karo, related files dhundo, ya learning notes banao.",
  },
];

export function StudyApp() {
  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const [overview, setOverview] = useState<StudyOverview>(fallbackOverview);
  const [selectedPath, setSelectedPath] = useState("README.md");
  const [fileContent, setFileContent] = useState<StudyFileContent | null>(null);
  const [overviewLoading, setOverviewLoading] = useState(true);
  const [fileLoading, setFileLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [fileFilter, setFileFilter] = useState("");
  const [searchResults, setSearchResults] = useState<StudySearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [bookmarks, setBookmarks] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [agentMessages, setAgentMessages] = useState<AgentMessage[]>(starterAgentMessages);
  const [agentInput, setAgentInput] = useState("");
  const [agentLoading, setAgentLoading] = useState(false);
  const [agentStatus, setAgentStatus] = useState<AgentStatus | null>(null);
  const [agentModel, setAgentModel] = useState("qwen2.5-coder:7b");

  useEffect(() => {
    const savedBookmarks = window.localStorage.getItem("study-bookmarks");
    const savedNotes = window.localStorage.getItem("study-notes");
    if (savedBookmarks) setBookmarks(JSON.parse(savedBookmarks) as string[]);
    if (savedNotes) setNotes(savedNotes);
  }, []);

  useEffect(() => {
    window.localStorage.setItem("study-bookmarks", JSON.stringify(bookmarks));
  }, [bookmarks]);

  useEffect(() => {
    window.localStorage.setItem("study-notes", notes);
  }, [notes]);

  useEffect(() => {
    let isMounted = true;

    async function loadOverview() {
      setOverviewLoading(true);
      try {
        const response = await fetch("/api/study/overview");
        const data = (await response.json()) as StudyOverview | { error: string };
        if (!response.ok || "error" in data) throw new Error("error" in data ? data.error : "Unable to load overview.");
        if (isMounted) setOverview(data);
      } catch (loadError) {
        if (isMounted) {
          setError(loadError instanceof Error ? loadError.message : "Unable to load overview.");
        }
      } finally {
        if (isMounted) setOverviewLoading(false);
      }
    }

    void loadOverview();
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    async function loadAgentStatus() {
      try {
        const response = await fetch("/api/study/agent/status");
        const data = (await response.json()) as AgentStatus;
        if (isMounted) {
          setAgentStatus(data);
          setAgentModel(data.models[0] ?? data.defaultModel ?? "qwen2.5-coder:7b");
        }
      } catch {
        if (isMounted) {
          setAgentStatus({
            ok: false,
            url: "http://localhost:11434",
            models: [],
            defaultModel: "qwen2.5-coder:7b",
            error: "Unable to check Ollama status.",
          });
        }
      }
    }

    void loadAgentStatus();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    async function loadFile() {
      setFileLoading(true);
      setError("");
      try {
        const response = await fetch(`/api/study/file?path=${encodeURIComponent(selectedPath)}`);
        const data = (await response.json()) as StudyFileContent | { error: string };
        if (!response.ok || "error" in data) throw new Error("error" in data ? data.error : "Unable to read file.");
        if (isMounted) setFileContent(data);
      } catch (loadError) {
        if (isMounted) {
          setFileContent(null);
          setError(loadError instanceof Error ? loadError.message : "Unable to read file.");
        }
      } finally {
        if (isMounted) setFileLoading(false);
      }
    }

    void loadFile();
    return () => {
      isMounted = false;
    };
  }, [selectedPath]);

  const filteredFiles = useMemo(() => {
    const normalized = fileFilter.trim().toLowerCase();
    const files = overview.files.filter((file) => file.kind === "file");
    if (!normalized) return files.slice(0, 180);
    return files.filter((file) => file.path.toLowerCase().includes(normalized)).slice(0, 180);
  }, [fileFilter, overview.files]);

  const selectedFile = overview.files.find((file) => file.path === selectedPath);
  const isBookmarked = bookmarks.includes(selectedPath);
  const codeLines = fileContent?.content.split(/\r?\n/) ?? [];

  async function sendAgentMessage(content: string) {
    const trimmed = content.trim();
    if (!trimmed || agentLoading) return;

    const nextMessages: AgentMessage[] = [
      ...agentMessages,
      {
        role: "user",
        content: trimmed,
      },
    ];

    setAgentMessages(nextMessages);
    setAgentInput("");
    setAgentLoading(true);
    setError("");

    try {
      const response = await fetch("/api/study/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: nextMessages.filter((message) => message.role === "user" || message.role === "assistant"),
          selectedPath,
          notes,
          model: agentModel,
        }),
      });
      const data = (await response.json()) as {
        message?: string;
        error?: string;
        contextFiles?: string[];
        model?: string;
      };

      if (!response.ok || data.error) {
        throw new Error(data.error ?? "Local agent failed.");
      }

      setAgentMessages((current) => [
        ...current,
        {
          role: "assistant",
          content: data.message ?? "No response from local model.",
          contextFiles: data.contextFiles,
        },
      ]);
      if (data.model) setAgentModel(data.model);
    } catch (agentError) {
      setAgentMessages((current) => [
        ...current,
        {
          role: "assistant",
          content:
            agentError instanceof Error
              ? `**Agent offline.** ${agentError.message}`
              : "**Agent offline.** Unable to reach local model.",
        },
      ]);
    } finally {
      setAgentLoading(false);
    }
  }

  async function runSearch(nextQuery = query) {
    const trimmed = nextQuery.trim();
    if (trimmed.length < 2) {
      setSearchResults([]);
      return;
    }

    setSearchLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/study/search?q=${encodeURIComponent(trimmed)}`);
      const data = (await response.json()) as { results: StudySearchResult[] } | { error: string };
      if (!response.ok || "error" in data) throw new Error("error" in data ? data.error : "Unable to search.");
      setSearchResults(data.results);
    } catch (searchError) {
      setError(searchError instanceof Error ? searchError.message : "Unable to search.");
    } finally {
      setSearchLoading(false);
    }
  }

  function chooseFile(filePath: string, tab: TabId = "files") {
    setSelectedPath(filePath);
    setActiveTab(tab);
  }

  function toggleBookmark(filePath: string) {
    setBookmarks((current) =>
      current.includes(filePath)
        ? current.filter((bookmark) => bookmark !== filePath)
        : [filePath, ...current].slice(0, 24),
    );
  }

  return (
    <main className="min-h-screen bg-surface-950 text-surface-100">
      <div className="flex min-h-screen flex-col xl:flex-row">
        <aside className="border-b border-surface-800 bg-surface-900/80 px-4 py-4 xl:w-72 xl:border-b-0 xl:border-r xl:px-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-md border border-emerald-400/30 bg-emerald-400/10 text-emerald-300">
              <BookOpen size={20} aria-hidden="true" />
            </div>
            <div>
              <h1 className="text-lg font-semibold leading-tight">Local Code Study</h1>
              <p className="text-xs text-surface-400">Free offline workspace</p>
            </div>
          </div>

          <nav className="mt-5 grid grid-cols-2 gap-2 xl:grid-cols-1">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    "flex h-10 items-center gap-2 rounded-md border px-3 text-left text-sm transition-colors",
                    activeTab === tab.id
                      ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-200"
                      : "border-surface-800 bg-surface-900 text-surface-300 hover:border-surface-700 hover:bg-surface-800",
                  )}
                >
                  <Icon size={16} aria-hidden="true" />
                  {tab.label}
                </button>
              );
            })}
          </nav>

          <div className="mt-6 grid grid-cols-2 gap-2 xl:grid-cols-1">
            <Metric label="Source files" value={overview.stats.sourceFiles} icon={Code2} />
            <Metric label="Docs" value={overview.stats.docFiles} icon={Library} />
            <Metric label="Tools" value={overview.stats.toolFiles} icon={Server} />
            <Metric label="Commands" value={overview.stats.commandFiles} icon={GitBranch} />
          </div>
        </aside>

        <section className="flex min-h-0 flex-1 flex-col">
          <header className="flex flex-col gap-3 border-b border-surface-800 bg-surface-950 px-4 py-4 md:flex-row md:items-center md:justify-between">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-xs text-surface-500">
                <span className="rounded bg-surface-800 px-2 py-1 font-mono">localhost:3000</span>
                <span className="hidden truncate md:block">{overview.repoRoot}</span>
              </div>
              <h2 className="mt-2 truncate text-xl font-semibold">{selectedPath}</h2>
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => toggleBookmark(selectedPath)}
              >
                {isBookmarked ? <Star size={15} fill="currentColor" /> : <Bookmark size={15} />}
                {isBookmarked ? "Saved" : "Save"}
              </Button>
              {selectedFile && (
                <span className="rounded-md border border-surface-800 px-3 py-1.5 text-xs text-surface-400">
                  {extensionOf(selectedFile.path)} · {formatBytes(selectedFile.size)}
                </span>
              )}
            </div>
          </header>

          {error && (
            <div className="border-b border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
              {error}
            </div>
          )}

          <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)] 2xl:grid-cols-[minmax(0,420px)_minmax(0,1fr)_minmax(360px,420px)]">
            <section className="min-h-[440px] border-b border-surface-800 p-4 lg:border-b-0 lg:border-r">
              {activeTab === "overview" && (
                <OverviewPanel overview={overview} loading={overviewLoading} chooseFile={chooseFile} />
              )}

              {activeTab === "files" && (
                <FilePanel
                  files={filteredFiles}
                  fileFilter={fileFilter}
                  setFileFilter={setFileFilter}
                  selectedPath={selectedPath}
                  chooseFile={chooseFile}
                />
              )}

              {activeTab === "search" && (
                <SearchPanel
                  query={query}
                  setQuery={setQuery}
                  searchResults={searchResults}
                  searchLoading={searchLoading}
                  runSearch={runSearch}
                  chooseFile={chooseFile}
                />
              )}

              {activeTab === "notes" && (
                <NotesPanel
                  notes={notes}
                  setNotes={setNotes}
                  bookmarks={bookmarks}
                  chooseFile={chooseFile}
                />
              )}
            </section>

            <section className="min-h-[540px] overflow-hidden bg-[#0b0f14]">
              {fileLoading ? (
                <div className="flex h-full min-h-[540px] items-center justify-center text-surface-400">
                  <Loader2 className="mr-2 animate-spin" size={18} aria-hidden="true" />
                  Loading file
                </div>
              ) : fileContent ? (
                <div className="flex h-full min-h-[540px] flex-col">
                  <div className="flex items-center justify-between border-b border-surface-800 bg-surface-900 px-4 py-2">
                    <div className="flex min-w-0 items-center gap-2 text-sm text-surface-300">
                      <FileCode2 size={16} aria-hidden="true" />
                      <span className="truncate">{fileContent.path}</span>
                    </div>
                    <span className="text-xs text-surface-500">{formatBytes(fileContent.size)}</span>
                  </div>
                  <pre className="min-h-0 flex-1 overflow-auto p-0 text-[13px] leading-6">
                    <code className="block min-w-max py-3 font-mono">
                      {codeLines.map((line, index) => (
                        <span key={`${fileContent.path}-${index}`} className="grid grid-cols-[64px_minmax(0,1fr)]">
                          <span className="select-none border-r border-surface-800 pr-3 text-right text-surface-600">
                            {index + 1}
                          </span>
                          <span className="whitespace-pre px-4 text-slate-200">{line || " "}</span>
                        </span>
                      ))}
                    </code>
                  </pre>
                </div>
              ) : (
                <div className="flex h-full min-h-[540px] items-center justify-center text-surface-500">
                  No file selected
                </div>
              )}
            </section>

            <AgentPanel
              selectedPath={selectedPath}
              fileContent={fileContent}
              status={agentStatus}
              model={agentModel}
              setModel={setAgentModel}
              messages={agentMessages}
              input={agentInput}
              setInput={setAgentInput}
              loading={agentLoading}
              sendMessage={sendAgentMessage}
            />
          </div>
        </section>
      </div>
    </main>
  );
}

function AgentPanel({
  selectedPath,
  fileContent,
  status,
  model,
  setModel,
  messages,
  input,
  setInput,
  loading,
  sendMessage,
}: {
  selectedPath: string;
  fileContent: StudyFileContent | null;
  status: AgentStatus | null;
  model: string;
  setModel: (value: string) => void;
  messages: AgentMessage[];
  input: string;
  setInput: (value: string) => void;
  loading: boolean;
  sendMessage: (content: string) => Promise<void>;
}) {
  const quickPrompts = [
    "Is selected file ko simple Hinglish me explain karo.",
    "Is file ke related important files aur flow batao.",
    "Mere liye is topic ka 5-step learning plan banao.",
    "Is file se quiz banao with answers.",
  ];

  return (
    <aside className="flex min-h-[540px] flex-col border-t border-surface-800 bg-surface-950 2xl:border-l 2xl:border-t-0">
      <div className="border-b border-surface-800 p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-md border border-cyan-400/30 bg-cyan-400/10 text-cyan-200">
                <Bot size={17} aria-hidden="true" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-surface-100">Local AI Agent</h3>
                <p className="text-xs text-surface-500">Ollama powered, read-only</p>
              </div>
            </div>
          </div>
          <span
            className={cn(
              "rounded-md border px-2 py-1 text-xs",
              status?.ok
                ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-200"
                : "border-amber-400/30 bg-amber-400/10 text-amber-200",
            )}
          >
            {status?.ok ? "Online" : "Setup needed"}
          </span>
        </div>

        {!status?.ok && (
          <div className="mt-3 rounded-md border border-amber-400/30 bg-amber-400/10 p-3 text-xs text-amber-100">
            <div className="font-medium">Ollama start karo:</div>
            <code className="mt-2 block whitespace-pre-wrap rounded bg-surface-950 p-2 font-mono text-[11px] text-surface-200">
              ollama serve{"\n"}ollama pull qwen2.5-coder:7b
            </code>
          </div>
        )}

        <div className="mt-3 grid gap-2">
          <label className="text-xs font-medium text-surface-400" htmlFor="agent-model">
            Model
          </label>
          <input
            id="agent-model"
            value={model}
            onChange={(event) => setModel(event.target.value)}
            className="h-9 rounded-md border border-surface-800 bg-surface-900 px-3 font-mono text-xs text-surface-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500"
          />
        </div>

        <div className="mt-3 rounded-md border border-surface-800 bg-surface-900 p-3">
          <div className="mb-2 flex items-center gap-2 text-xs font-medium text-surface-300">
            <Wrench size={14} aria-hidden="true" />
            Agent tools
          </div>
          <div className="flex flex-wrap gap-2 text-xs text-surface-400">
            <span className="rounded bg-surface-800 px-2 py-1">read file</span>
            <span className="rounded bg-surface-800 px-2 py-1">repo search</span>
            <span className="rounded bg-surface-800 px-2 py-1">learning plan</span>
          </div>
        </div>
      </div>

      <div className="grid gap-2 border-b border-surface-800 p-3">
        {quickPrompts.map((prompt) => (
          <button
            key={prompt}
            type="button"
            disabled={loading}
            onClick={() => void sendMessage(prompt)}
            className="flex items-center gap-2 rounded-md border border-surface-800 bg-surface-900 px-3 py-2 text-left text-xs text-surface-300 hover:border-surface-700 hover:bg-surface-800 disabled:opacity-50"
          >
            <Sparkles size={13} className="text-cyan-300" aria-hidden="true" />
            <span className="min-w-0 truncate">{prompt}</span>
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-auto p-4">
        {messages.map((message, index) => (
          <div
            key={`${message.role}-${index}`}
            className={cn(
              "rounded-md border p-3",
              message.role === "user"
                ? "ml-6 border-cyan-400/30 bg-cyan-400/10"
                : "mr-6 border-surface-800 bg-surface-900",
            )}
          >
            <div className="mb-2 text-xs font-medium text-surface-400">
              {message.role === "user" ? "You" : "Agent"}
            </div>
            <MarkdownContent content={message.content} className="text-sm" />
            {message.contextFiles?.length ? (
              <div className="mt-3 border-t border-surface-800 pt-2">
                <div className="mb-1 text-xs text-surface-500">Context used</div>
                <div className="space-y-1">
                  {message.contextFiles.slice(0, 5).map((filePath) => (
                    <div key={filePath} className="truncate font-mono text-[11px] text-cyan-200">
                      {filePath}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        ))}
        {loading && (
          <div className="mr-6 flex items-center gap-2 rounded-md border border-surface-800 bg-surface-900 p-3 text-sm text-surface-400">
            <Loader2 className="animate-spin" size={16} aria-hidden="true" />
            Agent is thinking
          </div>
        )}
      </div>

      <form
        className="border-t border-surface-800 p-3"
        onSubmit={(event) => {
          event.preventDefault();
          void sendMessage(input);
        }}
      >
        <div className="mb-2 flex items-center justify-between gap-3 text-xs text-surface-500">
          <span className="min-w-0 truncate">Reading: {fileContent?.path ?? selectedPath}</span>
          <span>{fileContent ? formatBytes(fileContent.size) : "no file"}</span>
        </div>
        <div className="flex gap-2">
          <input
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="Ask the local agent"
            className="h-10 min-w-0 flex-1 rounded-md border border-surface-800 bg-surface-900 px-3 text-sm text-surface-100 placeholder:text-surface-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500"
          />
          <Button type="submit" variant="secondary" size="icon" loading={loading} aria-label="Send to agent">
            <Send size={15} />
          </Button>
        </div>
      </form>
    </aside>
  );
}

function Metric({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: number;
  icon: LucideIcon;
}) {
  return (
    <div className="rounded-md border border-surface-800 bg-surface-950 px-3 py-3">
      <div className="flex items-center justify-between text-surface-400">
        <span className="text-xs">{label}</span>
        <Icon size={14} aria-hidden="true" />
      </div>
      <div className="mt-1 font-mono text-xl text-surface-100">{value.toLocaleString()}</div>
    </div>
  );
}

function OverviewPanel({
  overview,
  loading,
  chooseFile,
}: {
  overview: StudyOverview;
  loading: boolean;
  chooseFile: (filePath: string, tab?: TabId) => void;
}) {
  if (loading) {
    return (
      <div className="flex h-full min-h-[360px] items-center justify-center text-surface-400">
        <Loader2 className="mr-2 animate-spin" size={18} aria-hidden="true" />
        Loading workspace
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <section>
        <h3 className="mb-3 text-sm font-semibold text-surface-200">Learning Tracks</h3>
        <div className="space-y-3">
          {overview.learningTracks.map((track) => (
            <div key={track.title} className="rounded-md border border-surface-800 bg-surface-900 p-3">
              <div className="mb-2 flex items-center gap-2 text-sm font-medium text-amber-200">
                <BookOpen size={15} aria-hidden="true" />
                {track.title}
              </div>
              <div className="space-y-1">
                {track.files.map((filePath) => (
                  <button
                    key={filePath}
                    type="button"
                    onClick={() => chooseFile(filePath)}
                    className="block w-full truncate rounded px-2 py-1.5 text-left font-mono text-xs text-surface-300 hover:bg-surface-800 hover:text-surface-100"
                  >
                    {filePath}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h3 className="mb-3 text-sm font-semibold text-surface-200">Quick Open</h3>
        <div className="grid gap-2">
          {overview.quickFiles.map((filePath) => (
            <button
              key={filePath}
              type="button"
              onClick={() => chooseFile(filePath)}
              className="flex items-center gap-2 rounded-md border border-surface-800 bg-surface-950 px-3 py-2 text-left hover:border-surface-700 hover:bg-surface-900"
            >
              <FileCode2 size={15} className="text-emerald-300" aria-hidden="true" />
              <span className="min-w-0 truncate font-mono text-xs text-surface-300">{filePath}</span>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

function FilePanel({
  files,
  fileFilter,
  setFileFilter,
  selectedPath,
  chooseFile,
}: {
  files: StudyFile[];
  fileFilter: string;
  setFileFilter: (value: string) => void;
  selectedPath: string;
  chooseFile: (filePath: string, tab?: TabId) => void;
}) {
  return (
    <div className="flex h-full min-h-[420px] flex-col gap-3">
      <Input
        variant="search"
        placeholder="Filter files"
        value={fileFilter}
        onChange={(event) => setFileFilter(event.target.value)}
      />
      <div className="min-h-0 flex-1 overflow-auto rounded-md border border-surface-800">
        {files.map((file) => (
          <button
            key={file.path}
            type="button"
            onClick={() => chooseFile(file.path)}
            className={cn(
              "grid w-full grid-cols-[minmax(0,1fr)_72px] gap-3 border-b border-surface-800 px-3 py-2 text-left last:border-b-0 hover:bg-surface-900",
              selectedPath === file.path && "bg-emerald-400/10 text-emerald-100",
            )}
          >
            <span className="min-w-0 truncate font-mono text-xs">{file.path}</span>
            <span className="text-right text-xs text-surface-500">{formatBytes(file.size)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function SearchPanel({
  query,
  setQuery,
  searchResults,
  searchLoading,
  runSearch,
  chooseFile,
}: {
  query: string;
  setQuery: (value: string) => void;
  searchResults: StudySearchResult[];
  searchLoading: boolean;
  runSearch: (query?: string) => Promise<void>;
  chooseFile: (filePath: string, tab?: TabId) => void;
}) {
  return (
    <div className="flex h-full min-h-[420px] flex-col gap-3">
      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          void runSearch();
        }}
      >
        <Input
          variant="search"
          placeholder="Search code and docs"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="h-10"
        />
        <Button type="submit" variant="secondary" size="icon" loading={searchLoading} aria-label="Search">
          <Search size={16} />
        </Button>
      </form>

      <div className="min-h-0 flex-1 overflow-auto rounded-md border border-surface-800">
        {searchResults.length === 0 ? (
          <div className="flex h-40 items-center justify-center px-4 text-center text-sm text-surface-500">
            {searchLoading ? "Searching" : "No results"}
          </div>
        ) : (
          searchResults.map((result) => (
            <button
              key={`${result.path}-${result.line}-${result.preview}`}
              type="button"
              onClick={() => chooseFile(result.path)}
              className="block w-full border-b border-surface-800 px-3 py-3 text-left last:border-b-0 hover:bg-surface-900"
            >
              <div className="flex items-center justify-between gap-3">
                <span className="min-w-0 truncate font-mono text-xs text-emerald-200">{result.path}</span>
                <span className="font-mono text-xs text-surface-500">:{result.line}</span>
              </div>
              <p className="mt-1 line-clamp-2 text-sm text-surface-300">{result.preview}</p>
            </button>
          ))
        )}
      </div>
    </div>
  );
}

function NotesPanel({
  notes,
  setNotes,
  bookmarks,
  chooseFile,
}: {
  notes: string;
  setNotes: (value: string) => void;
  bookmarks: string[];
  chooseFile: (filePath: string, tab?: TabId) => void;
}) {
  return (
    <div className="space-y-4">
      <section>
        <h3 className="mb-3 text-sm font-semibold text-surface-200">Bookmarks</h3>
        <div className="rounded-md border border-surface-800">
          {bookmarks.length === 0 ? (
            <div className="px-3 py-8 text-center text-sm text-surface-500">No saved files</div>
          ) : (
            bookmarks.map((filePath) => (
              <button
                key={filePath}
                type="button"
                onClick={() => chooseFile(filePath)}
                className="flex w-full items-center gap-2 border-b border-surface-800 px-3 py-2 text-left last:border-b-0 hover:bg-surface-900"
              >
                <Star size={14} className="text-amber-300" aria-hidden="true" />
                <span className="min-w-0 truncate font-mono text-xs text-surface-300">{filePath}</span>
              </button>
            ))
          )}
        </div>
      </section>

      <section>
        <h3 className="mb-3 text-sm font-semibold text-surface-200">Study Notes</h3>
        <textarea
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          placeholder="Write your notes here"
          className="h-72 w-full resize-none rounded-md border border-surface-800 bg-surface-950 p-3 text-sm text-surface-100 placeholder:text-surface-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
        />
      </section>
    </div>
  );
}
