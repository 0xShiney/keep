import { ForgejoApiError } from "./client";
import type { ForgejoGateway, CreateRepoInput, UpdateRepoInput } from "./gateway";
import type {
  AccessTokenInfo,
  ActivityEvent,
  BranchSummary,
  ChangedFile,
  CommitAuthor,
  CommitDetail,
  CommitSummary,
  CompareResult,
  CreatedAccessToken,
  FileBlob,
  IssueDetail,
  IssueState,
  IssueSummary,
  Label,
  Paginated,
  PullDetail,
  PullState,
  PullSummary,
  ReleaseSummary,
  RepoOwner,
  RepoSearchFilters,
  RepoSummary,
  ReviewComment,
  ReviewSummary,
  SshKey,
  TagSummary,
  TimelineEntry,
  TreeEntry,
  UserIdentity,
} from "./model";
import { cloneUrls } from "@/lib/env";
import { parseUnifiedDiff } from "@/lib/git/diff";
import { fileExtension } from "@/lib/git/path";
import { shortSha } from "./mappers";

/**
 * In-memory demo backend.
 *
 * Only constructed when KEEP_BACKEND=fixture (and KEEP_FIXTURE_ACK=1 outside
 * tests). It exists so the UI and the unit tests can run on a machine with no
 * Docker/Forgejo, and so reviewers can see the design. Every response is
 * invented; the UI renders a "Demo data" badge whenever this backend is active.
 */

const OWNER: RepoOwner = { login: "ada", fullName: "Ada Lovelace", avatarUrl: null };

const PNG_1PX =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

interface FixtureFile {
  content: string;
  binary?: boolean;
}

interface FixtureCommit {
  sha: string;
  message: string;
  authorName: string;
  authorEmail: string;
  date: string;
  parents: string[];
  patch: string;
  files: ChangedFile[];
}

interface FixtureRepo {
  meta: RepoSummary;
  files: Record<string, FixtureFile>;
  commits: FixtureCommit[];
  branches: { name: string; sha: string; protected: boolean }[];
  tags: TagSummary[];
  issues: IssueDetail[];
  pulls: PullDetail[];
  releases: ReleaseSummary[];
}

interface FixtureState {
  repos: Map<string, FixtureRepo>;
  keys: SshKey[];
  tokens: AccessTokenInfo[];
  nextId: number;
}

const now = "2026-11-20T18:00:00Z";

function author(name: string, email: string): CommitAuthor {
  return { name, email, login: "ada", avatarUrl: null, date: now };
}

function changed(
  filename: string,
  additions: number,
  deletions: number,
  status = "modified",
): ChangedFile {
  return {
    filename,
    previousFilename: status === "renamed" ? "old-name.ts" : null,
    status,
    additions,
    deletions,
    changes: additions + deletions,
  };
}

const README = `# Keep

A private code forge for one owner-operator. Reliability first.

- Git hosting: **Forgejo 15 LTS** (never reimplemented)
- App: Next.js 16 App Router + React 19
- Storage: PostgreSQL 16, two databases
- Deployment: Docker Compose behind Caddy

## Getting started

\`\`\`bash
cp .env.example .env
docker compose -f deploy/compose.yaml up -d
\`\`\`

Then open the app origin and sign in through Forgejo.

> Keep never exposes Forgejo's web UI publicly. Only Git smart-HTTP and SSH
> are reachable from outside the host.
`;

const DIFF_PARSER_TS = `import type { DiffFile } from "./types";

export interface DiffLimits {
  maxBytesPerFile: number;
  maxLinesPerFile: number;
}

export function parseUnifiedDiff(text: string, limits: DiffLimits): DiffFile[] {
  const files: DiffFile[] = [];
  for (const block of text.split(/^diff --git /m).slice(1)) {
    files.push(parseBlock(block, limits));
  }
  return files;
}
`;

const REFS_TS = `const FORBIDDEN = /[\\s~^:?*[\\]\\\\]/;

export function assertValidRef(ref: string): string {
  if (ref.startsWith("-")) throw new Error("ref must not start with '-'");
  if (FORBIDDEN.test(ref)) throw new Error("ref contains a forbidden character");
  return ref;
}
`;

const PAGE_TSX = `export default function Page() {
  return (
    <main>
      <h1>Repository</h1>
    </main>
  );
}
`;

const DESIGN_MD = `# Design

Dark is the primary theme; light is derived and must pass the same contrast checks.

| Token | Dark | Light |
| --- | --- | --- |
| \`--bg\` | oklch(0.178 0.008 265) | oklch(0.992 0.002 265) |
| \`--accent\` | oklch(0.705 0.128 256) | oklch(0.545 0.163 256) |

Spacing is a 4 px scale, radii are 4/6/8, elevation comes from borders.
`;

const PATCH_DIFF = `diff --git a/src/lib/diff-parser.ts b/src/lib/diff-parser.ts
index 1111111..2222222 100644
--- a/src/lib/diff-parser.ts
+++ b/src/lib/diff-parser.ts
@@ -1,12 +1,20 @@
 import type { DiffFile } from "./types";
 
 export interface DiffLimits {
   maxBytesPerFile: number;
   maxLinesPerFile: number;
 }
 
-export function parseUnifiedDiff(text: string, limits: DiffLimits): DiffFile[] {
+export function parseUnifiedDiff(
+  text: string,
+  limits: DiffLimits,
+): DiffFile[] {
   const files: DiffFile[] = [];
   for (const block of text.split(/^diff --git /m).slice(1)) {
     files.push(parseBlock(block, limits));
   }
   return files;
 }
`;

