import type { components } from "./schema";
import { cloneUrls } from "@/lib/env";
import type {
  ActivityEvent,
  AccessTokenInfo,
  BranchSummary,
  ChangedFile,
  Comment,
  CommitAuthor,
  CommitDetail,
  CommitSummary,
  IssueSummary,
  Label,
  Milestone,
  PullDetail,
  PullSummary,
  ReleaseAsset,
  ReleaseSummary,
  RepoOwner,
  RepoSummary,
  ReviewComment,
  ReviewSummary,
  SshKey,
  TagSummary,
  TimelineEntry,
  TreeEntry,
  FileBlob,
  UserIdentity,
} from "./model";

/**
 * Wire types, straight from the generated OpenAPI definitions.
 *
 * Mappers are the only place that knows these shapes. Contract tests feed
 * captured Forgejo payloads through them, so a renamed field fails a test
 * instead of silently rendering `undefined`.
 */
export type ApiRepository = components["schemas"]["Repository"];
export type ApiUser = components["schemas"]["User"];
export type ApiContents = components["schemas"]["ContentsResponse"];
export type ApiGitTree = components["schemas"]["GitTreeResponse"];
export type ApiGitEntry = components["schemas"]["GitEntry"];
export type ApiCommit = components["schemas"]["Commit"];
export type ApiBranch = components["schemas"]["Branch"];
export type ApiTag = components["schemas"]["Tag"];
export type ApiIssue = components["schemas"]["Issue"];
export type ApiPull = components["schemas"]["PullRequest"];
export type ApiReview = components["schemas"]["PullReview"];
export type ApiReviewComment = components["schemas"]["PullReviewComment"];
export type ApiRelease = components["schemas"]["Release"];
export type ApiPublicKey = components["schemas"]["PublicKey"];
export type ApiAccessToken = components["schemas"]["AccessToken"];
export type ApiActivity = components["schemas"]["Activity"];
export type ApiTimelineComment = components["schemas"]["TimelineComment"];
export type ApiChangedFile = components["schemas"]["ChangedFile"];

const EPOCH = "1970-01-01T00:00:00.000Z";

function iso(value: string | null | undefined): string {
  return value ?? EPOCH;
}

export function shortSha(sha: string): string {
  return sha.slice(0, 7);
}

export function mapOwner(raw: ApiUser | null | undefined): RepoOwner {
  return {
    login: raw?.login ?? "unknown",
    fullName: raw?.full_name ?? null,
    avatarUrl: raw?.avatar_url ?? null,
  };
}

export function mapUser(raw: ApiUser): UserIdentity {
  return {
    id: raw.id ?? 0,
    login: raw.login ?? "unknown",
    fullName: raw.full_name ?? null,
    email: raw.email ?? null,
    avatarUrl: raw.avatar_url ?? null,
    isAdmin: raw.is_admin ?? false,
    htmlUrl: raw.html_url ?? null,
  };
}

export function mapRepo(
  raw: ApiRepository,
  urls: { httpsUrl: string; sshUrl: string } = { httpsUrl: "", sshUrl: "" },
): RepoSummary {
  const fullName = raw.full_name ?? `${raw.owner?.login ?? "unknown"}/${raw.name ?? "repo"}`;
  const [ownerFromName, nameFromFull] = fullName.split("/");
  const owner = raw.owner?.login ?? ownerFromName ?? "unknown";
  const name = raw.name ?? nameFromFull ?? "repo";
  const fallback = cloneUrls(owner, name);
  const permissions = raw.permissions;

  return {
    id: raw.id ?? 0,
    owner,
    name,
    fullName,
    description: raw.description || null,
    private: raw.private ?? true,
    defaultBranch: raw.default_branch || "main",
    empty: raw.empty ?? false,
    archived: raw.archived ?? false,
    fork: raw.fork ?? false,
    language: raw.language || null,
    topics: raw.topics ?? [],
    stars: raw.stars_count ?? 0,
    forks: raw.forks_count ?? 0,
    watchers: raw.watchers_count ?? 0,
    openIssues: raw.open_issues_count ?? 0,
    openPulls: raw.open_pr_counter ?? 0,
    sizeKb: raw.size ?? 0,
    website: raw.website || null,
    updatedAt: iso(raw.updated_at),
    createdAt: iso(raw.created_at),
    htmlUrl: raw.html_url ?? "",
    cloneUrlHttps: urls.httpsUrl || fallback.httpsUrl,
    cloneUrlSsh: urls.sshUrl || fallback.sshUrl,
    permissions: {
      admin: permissions?.admin ?? false,
      push: permissions?.push ?? false,
      pull: permissions?.pull ?? true,
    },
    ownerInfo: mapOwner(raw.owner),
  };
}

