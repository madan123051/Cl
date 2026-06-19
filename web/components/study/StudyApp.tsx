"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Bookmark,
  BookOpen,
  Code2,
  FileCode2,
  Files,
  FolderSearch,
  GitBranch,
  Library,
  Loader2,
  NotebookPen,
  Search,
  Server,
  Star,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
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

          <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(0,480px)_minmax(0,1fr)]">
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
          </div>
        </section>
      </div>
    </main>
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