const PATCH_REFS = `diff --git a/src/lib/refs.ts b/src/lib/refs.ts
index 3333333..4444444 100644
--- a/src/lib/refs.ts
+++ b/src/lib/refs.ts
@@ -1,8 +1,11 @@
 const FORBIDDEN = /[\\s~^:?*[\\]\\\\]/;
 
 export function assertValidRef(ref: string): string {
+  if (ref.length === 0) throw new Error("ref must not be empty");
+  if (ref.includes("..")) throw new Error("ref must not contain '..'");
   if (ref.startsWith("-")) throw new Error("ref must not start with '-'");
   if (FORBIDDEN.test(ref)) throw new Error("ref contains a forbidden character");
   return ref;
 }
`;

const PATCH_DOCS = `diff --git a/docs/DESIGN.md b/docs/DESIGN.md
new file mode 100644
index 0000000..5555555
--- /dev/null
+++ b/docs/DESIGN.md
@@ -0,0 +1,9 @@
+# Design
+
+Dark is the primary theme; light is derived.
+
+| Token | Dark | Light |
+| --- | --- | --- |
+| \`--bg\` | oklch(0.178 0.008 265) | oklch(0.992 0.002 265) |
+| \`--accent\` | oklch(0.705 0.128 256) | oklch(0.545 0.163 256) |
+
+Spacing is a 4 px scale, radii are 4/6/8.
`;

const PATCH_SCAFFOLD = `diff --git a/README.md b/README.md
new file mode 100644
index 0000000..6666666
--- /dev/null
+++ b/README.md
@@ -0,0 +1,9 @@
+# Keep
+
+A private code forge for one owner-operator.
+
+- Git hosting: Forgejo 15 LTS
+- App: Next.js 16 App Router
+- Storage: PostgreSQL 16
+- Deployment: Docker Compose
+
+See docs/DEPLOYMENT.md.
diff --git a/package.json b/package.json
new file mode 100644
index 0000000..7777777
--- /dev/null
+++ b/package.json
@@ -0,0 +1,8 @@
+{
+  "name": "keep",
+  "private": true,
+  "scripts": {
+    "dev": "next dev",
+    "build": "next build"
+  }
+}
`;

const COMMIT_SHAS = {
  bound: "a1b2c3d4e5f60718293a4b5c6d7e8f9012345678",
  refs: "b2c3d4e5f60718293a4b5c6d7e8f901234567890",
  docs: "c3d4e5f60718293a4b5c6d7e8f90123456789012",
  scaffold: "d4e5f60718293a4b5c6d7e8f9012345678901234",
  page: "e5f60718293a4b5c6d7e8f901234567890123456",
} as const;

