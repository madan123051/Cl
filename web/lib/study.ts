import fs from "fs/promises";
import path from "path";

export type StudyFile = {
  path: string;
  name: string;
  kind: "file" | "directory";
  size: number;
  modified: string;
};

export type StudySearchResult = {
  path: string;
  line: number;
  preview: string;
};

export type StudyOverview = {
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

const REPO_ROOT = path.resolve(process.cwd(), "..");

const ALLOWED_ROOTS = [
  "README.md",
  "package.json",
  "docs",
  "prompts",
  "scripts",
  "src",
  "web/app",
  "web/components",
  "web/lib",
  "mcp-server/README.md",
  "mcp-server/src",
  "mcp-server/package.json",
];

const SKIP_DIRS = new Set([
  ".git",
  ".next",
  "dist",
  "node_modules",
  "coverage",
  "public",
]);

const TEXT_EXTENSIONS = new Set([
  ".css",
  ".json",
  ".js",
  ".jsx",
  ".md",
  ".mjs",
  ".ts",
  ".tsx",
  ".txt",
  ".yml",
  ".yaml",
]);

export function getRepoRoot() {
  return REPO_ROOT;
}

export function normalizeStudyPath(input: string) {
  return input.replace(/\\/g, "/").replace(/^\/+/, "");
}

export function resolveStudyPath(input: string) {
  const relativePath = normalizeStudyPath(input);
  const resolved = path.resolve(REPO_ROOT, relativePath);
  const isInsideRepo = resolved === REPO_ROOT || resolved.startsWith(REPO_ROOT + path.sep);
  const allowed = ALLOWED_ROOTS.some((root) => {
    const normalizedRoot = normalizeStudyPath(root);
    return relativePath === normalizedRoot || relativePath.startsWith(`${normalizedRoot}/`);
  });

  if (!isInsideRepo || !allowed) {
    throw new Error("Path is outside the local study workspace.");
  }

  return { relativePath, resolved };
}

async function safeStat(relativePath: string) {
  try {
    const { resolved } = resolveStudyPath(relativePath);
    return await fs.stat(resolved);
  } catch {
    return null;
  }
}

async function walk(relativePath: string, maxFiles = 500): Promise<StudyFile[]> {
  const stat = await safeStat(relativePath);
  if (!stat) return [];

  if (!stat.isDirectory()) {
    return [
      {
        path: normalizeStudyPath(relativePath),
        name: path.basename(relativePath),
        kind: "file",
        size: stat.size,
        modified: stat.mtime.toISOString(),
      },
    ];
  }

  const { resolved } = resolveStudyPath(relativePath);
  const entries = await fs.readdir(resolved, { withFileTypes: true });
  const files: StudyFile[] = [];

  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (files.length >= maxFiles) break;
    if (entry.isDirectory() && SKIP_DIRS.has(entry.name)) continue;

    const childPath = normalizeStudyPath(path.posix.join(normalizeStudyPath(relativePath), entry.name));
    const childStat = await safeStat(childPath);
    if (!childStat) continue;

    files.push({
      path: childPath,
      name: entry.name,
      kind: entry.isDirectory() ? "directory" : "file",
      size: childStat.size,
      modified: childStat.mtime.toISOString(),
    });

    if (entry.isDirectory()) {
      const nested = await walk(childPath, maxFiles - files.length);
      files.push(...nested);
    }
  }

  return files.slice(0, maxFiles);
}

export async function readStudyFile(relativePath: string) {
  const { resolved, relativePath: normalized } = resolveStudyPath(relativePath);
  const stat = await fs.stat(resolved);

  if (stat.isDirectory()) {
    throw new Error("Select a file, not a directory.");
  }

  if (stat.size > 512_000) {
    throw new Error("This file is too large for the local viewer.");
  }

  const ext = path.extname(resolved).toLowerCase();
  if (!TEXT_EXTENSIONS.has(ext)) {
    throw new Error("Only text files are supported in this viewer.");
  }

  return {
    path: normalized,
    content: await fs.readFile(resolved, "utf8"),
    size: stat.size,
    modified: stat.mtime.toISOString(),
  };
}

export async function getStudyOverview(): Promise<StudyOverview> {
  const [sourceFiles, docFiles, promptFiles, scriptFiles, mcpFiles, webFiles] = await Promise.all([
    walk("src", 3200),
    walk("docs", 120),
    walk("prompts", 80),
    walk("scripts", 80),
    walk("mcp-server/src", 80),
    walk("web/app", 120),
  ]);

  const allFiles = [
    ...(await walk("README.md", 1)),
    ...(await walk("package.json", 1)),
    ...docFiles,
    ...promptFiles,
    ...scriptFiles,
    ...sourceFiles,
    ...mcpFiles,
    ...webFiles,
  ].filter((file) => file.kind === "file");

  const sourceOnly = sourceFiles.filter((file) => file.kind === "file");

  return {
    repoRoot: REPO_ROOT,
    stats: {
      sourceFiles: sourceOnly.length,
      docFiles: docFiles.filter((file) => file.kind === "file").length,
      toolFiles: sourceOnly.filter((file) => file.path.includes("/tools/")).length,
      commandFiles: sourceOnly.filter((file) => file.path.includes("/commands/")).length,
    },
    learningTracks: [
      {
        title: "Start here",
        files: ["README.md", "docs/architecture.md", "docs/exploration-guide.md"],
      },
      {
        title: "Tool system",
        files: ["docs/tools.md", "src/Tool.ts", "src/tools/BashTool/BashTool.tsx"],
      },
      {
        title: "Commands",
        files: ["docs/commands.md", "src/commands.ts", "src/commands/help/help.tsx"],
      },
      {
        title: "Web and MCP",
        files: ["mcp-server/README.md", "mcp-server/src/server.ts", "web/app/page.tsx"],
      },
    ],
    quickFiles: [
      "README.md",
      "docs/architecture.md",
      "docs/tools.md",
      "docs/commands.md",
      "src/entrypoints/cli.tsx",
      "src/main.tsx",
      "src/Tool.ts",
      "src/commands.ts",
      "mcp-server/README.md",
    ],
    files: allFiles,
  };
}

export async function searchStudyFiles(query: string): Promise<StudySearchResult[]> {
  const normalizedQuery = query.trim().toLowerCase();
  if (normalizedQuery.length < 2) return [];

  const overview = await getStudyOverview();
  const searchableFiles = overview.files.slice(0, 2200);
  const results: StudySearchResult[] = [];

  for (const file of searchableFiles) {
    if (results.length >= 80) break;
    const ext = path.extname(file.path).toLowerCase();
    if (!TEXT_EXTENSIONS.has(ext)) continue;

    try {
      const content = await readStudyFile(file.path);
      const lines = content.content.split(/\r?\n/);

      for (let index = 0; index < lines.length; index += 1) {
        if (results.length >= 80) break;
        const line = lines[index];
        if (line.toLowerCase().includes(normalizedQuery)) {
          results.push({
            path: file.path,
            line: index + 1,
            preview: line.trim().slice(0, 220),
          });
        }
      }
    } catch {
      continue;
    }
  }

  return results;
}