export function mapGitEntry(raw: ApiGitEntry): TreeEntry {
  const type =
    raw.type === "tree"
      ? "dir"
      : raw.mode === "120000"
        ? "symlink"
        : raw.type === "commit" || raw.mode === "160000"
          ? "submodule"
          : "file";
  return {
    name: raw.path?.split("/").pop() ?? "",
    path: raw.path ?? "",
    type,
    size: raw.size ?? 0,
    sha: raw.sha ?? "",
    // The git tree API does not expose per-entry last-commit metadata.
    lastCommitSha: null,
    lastCommitWhen: null,
  };
}

export function mapTreeEntry(raw: ApiContents): TreeEntry {
  const type =
    raw.type === "dir"
      ? "dir"
      : raw.type === "symlink"
        ? "symlink"
        : raw.type === "submodule"
          ? "submodule"
          : "file";
  return {
    name: raw.name ?? raw.path?.split("/").pop() ?? "",
    path: raw.path ?? raw.name ?? "",
    type,
    size: raw.size ?? 0,
    sha: raw.sha ?? "",
    lastCommitSha: raw.last_commit_sha ?? null,
    lastCommitWhen: raw.last_commit_when ? iso(raw.last_commit_when) : null,
  };
}

/** Heuristic binary detection on the decoded prefix (NUL bytes). */
export function looksBinary(buffer: Buffer): boolean {
  const sample = buffer.subarray(0, 8192);
  return sample.includes(0);
}

export function mapFileBlob(raw: ApiContents, buffer: Buffer | null): FileBlob {
  const isBinary = buffer ? looksBinary(buffer) : false;
  return {
    path: raw.path ?? raw.name ?? "",
    name: raw.name ?? "",
    sha: raw.sha ?? "",
    size: raw.size ?? buffer?.byteLength ?? 0,
    encoding: raw.encoding ?? null,
    contentBase64: isBinary ? null : (raw.content ?? null),
    isBinary,
    isTruncated: false,
    downloadUrl: raw.download_url ?? "",
    htmlUrl: raw.html_url ?? null,
  };
}

function mapCommitAuthor(
  raw: components["schemas"]["CommitUser"] | null | undefined,
  login: string | null,
  avatarUrl: string | null,
): CommitAuthor {
  return {
    name: raw?.name ?? login ?? "unknown",
    email: raw?.email ?? "",
    login,
    avatarUrl,
    date: iso(raw?.date),
  };
}

export function mapCommit(raw: ApiCommit): CommitSummary {
  const commit = raw.commit;
  const message = commit?.message ?? "";
  const verification = commit?.verification;
  const authorLogin = raw.author?.login ?? null;

  return {
    sha: raw.sha ?? "",
    shortSha: shortSha(raw.sha ?? ""),
    message,
    summaryLine: message.split("\n")[0] ?? "",
    author: mapCommitAuthor(commit?.author, authorLogin, raw.author?.avatar_url ?? null),
    committer: commit?.committer ? mapCommitAuthor(commit.committer, null, null) : null,
    parents: (raw.parents ?? [])
      .map((parent) => parent.sha)
      .filter((sha): sha is string => Boolean(sha)),
    createdAt: iso(raw.created),
    htmlUrl: raw.html_url ?? null,
    verification: verification
      ? { verified: verification.verified ?? false, reason: verification.reason || null }
      : null,
  };
}

export function mapChangedFile(raw: ApiChangedFile): ChangedFile {
  return {
    filename: raw.filename ?? "",
    previousFilename: raw.previous_filename || null,
    status: raw.status ?? "modified",
    additions: raw.additions ?? 0,
    deletions: raw.deletions ?? 0,
    changes: raw.changes ?? 0,
  };
}