function keepRepo(): FixtureRepo {
  const commits: FixtureCommit[] = [
    {
      sha: COMMIT_SHAS.bound,
      message:
        "feat(diff): bound per-file hunk parsing\n\nLarge diffs now stop accumulating lines once a cap is hit and report\ntruncation to the caller.",
      authorName: "Ada Lovelace",
      authorEmail: "ada@example.com",
      date: "2026-11-20T16:42:00Z",
      parents: [COMMIT_SHAS.refs],
      patch: PATCH_DIFF,
      files: [changed("src/lib/diff-parser.ts", 12, 4)],
    },
    {
      sha: COMMIT_SHAS.refs,
      message:
        "fix(refs): reject empty and dotted refs\n\nOption-like refs and '..' traversal were already blocked in the app layer;\nthis closes the same gap in the parser.",
      authorName: "Ada Lovelace",
      authorEmail: "ada@example.com",
      date: "2026-11-20T14:05:00Z",
      parents: [COMMIT_SHAS.docs],
      patch: PATCH_REFS,
      files: [changed("src/lib/refs.ts", 2, 0)],
    },
    {
      sha: COMMIT_SHAS.docs,
      message: "docs: add design tokens",
      authorName: "Ada Lovelace",
      authorEmail: "ada@example.com",
      date: "2026-11-19T09:30:00Z",
      parents: [COMMIT_SHAS.scaffold],
      patch: PATCH_DOCS,
      files: [changed("docs/DESIGN.md", 9, 0, "added")],
    },
    {
      sha: COMMIT_SHAS.scaffold,
      message: "chore: initial scaffold",
      authorName: "Ada Lovelace",
      authorEmail: "ada@example.com",
      date: "2026-11-18T20:11:00Z",
      parents: [],
      patch: PATCH_SCAFFOLD,
      files: [changed("README.md", 9, 0, "added"), changed("package.json", 8, 0, "added")],
    },
  ];

  const languages = ["TypeScript", "CSS", "Markdown", "Shell"];

  const issueLabels: Label[] = [
    { id: 1, name: "enhancement", color: "4f7cff", description: "New capability" },
    { id: 2, name: "bug", color: "d9534f", description: "Something is wrong" },
    { id: 3, name: "a11y", color: "2ea043", description: "Accessibility" },
  ];

  const issues: IssueDetail[] = [
    {
      id: 101,
      number: 1,
      title: "Word-level highlighting inside changed lines",
      body: "Split view should highlight the exact tokens that changed, not the whole line.\n\n- [x] token diff helper\n- [ ] wire into split view\n\nUse `--diff-add-word` / `--diff-del-word` so both themes stay legible.",
      state: "open",
      isPull: false,
      author: OWNER,
      labels: [issueLabels[0]!],
      milestone: null,
      comments: 2,
      createdAt: "2026-11-19T11:00:00Z",
      updatedAt: "2026-11-20T12:00:00Z",
      closedAt: null,
      htmlUrl: null,
      assignees: [OWNER],
      timeline: [
        {
          id: 1,
          type: "comment",
          body: "The LCS helper is in `lib/git/word-diff.ts` and unit tested. The remaining work is rendering.",
          author: OWNER,
          createdAt: "2026-11-20T12:00:00Z",
        },
      ],
    },
    {
      id: 102,
      number: 2,
      title: "Keyboard shortcut help dialog",
      body: "Pressing `?` should open a dialog listing `g d`, `g c`, `g i`, `g p`, `t`, `/`.",
      state: "closed",
      isPull: false,
      author: OWNER,
      labels: [issueLabels[2]!],
      milestone: null,
      comments: 0,
      createdAt: "2026-11-17T08:00:00Z",
      updatedAt: "2026-11-18T10:00:00Z",
      closedAt: "2026-11-18T10:00:00Z",
      htmlUrl: null,
      assignees: [],
      timeline: [],
    },
  ];

  const pullDiff = `diff --git a/src/lib/diff-parser.ts b/src/lib/diff-parser.ts
--- a/src/lib/diff-parser.ts
+++ b/src/lib/diff-parser.ts
@@ -1,6 +1,10 @@
 export interface DiffLimits {
   maxBytesPerFile: number;
   maxLinesPerFile: number;
 }
+
+export const DEFAULT_LIMITS: DiffLimits = {
+  maxBytesPerFile: 512 * 1024,
+  maxLinesPerFile: 5000,
+};
`;

  const pulls: PullDetail[] = [
    {
      id: 201,
      number: 1,
      title: "Bound diff parsing per file",
      body: "Adds explicit caps and a truncation flag so a 20k-line diff cannot block a request.\n\nCloses #1.",
      state: "open",
      merged: false,
      draft: false,
      mergeable: true,
      additions: 4,
      deletions: 0,
      changedFiles: 1,
      author: OWNER,
      headRef: "feature/diff-parser",
      headSha: COMMIT_SHAS.bound,
      baseRef: "main",
      baseSha: COMMIT_SHAS.refs,
      labels: [issueLabels[0]!],
      comments: 0,
      reviewComments: 0,
      createdAt: "2026-11-20T17:00:00Z",
      updatedAt: "2026-11-20T17:00:00Z",
      mergedAt: null,
      htmlUrl: null,
      mergeCommitSha: null,
      commits: [
        {
          sha: COMMIT_SHAS.bound,
          shortSha: shortSha(COMMIT_SHAS.bound),
          message: "feat(diff): bound per-file hunk parsing",
          summaryLine: "feat(diff): bound per-file hunk parsing",
          author: author("Ada Lovelace", "ada@example.com"),
          committer: null,
          parents: [COMMIT_SHAS.refs],
          createdAt: "2026-11-20T16:42:00Z",
          htmlUrl: null,
          verification: null,
        },
      ],
      files: [changed("src/lib/diff-parser.ts", 4, 0)],
      diff: pullDiff,
      diffTruncated: false,
      reviews: [],
    },
  ];

  return {
    meta: {
      id: 1,
      owner: OWNER.login,
      name: "keep",
      fullName: "ada/keep",
      description: "Private self-hosted code forge — the app you are looking at.",
      private: true,
      defaultBranch: "main",
      empty: false,
      archived: false,
      fork: false,
      language: languages[0]!,
      topics: ["self-hosted", "git", "nextjs"],
      stars: 3,
      forks: 0,
      watchers: 3,
      openIssues: 1,
      openPulls: 1,
      sizeKb: 1840,
      website: null,
      updatedAt: "2026-11-20T16:42:00Z",
      createdAt: "2026-11-18T20:11:00Z",
      htmlUrl: "",
      ...cloneUrls(OWNER.login, "keep"),
      cloneUrlHttps: cloneUrls(OWNER.login, "keep").httpsUrl,
      cloneUrlSsh: cloneUrls(OWNER.login, "keep").sshUrl,
      permissions: { admin: true, push: true, pull: true },
      ownerInfo: OWNER,
    },
    files: {
      "README.md": { content: README },
      "docs/DESIGN.md": { content: DESIGN_MD },
      "package.json": {
        content: JSON.stringify(
          {
            name: "keep",
            private: true,
            packageManager: "pnpm@10.34.9",
            scripts: { dev: "next dev" },
          },
          null,
          2,
        ),
      },
      ".gitignore": { content: "node_modules\n.next\n.env\n" },
      "src/lib/diff-parser.ts": { content: DIFF_PARSER_TS },
      "src/lib/refs.ts": { content: REFS_TS },
      "src/app/page.tsx": { content: PAGE_TSX },
      "assets/logo.png": { content: PNG_1PX, binary: true },
    },
    commits,
    branches: [
      { name: "main", sha: COMMIT_SHAS.refs, protected: true },
      { name: "feature/diff-parser", sha: COMMIT_SHAS.bound, protected: false },
    ],
    tags: [
      {
        name: "v0.1.0",
        sha: COMMIT_SHAS.docs,
        message: "First usable scaffold",
        date: "2026-11-19T10:00:00Z",
        tarballUrl: null,
        zipballUrl: null,
        downloadCount: 4,
      },
    ],
    issues,
    pulls,
    releases: [
      {
        id: 301,
        tagName: "v0.1.0",
        name: "v0.1.0 — scaffold",
        body: "Initial repository with the design system and the bounded diff parser.",
        draft: false,
        prerelease: false,
        createdAt: "2026-11-19T10:00:00Z",
        publishedAt: "2026-11-19T10:00:00Z",
        htmlUrl: null,
        author: OWNER,
        assets: [],
      },
    ],
  };
}

function dotfilesRepo(): FixtureRepo {
  const sha = "99887766554433221100ffeeddccbbaa99887766";
  const pullDiff = `diff --git a/zsh/.zshrc b/zsh/.zshrc
--- a/zsh/.zshrc
+++ b/zsh/.zshrc
@@ -1,3 +1,4 @@
 export EDITOR=nvim
 export PAGER=less
+export GPG_TTY=$(tty)
`;
  return {
    meta: {
      id: 2,
      owner: OWNER.login,
      name: "dotfiles",
      fullName: "ada/dotfiles",
      description: "Shell and editor configuration",
      private: true,
      defaultBranch: "main",
      empty: false,
      archived: false,
      fork: false,
      language: "Shell",
      topics: [],
      stars: 0,
      forks: 0,
      watchers: 0,
      openIssues: 0,
      openPulls: 0,
      sizeKb: 42,
      website: null,
      updatedAt: "2026-11-16T09:00:00Z",
      createdAt: "2026-10-02T09:00:00Z",
      htmlUrl: "",
      cloneUrlHttps: cloneUrls(OWNER.login, "dotfiles").httpsUrl,
      cloneUrlSsh: cloneUrls(OWNER.login, "dotfiles").sshUrl,
      permissions: { admin: true, push: true, pull: true },
      ownerInfo: OWNER,
    },
    files: {
      "README.md": {
        content: "# dotfiles\n\nManaged with a bare repo. `make link` after cloning.\n",
      },
      "zsh/.zshrc": { content: "export EDITOR=nvim\nexport PAGER=less\nexport GPG_TTY=$(tty)\n" },
      "nvim/init.lua": { content: "vim.opt.number = true\nvim.opt.relativenumber = true\n" },
      Makefile: { content: "link:\n\tstow zsh nvim\n" },
    },
    commits: [
      {
        sha,
        message: "feat(zsh): export GPG_TTY",
        authorName: "Ada Lovelace",
        authorEmail: "ada@example.com",
        date: "2026-11-16T09:00:00Z",
        parents: [],
        patch: pullDiff,
        files: [changed("zsh/.zshrc", 1, 0)],
      },
    ],
    branches: [{ name: "main", sha, protected: false }],
    tags: [],
    issues: [],
    pulls: [],
    releases: [],
  };
}

function notesRepo(): FixtureRepo {
  const sha = "11223344556677889900aabbccddeeff00112233";
  return {
    meta: {
      id: 3,
      owner: OWNER.login,
      name: "atlas-notes",
      fullName: "ada/atlas-notes",
      description: "Public notes on distributed systems",
      private: false,
      defaultBranch: "main",
      empty: false,
      archived: false,
      fork: false,
      language: "Markdown",
      topics: ["notes"],
      stars: 12,
      forks: 1,
      watchers: 12,
      openIssues: 0,
      openPulls: 0,
      sizeKb: 120,
      website: "https://example.com/notes",
      updatedAt: "2026-11-10T12:00:00Z",
      createdAt: "2026-08-01T12:00:00Z",
      htmlUrl: "",
      cloneUrlHttps: cloneUrls(OWNER.login, "atlas-notes").httpsUrl,
      cloneUrlSsh: cloneUrls(OWNER.login, "atlas-notes").sshUrl,
      permissions: { admin: true, push: true, pull: true },
      ownerInfo: OWNER,
    },
    files: {
      "README.md": {
        content:
          "# Atlas notes\n\n### Consistency\n\nLinearizability is a local property; serializability is global.\n\n### Queues\n\nBackpressure is a feature, not an error.\n",
      },
      "raft.md": {
        content:
          "# Raft\n\nA leader election protocol designed for understandability.\n\n1. Request votes\n2. Replicate log\n3. Commit when a majority acknowledges\n",
      },
    },
    commits: [
      {
        sha,
        message: "docs: note on backpressure",
        authorName: "Ada Lovelace",
        authorEmail: "ada@example.com",
        date: "2026-11-10T12:00:00Z",
        parents: [],
        patch: `diff --git a/README.md b/README.md
--- a/README.md
+++ b/README.md
@@ -3,3 +3,5 @@
 ### Consistency
 
 Linearizability is a local property; serializability is global.
+
+### Queues
`,
        files: [changed("README.md", 2, 0)],
      },
    ],
    branches: [{ name: "main", sha, protected: false }],
    tags: [],
    issues: [],
    pulls: [],
    releases: [],
  };
}

function initialState(): FixtureState {
  return {
    repos: new Map([
      ["ada/keep", keepRepo()],
      ["ada/dotfiles", dotfilesRepo()],
      ["ada/atlas-notes", notesRepo()],
    ]),
    keys: [],
    tokens: [],
    nextId: 1000,
  };
}

export class FixtureForgejoGateway implements ForgejoGateway {
  private static instance: FixtureForgejoGateway | null = null;
  private state: FixtureState = initialState();

  static singleton(): FixtureForgejoGateway {
    if (!FixtureForgejoGateway.instance)
      FixtureForgejoGateway.instance = new FixtureForgejoGateway();
    return FixtureForgejoGateway.instance;
  }

  /** Test helper: wipe mutations between test cases. */
  reset(): void {
    this.state = initialState();
  }

  private repo(owner: string, name: string): FixtureRepo {
    const repo = this.state.repos.get(`${owner}/${name}`);
    if (!repo) throw new ForgejoApiError(404, "not_found", `/repos/${owner}/${name}`);
    return repo;
  }

  cloneUrls(owner: string, name: string): { httpsUrl: string; sshUrl: string } {
    return cloneUrls(owner, name);
  }

  async getUser(): Promise<UserIdentity> {
    return {
      id: 1,
      login: OWNER.login,
      fullName: OWNER.fullName,
      email: "ada@example.com",
      avatarUrl: null,
      isAdmin: true,
      htmlUrl: null,
    };
  }