export function mapCommitDetail(raw: ApiCommit): CommitDetail {
  const summary = mapCommit(raw);
  return {
    ...summary,
    stats: {
      additions: raw.stats?.additions ?? 0,
      deletions: raw.stats?.deletions ?? 0,
      total: raw.stats?.total ?? 0,
    },
    files: (raw.files ?? []).map(mapChangedFile),
  };
}

export function mapBranch(raw: ApiBranch, defaultBranch: string): BranchSummary {
  const commit = raw.commit;
  return {
    name: raw.name ?? "",
    sha: commit?.id ?? "",
    message: commit?.message ?? "",
    authorName: commit?.author?.name ?? "unknown",
    authorLogin: null,
    date: iso(commit?.timestamp),
    isDefault: raw.name === defaultBranch,
    protected: raw.protected ?? false,
    userCanPush: raw.user_can_push ?? true,
    userCanMerge: raw.user_can_merge ?? true,
  };
}

export function mapTag(raw: ApiTag): TagSummary {
  return {
    name: raw.name ?? "",
    sha: raw.commit?.sha ?? "",
    message: raw.message || null,
    date: raw.commit?.created ? iso(raw.commit.created) : null,
    tarballUrl: raw.tarball_url ?? null,
    zipballUrl: raw.zipball_url ?? null,
    downloadCount: typeof raw.archive_download_count === "number" ? raw.archive_download_count : 0,
  };
}

export function mapLabel(raw: components["schemas"]["Label"]): Label {
  return {
    id: raw.id ?? 0,
    name: raw.name ?? "",
    color: raw.color ?? "888888",
    description: raw.description || null,
  };
}

export function mapMilestone(raw: components["schemas"]["Milestone"]): Milestone {
  return {
    id: raw.id ?? 0,
    title: raw.title ?? "",
    state: raw.state ?? "open",
    openIssues: raw.open_issues ?? 0,
    closedIssues: raw.closed_issues ?? 0,
    dueOn: raw.due_on || null,
  };
}

export function mapIssue(raw: ApiIssue): IssueSummary {
  return {
    id: raw.id ?? 0,
    number: raw.number ?? 0,
    title: raw.title ?? "",
    body: raw.body ?? "",
    state: raw.state === "closed" ? "closed" : "open",
    isPull: Boolean(raw.pull_request),
    author: mapOwner(raw.user),
    labels: (raw.labels ?? []).map(mapLabel),
    milestone: raw.milestone ? mapMilestone(raw.milestone) : null,
    comments: raw.comments ?? 0,
    createdAt: iso(raw.created_at),
    updatedAt: iso(raw.updated_at),
    closedAt: raw.closed_at ?? null,
    htmlUrl: raw.html_url ?? null,
  };
}

export function mapTimelineComment(raw: ApiTimelineComment): TimelineEntry {
  return {
    id: raw.id ?? 0,
    type: raw.type ?? "comment",
    body: raw.body || null,
    author: raw.user ? mapOwner(raw.user) : null,
    createdAt: iso(raw.created_at),
  };
}

export function mapComment(raw: components["schemas"]["Comment"]): Comment {
  return {
    id: raw.id ?? 0,
    body: raw.body ?? "",
    author: mapOwner(raw.user),
    createdAt: iso(raw.created_at),
    updatedAt: raw.updated_at ? iso(raw.updated_at) : null,
    htmlUrl: raw.html_url ?? null,
  };
}

export function mapPull(raw: ApiPull): PullSummary {
  return {
    id: raw.id ?? 0,
    number: raw.number ?? 0,
    title: raw.title ?? "",
    body: raw.body ?? "",
    state: raw.state === "closed" ? "closed" : "open",
    merged: raw.merged ?? false,
    draft: raw.draft ?? false,
    mergeable: raw.mergeable ?? false,
    additions: raw.additions ?? 0,
    deletions: raw.deletions ?? 0,
    changedFiles: raw.changed_files ?? 0,
    author: mapOwner(raw.user),
    headRef: raw.head?.ref ?? "",
    headSha: raw.head?.sha ?? "",
    baseRef: raw.base?.ref ?? "",
    baseSha: raw.base?.sha ?? "",
    labels: (raw.labels ?? []).map(mapLabel),
    comments: raw.comments ?? 0,
    reviewComments: raw.review_comments ?? 0,
    createdAt: iso(raw.created_at),
    updatedAt: iso(raw.updated_at),
    mergedAt: raw.merged_at ?? null,
    htmlUrl: raw.html_url ?? null,
  };
}