  async listRepos(filters: RepoSearchFilters): Promise<Paginated<RepoSummary>> {
    const query = (filters.query ?? "").toLowerCase();
    const all = [...this.state.repos.values()]
      .map((repo) => repo.meta)
      .filter((repo) => (query ? repo.fullName.toLowerCase().includes(query) : true))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

    const page = filters.page ?? 1;
    const limit = filters.limit ?? 20;
    const start = (page - 1) * limit;
    const items = all.slice(start, start + limit);
    return { items, total: all.length, hasMore: start + items.length < all.length };
  }

  async getRepo(owner: string, name: string): Promise<RepoSummary> {
    return this.repo(owner, name).meta;
  }

  async createRepo(input: CreateRepoInput): Promise<RepoSummary> {
    const key = `${OWNER.login}/${input.name}`;
    if (this.state.repos.has(key)) {
      throw new ForgejoApiError(409, "repo_exists", "/user/repos");
    }
    const id = (this.state.nextId += 1);
    const repo: FixtureRepo = {
      meta: {
        id,
        owner: OWNER.login,
        name: input.name,
        fullName: key,
        description: input.description || null,
        private: input.private,
        defaultBranch: input.defaultBranch ?? "main",
        empty: !input.autoInit,
        archived: false,
        fork: false,
        language: null,
        topics: [],
        stars: 0,
        forks: 0,
        watchers: 0,
        openIssues: 0,
        openPulls: 0,
        sizeKb: 0,
        website: null,
        updatedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        htmlUrl: "",
        cloneUrlHttps: cloneUrls(OWNER.login, input.name).httpsUrl,
        cloneUrlSsh: cloneUrls(OWNER.login, input.name).sshUrl,
        permissions: { admin: true, push: true, pull: true },
        ownerInfo: OWNER,
      },
      files: input.autoInit
        ? {
            "README.md": {
              content: `# ${input.name}\n\n${input.description || "Created with Keep."}\n`,
            },
            ".gitignore": { content: "node_modules\n.env\n" },
          }
        : {},
      commits: [],
      branches: input.autoInit
        ? [{ name: input.defaultBranch ?? "main", sha: "", protected: false }]
        : [],
      tags: [],
      issues: [],
      pulls: [],
      releases: [],
    };
    this.state.repos.set(key, repo);
    return repo.meta;
  }

  async updateRepo(owner: string, name: string, input: UpdateRepoInput): Promise<RepoSummary> {
    const repo = this.repo(owner, name);
    const nextName = input.name ?? name;
    const next: FixtureRepo = {
      ...repo,
      meta: {
        ...repo.meta,
        name: nextName,
        fullName: `${owner}/${nextName}`,
        description: input.description ?? repo.meta.description,
        private: input.private ?? repo.meta.private,
        defaultBranch: input.defaultBranch ?? repo.meta.defaultBranch,
        archived: input.archived ?? repo.meta.archived,
        updatedAt: new Date().toISOString(),
      },
    };
    this.state.repos.delete(`${owner}/${name}`);
    this.state.repos.set(`${owner}/${nextName}`, next);
    return next.meta;
  }

  async deleteRepo(owner: string, name: string): Promise<void> {
    if (!this.state.repos.delete(`${owner}/${name}`)) {
      throw new ForgejoApiError(404, "not_found", `/repos/${owner}/${name}`);
    }
  }

  async listBranches(owner: string, name: string): Promise<BranchSummary[]> {
    const repo = this.repo(owner, name);
    return repo.branches.map((branch) => {
      const commit = repo.commits.find((c) => c.sha === branch.sha);
      return {
        name: branch.name,
        sha: branch.sha,
        message: commit?.message.split("\n")[0] ?? "Initial commit",
        authorName: commit?.authorName ?? "Ada Lovelace",
        authorLogin: "ada",
        date: commit?.date ?? now,
        isDefault: branch.name === repo.meta.defaultBranch,
        protected: branch.protected,
        userCanPush: true,
        userCanMerge: true,
      };
    });
  }

  async createBranch(owner: string, name: string, branch: string, from: string): Promise<void> {
    const repo = this.repo(owner, name);
    const source = repo.branches.find((item) => item.name === from);
    if (!source) throw new ForgejoApiError(422, "branch_not_found", "/branches");
    repo.branches.push({ name: branch, sha: source.sha, protected: false });
  }

  async deleteBranch(owner: string, name: string, branch: string): Promise<void> {
    const repo = this.repo(owner, name);
    const target = repo.branches.find((item) => item.name === branch);
    if (!target) throw new ForgejoApiError(404, "not_found", "/branches");
    if (target.protected) throw new ForgejoApiError(422, "protected_branch", "/branches");
    repo.branches = repo.branches.filter((item) => item.name !== branch);
  }

  async listTags(owner: string, name: string): Promise<TagSummary[]> {
    return this.repo(owner, name).tags;
  }

  async createTag(owner: string, name: string, tag: string, target: string): Promise<void> {
    const repo = this.repo(owner, name);
    const commit = repo.commits.find((c) => c.sha === target) ?? repo.commits[0];
    repo.tags.unshift({
      name: tag,
      sha: commit?.sha ?? "",
      message: null,
      date: new Date().toISOString(),
      tarballUrl: null,
      zipballUrl: null,
      downloadCount: 0,
    });
  }

  async deleteTag(owner: string, name: string, tag: string): Promise<void> {
    const repo = this.repo(owner, name);
    repo.tags = repo.tags.filter((item) => item.name !== tag);
  }

  private readmeFor(repo: FixtureRepo): FileBlob | null {
    const path = Object.keys(repo.files).find((file) =>
      /^readme(\.(md|markdown|txt))?$/i.test(file),
    );
    if (!path) return null;
    return this.blob(path, repo.files[path]!);
  }

  private blob(path: string, file: FixtureFile): FileBlob {
    const buffer = file.binary
      ? Buffer.from(file.content, "base64")
      : Buffer.from(file.content, "utf8");
    return {
      path,
      name: path.split("/").pop() ?? path,
      sha: `blob-${shortSha(Buffer.from(path).toString("hex"))}`,
      size: buffer.byteLength,
      encoding: file.binary ? "base64" : "utf-8",
      contentBase64: buffer.toString("base64"),
      isBinary: Boolean(file.binary),
      isTruncated: false,
      downloadUrl: "",
      htmlUrl: null,
    };
  }

  async listTree(
    owner: string,
    name: string,
    _ref: string,
    path: string,
  ): Promise<{ entries: TreeEntry[]; readme: FileBlob | null }> {
    const repo = this.repo(owner, name);
    const prefix = path ? `${path}/` : "";
    const seen = new Map<string, TreeEntry>();

    for (const [filePath, file] of Object.entries(repo.files)) {
      if (!filePath.startsWith(prefix)) continue;
      const rest = filePath.slice(prefix.length);
      const slash = rest.indexOf("/");
      if (slash === -1) {
        seen.set(rest, {
          name: rest,
          path: filePath,
          type: "file",
          size: Buffer.byteLength(file.content, "utf8"),
          sha: `blob-${rest}`,
          lastCommitSha: repo.commits[0]?.sha ?? null,
          lastCommitWhen: repo.commits[0]?.date ?? null,
        });
      } else {
        const dir = rest.slice(0, slash);
        seen.set(dir, {
          name: dir,
          path: `${prefix}${dir}`,
          type: "dir",
          size: 0,
          sha: `tree-${dir}`,
          lastCommitSha: repo.commits[0]?.sha ?? null,
          lastCommitWhen: repo.commits[0]?.date ?? null,
        });
      }
    }

    const entries = [...seen.values()].sort((a, b) => {
      if (a.type === b.type) return a.name.localeCompare(b.name);
      return a.type === "dir" ? -1 : 1;
    });

    return { entries, readme: path ? null : this.readmeFor(repo) };
  }

  async getFile(owner: string, name: string, _ref: string, path: string): Promise<FileBlob> {
    const repo = this.repo(owner, name);
    const file = repo.files[path];
    if (!file) throw new ForgejoApiError(404, "not_found", `/contents/${path}`);
    return this.blob(path, file);
  }

  async getRawFile(owner: string, name: string, ref: string, path: string): Promise<Response> {
    const blob = await this.getFile(owner, name, ref, path);
    const bytes = Buffer.from(blob.contentBase64 ?? "", "base64");
    return new Response(bytes, {
      status: 200,
      headers: { "content-type": "application/octet-stream" },
    });
  }

  private commitSummary(repo: FixtureCommit): CommitSummary {
    return {
      sha: repo.sha,
      shortSha: shortSha(repo.sha),
      message: repo.message,
      summaryLine: repo.message.split("\n")[0] ?? "",
      author: author(repo.authorName, repo.authorEmail),
      committer: null,
      parents: repo.parents,
      createdAt: repo.date,
      htmlUrl: null,
      verification: null,
    };
  }

  async listCommits(
    owner: string,
    name: string,
    options: { ref?: string; path?: string; page: number; limit: number },
  ): Promise<Paginated<CommitSummary>> {
    const repo = this.repo(owner, name);
    const limit = Math.min(Math.max(1, options.limit), 50);
    const filtered = options.path
      ? repo.commits.filter((commit) => commit.files.some((file) => file.filename === options.path))
      : repo.commits;
    const start = (options.page - 1) * limit;
    const items = filtered.slice(start, start + limit).map((c) => this.commitSummary(c));
    return { items, total: filtered.length, hasMore: start + items.length < filtered.length };
  }

  async getCommit(owner: string, name: string, sha: string): Promise<CommitDetail> {
    const repo = this.repo(owner, name);
    const commit = repo.commits.find((c) => c.sha === sha || c.sha.startsWith(sha));
    if (!commit) throw new ForgejoApiError(404, "not_found", `/commits/${sha}`);
    const summary = this.commitSummary(commit);
    return {
      ...summary,
      stats: {
        additions: commit.files.reduce((sum, file) => sum + file.additions, 0),
        deletions: commit.files.reduce((sum, file) => sum + file.deletions, 0),
        total: commit.files.reduce((sum, file) => sum + file.changes, 0),
      },
      files: commit.files,
    };
  }

  async getCommitDiff(owner: string, name: string, sha: string): Promise<string> {
    const repo = this.repo(owner, name);
    const commit = repo.commits.find((c) => c.sha === sha || c.sha.startsWith(sha));
    if (!commit) throw new ForgejoApiError(404, "not_found", `/commits/${sha}.diff`);
    return commit.patch;
  }

  async compare(owner: string, name: string, base: string, head: string): Promise<CompareResult> {
    const repo = this.repo(owner, name);
    const headCommit =
      repo.commits.find((c) => c.sha === head || c.sha.startsWith(head)) ?? repo.commits[0];
    const baseCommit = repo.commits.find((c) => c.sha === base || c.sha.startsWith(base));
    if (!headCommit)
      return { commits: [], files: [], diff: "", diffTruncated: false, aheadBy: 0, behindBy: 0 };

    const commits = baseCommit
      ? repo.commits
          .slice(0, repo.commits.indexOf(headCommit) + 1)
          .filter((c) => c.sha !== baseCommit.sha)
      : repo.commits.slice(0, 1);
    const parsed = parseUnifiedDiff(headCommit.patch);
    return {
      commits: commits.map((c) => this.commitSummary(c)),
      files: parsed.files.map((file) =>
        changed(file.path, file.additions, file.deletions, file.status),
      ),
      diff: headCommit.patch,
      diffTruncated: false,
      aheadBy: commits.length,
      behindBy: 0,
    };
  }