export function mapPullDetail(
  raw: ApiPull,
  extra: {
    commits: CommitSummary[];
    files: ChangedFile[];
    diff: string;
    diffTruncated: boolean;
    reviews: ReviewSummary[];
    mergeCommitSha: string | null;
  },
): PullDetail {
  return {
    ...mapPull(raw),
    mergeCommitSha: extra.mergeCommitSha,
    commits: extra.commits,
    files: extra.files,
    diff: extra.diff,
    diffTruncated: extra.diffTruncated,
    reviews: extra.reviews,
  };
}

export function mapReviewComment(raw: ApiReviewComment): ReviewComment {
  return {
    id: raw.id ?? 0,
    body: raw.body ?? "",
    path: raw.path ?? "",
    position: raw.position ?? null,
    line: raw.position ?? null,
    diffHunk: raw.diff_hunk ?? null,
    author: mapOwner(raw.user),
    createdAt: iso(raw.created_at),
  };
}

export function mapReview(raw: ApiReview, comments: ReviewComment[] = []): ReviewSummary {
  return {
    id: raw.id ?? 0,
    state: raw.state ?? "COMMENT",
    body: raw.body ?? "",
    author: mapOwner(raw.user),
    submittedAt: raw.submitted_at ? iso(raw.submitted_at) : null,
    comments,
  };
}

export function mapReleaseAsset(raw: components["schemas"]["Attachment"]): ReleaseAsset {
  return {
    id: raw.id ?? 0,
    name: raw.name ?? "",
    size: raw.size ?? 0,
    downloadCount: raw.download_count ?? 0,
    contentType: raw.browser_download_url ? null : null,
    browserDownloadUrl: raw.browser_download_url ?? null,
    createdAt: iso(raw.created_at),
  };
}

export function mapRelease(raw: ApiRelease): ReleaseSummary {
  return {
    id: raw.id ?? 0,
    tagName: raw.tag_name ?? "",
    name: raw.name || raw.tag_name || "",
    body: raw.body ?? "",
    draft: raw.draft ?? false,
    prerelease: raw.prerelease ?? false,
    createdAt: iso(raw.created_at),
    publishedAt: raw.published_at ?? null,
    htmlUrl: raw.html_url ?? null,
    author: mapOwner(raw.author),
    assets: (raw.assets ?? []).map(mapReleaseAsset),
  };
}

export function mapSshKey(raw: ApiPublicKey): SshKey {
  return {
    id: raw.id ?? 0,
    title: raw.title ?? "",
    fingerprint: raw.fingerprint ?? null,
    keyType: raw.key_type ?? null,
    readOnly: raw.read_only ?? false,
    createdAt: iso(raw.created_at),
  };
}

export function mapAccessToken(raw: ApiAccessToken): AccessTokenInfo {
  return {
    id: raw.id ?? 0,
    name: raw.name ?? "",
    scopes: raw.scopes ?? [],
    lastEight: raw.token_last_eight ?? null,
    // Present in newer Forgejo versions, absent from the 15.x list payload.
    createdAt: iso((raw as { created_at?: string }).created_at),
  };
}

export function mapActivity(raw: ApiActivity): ActivityEvent {
  return {
    id: raw.id ?? 0,
    opType: raw.op_type ?? "unknown",
    actor: raw.act_user ? mapOwner(raw.act_user) : null,
    repoOwner: raw.repo?.owner?.login ?? null,
    repoName: raw.repo?.name ?? null,
    refName: raw.ref_name || null,
    content: raw.content || null,
    comment: raw.comment?.body || null,
    isPrivate: raw.is_private ?? true,
    createdAt: iso(raw.created),
  };
}