  async getLanguages(owner: string, name: string): Promise<Record<string, number>> {
    const repo = this.repo(owner, name);
    const totals: Record<string, number> = {};
    const map: Record<string, string> = {
      ts: "TypeScript",
      tsx: "TypeScript",
      css: "CSS",
      md: "Markdown",
      sh: "Shell",
      lua: "Lua",
      json: "JSON",
    };
    for (const [path, file] of Object.entries(repo.files)) {
      const language = map[fileExtension(path)] ?? "Other";
      totals[language] = (totals[language] ?? 0) + Buffer.byteLength(file.content, "utf8");
    }
    return totals;
  }

  async listIssues(
    owner: string,
    name: string,
    filters: { state: IssueState; labels?: string; query?: string; page: number; limit: number },
  ): Promise<Paginated<IssueSummary>> {
    const repo = this.repo(owner, name);
    const query = (filters.query ?? "").toLowerCase();
    const label = filters.labels?.toLowerCase();
    const filtered = repo.issues.filter((issue) => {
      if (filters.state !== "all" && issue.state !== filters.state) return false;
      if (label && !issue.labels.some((l) => l.name.toLowerCase() === label)) return false;
      if (query && !`${issue.title} ${issue.body}`.toLowerCase().includes(query)) return false;
      return true;
    });
    const start = (filters.page - 1) * filters.limit;
    const items = filtered.slice(start, start + filters.limit);
    return { items, total: filtered.length, hasMore: start + items.length < filtered.length };
  }

  async getIssue(owner: string, name: string, index: number): Promise<IssueDetail> {
    const repo = this.repo(owner, name);
    const issue = repo.issues.find((item) => item.number === index);
    if (!issue) throw new ForgejoApiError(404, "not_found", `/issues/${index}`);
    return issue;
  }

  async createIssue(
    owner: string,
    name: string,
    input: { title: string; body: string; labels?: number[] },
  ): Promise<IssueSummary> {
    const repo = this.repo(owner, name);
    const number = Math.max(0, ...repo.issues.map((issue) => issue.number)) + 1;
    const issue: IssueDetail = {
      id: (this.state.nextId += 1),
      number,
      title: input.title,
      body: input.body,
      state: "open",
      isPull: false,
      author: OWNER,
      labels: [],
      milestone: null,
      comments: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      closedAt: null,
      htmlUrl: null,
      assignees: [],
      timeline: [],
    };
    repo.issues.unshift(issue);
    repo.meta.openIssues += 1;
    return issue;
  }

  async updateIssue(
    owner: string,
    name: string,
    index: number,
    input: { state?: "open" | "closed"; title?: string; body?: string },
  ): Promise<IssueSummary> {
    const repo = this.repo(owner, name);
    const issue = repo.issues.find((item) => item.number === index);
    if (!issue) throw new ForgejoApiError(404, "not_found", `/issues/${index}`);
    if (input.state) {
      issue.state = input.state;
      issue.closedAt = input.state === "closed" ? new Date().toISOString() : null;
    }
    if (input.title) issue.title = input.title;
    if (input.body !== undefined) issue.body = input.body;
    issue.updatedAt = new Date().toISOString();
    return issue;
  }

  async addIssueComment(owner: string, name: string, index: number, body: string): Promise<void> {
    const repo = this.repo(owner, name);
    const issue = repo.issues.find((item) => item.number === index);
    if (!issue) throw new ForgejoApiError(404, "not_found", `/issues/${index}`);
    const entry: TimelineEntry = {
      id: (this.state.nextId += 1),
      type: "comment",
      body,
      author: OWNER,
      createdAt: new Date().toISOString(),
    };
    issue.timeline.push(entry);
    issue.comments += 1;
  }

  async listPulls(
    owner: string,
    name: string,
    filters: { state: PullState; page: number; limit: number },
  ): Promise<Paginated<PullSummary>> {
    const repo = this.repo(owner, name);
    const filtered = repo.pulls.filter((pull) => {
      if (filters.state === "all") return true;
      if (filters.state === "open") return pull.state === "open";
      return pull.state === "closed" || pull.merged;
    });
    const start = (filters.page - 1) * filters.limit;
    const items = filtered.slice(start, start + filters.limit);
    return { items, total: filtered.length, hasMore: start + items.length < filtered.length };
  }

  async getPull(owner: string, name: string, index: number): Promise<PullDetail> {
    const repo = this.repo(owner, name);
    const pull = repo.pulls.find((item) => item.number === index);
    if (!pull) throw new ForgejoApiError(404, "not_found", `/pulls/${index}`);
    return pull;
  }

  async getPullDiff(owner: string, name: string, index: number): Promise<string> {
    return (await this.getPull(owner, name, index)).diff;
  }

  async createPull(
    owner: string,
    name: string,
    input: { title: string; body: string; head: string; base: string },
  ): Promise<PullSummary> {
    const repo = this.repo(owner, name);
    const head = repo.branches.find((branch) => branch.name === input.head);
    if (!head) throw new ForgejoApiError(422, "head_not_found", "/pulls");
    const commit = repo.commits.find((c) => c.sha === head.sha);
    const parsed = parseUnifiedDiff(commit?.patch ?? "");
    const number = Math.max(0, ...repo.pulls.map((pull) => pull.number)) + 1;
    const pull: PullDetail = {
      id: (this.state.nextId += 1),
      number,
      title: input.title,
      body: input.body,
      state: "open",
      merged: false,
      draft: false,
      mergeable: true,
      additions: parsed.totalAdditions,
      deletions: parsed.totalDeletions,
      changedFiles: parsed.files.length,
      author: OWNER,
      headRef: input.head,
      headSha: head.sha,
      baseRef: input.base,
      baseSha: repo.branches.find((b) => b.name === input.base)?.sha ?? "",
      labels: [],
      comments: 0,
      reviewComments: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      mergedAt: null,
      htmlUrl: null,
      mergeCommitSha: null,
      commits: commit ? [this.commitSummary(commit)] : [],
      files: parsed.files.map((file) =>
        changed(file.path, file.additions, file.deletions, file.status),
      ),
      diff: commit?.patch ?? "",
      diffTruncated: false,
      reviews: [],
    };
    repo.pulls.unshift(pull);
    repo.meta.openPulls += 1;
    return pull;
  }

  async mergePull(
    owner: string,
    name: string,
    index: number,
    input: { style: "merge" | "squash" | "rebase" | "fast-forward-only"; message?: string },
  ): Promise<void> {
    const repo = this.repo(owner, name);
    const pull = repo.pulls.find((item) => item.number === index);
    if (!pull) throw new ForgejoApiError(404, "not_found", `/pulls/${index}`);
    if (pull.merged) throw new ForgejoApiError(405, "already_merged", `/pulls/${index}/merge`);
    void input; // Merge options are only recorded by the real gateway.
    pull.merged = true;
    pull.state = "closed";
    pull.mergedAt = new Date().toISOString();
    pull.mergeCommitSha = "feedfacecafebeef00112233445566778899aabb";
    repo.meta.openPulls = Math.max(0, repo.meta.openPulls - 1);
  }

  async createPullReview(
    owner: string,
    name: string,
    index: number,
    input: {
      event: "APPROVED" | "REQUEST_CHANGES" | "COMMENT";
      body: string;
      comments?: { path: string; body: string; new_position?: number; old_position?: number }[];
    },
  ): Promise<void> {
    const repo = this.repo(owner, name);
    const pull = repo.pulls.find((item) => item.number === index);
    if (!pull) throw new ForgejoApiError(404, "not_found", `/pulls/${index}`);
    const comments: ReviewComment[] = (input.comments ?? []).map((comment, i) => ({
      id: (this.state.nextId += i + 1),
      body: comment.body,
      path: comment.path,
      position: comment.new_position ?? null,
      line: comment.new_position ?? null,
      diffHunk: null,
      author: OWNER,
      createdAt: new Date().toISOString(),
    }));
    const review: ReviewSummary = {
      id: (this.state.nextId += 1),
      state: input.event,
      body: input.body,
      author: OWNER,
      submittedAt: new Date().toISOString(),
      comments,
    };
    pull.reviews.push(review);
    pull.reviewComments += comments.length;
  }

  async listReleases(owner: string, name: string): Promise<ReleaseSummary[]> {
    return this.repo(owner, name).releases;
  }

  async createRelease(
    owner: string,
    name: string,
    input: { tagName: string; title: string; notes: string; prerelease: boolean },
  ): Promise<ReleaseSummary> {
    const repo = this.repo(owner, name);
    const release: ReleaseSummary = {
      id: (this.state.nextId += 1),
      tagName: input.tagName,
      name: input.title,
      body: input.notes,
      draft: false,
      prerelease: input.prerelease,
      createdAt: new Date().toISOString(),
      publishedAt: new Date().toISOString(),
      htmlUrl: null,
      author: OWNER,
      assets: [],
    };
    repo.releases.unshift(release);
    if (!repo.tags.some((tag) => tag.name === input.tagName)) {
      await this.createTag(owner, name, input.tagName, repo.branches[0]?.sha ?? "");
    }
    return release;
  }

  async listKeys(): Promise<SshKey[]> {
    return this.state.keys;
  }

  async addKey(title: string, key: string): Promise<SshKey> {
    const created: SshKey = {
      id: (this.state.nextId += 1),
      title,
      fingerprint: `SHA256:${Buffer.from(key).toString("base64").slice(0, 43)}`,
      keyType: key.split(" ")[0] ?? "ssh-ed25519",
      readOnly: false,
      createdAt: new Date().toISOString(),
    };
    this.state.keys.push(created);
    return created;
  }

  async deleteKey(id: number): Promise<void> {
    this.state.keys = this.state.keys.filter((key) => key.id !== id);
  }

  async listTokens(): Promise<AccessTokenInfo[]> {
    return this.state.tokens;
  }

  async createToken(name: string, scopes: string[]): Promise<CreatedAccessToken> {
    const id = (this.state.nextId += 1);
    const token = `keep_demo_${Buffer.from(`${name}:${id}`).toString("base64url")}`;
    this.state.tokens.push({
      id,
      name,
      scopes,
      lastEight: token.slice(-8),
      createdAt: new Date().toISOString(),
    });
    return { id, name, token, scopes };
  }

  async deleteToken(name: string): Promise<void> {
    this.state.tokens = this.state.tokens.filter((token) => token.name !== name);
  }

  async listActivity(limit: number): Promise<ActivityEvent[]> {
    const events: ActivityEvent[] = [];
    let id = 1;
    for (const repo of this.state.repos.values()) {
      for (const commit of repo.commits) {
        events.push({
          id: id++,
          opType: "commit_repo",
          actor: OWNER,
          repoOwner: repo.meta.owner,
          repoName: repo.meta.name,
          refName: repo.meta.defaultBranch,
          content: commit.message.split("\n")[0] ?? "",
          comment: null,
          isPrivate: repo.meta.private,
          createdAt: commit.date,
        });
      }
    }
    return events
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, Math.min(limit, 50));
  }
}
