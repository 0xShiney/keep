/**
 * Domain models exposed to the rest of the app.
 *
 * These are intentionally independent of Forgejo's wire format: mappers convert
 * generated API types into these shapes once, so a Forgejo API rename breaks the
 * mappers (and their contract tests) instead of leaking into every component.
 */

export type RepoVisibility = "public" | "private";

export interface RepoPermissions {
  admin: boolean;
  push: boolean;
  pull: boolean;
}

export interface RepoOwner {
  login: string;
  fullName: string | null;
  avatarUrl: string | null;
}

export interface RepoSummary {
  id: number;
  owner: string;
  name: string;
  fullName: string;
  description: string | null;
  private: boolean;
  defaultBranch: string;
  empty: boolean;
  archived: boolean;
  fork: boolean;
  language: string | null;
  topics: string[];
  stars: number;
  forks: number;
  watchers: number;
  openIssues: number;
  openPulls: number;
  sizeKb: number;
  website: string | null;
  updatedAt: string;
  createdAt: string;
  htmlUrl: string;
  cloneUrlHttps: string;
  cloneUrlSsh: string;
  permissions: RepoPermissions;
  ownerInfo: RepoOwner;
}

export interface TreeEntry {
  name: string;
  path: string;
  type: "file" | "dir" | "symlink" | "submodule";
  size: number;
  sha: string;
  lastCommitSha: string | null;
  lastCommitWhen: string | null;
}

export interface FileBlob {
  path: string;
  name: string;
  sha: string;
  size: number;
  encoding: string | null;
  contentBase64: string | null;
  isBinary: boolean;
  isTruncated: boolean;
  downloadUrl: string;
  htmlUrl: string | null;
}

export interface CommitAuthor {
  name: string;
  email: string;
  login: string | null;
  avatarUrl: string | null;
  date: string;
}

export interface CommitSummary {
  sha: string;
  shortSha: string;
  message: string;
  summaryLine: string;
  author: CommitAuthor;
  committer: CommitAuthor | null;
  parents: string[];
  createdAt: string;
  htmlUrl: string | null;
  verification: { verified: boolean; reason: string | null } | null;
}

export interface CommitStats {
  additions: number;
  deletions: number;
  total: number;
}

export interface CommitDetail extends CommitSummary {
  stats: CommitStats;
  files: ChangedFile[];
}

export interface ChangedFile {
  filename: string;
  previousFilename: string | null;
  status: string;
  additions: number;
  deletions: number;
  changes: number;
}

export interface BranchSummary {
  name: string;
  sha: string;
  message: string;
  authorName: string;
  authorLogin: string | null;
  date: string;
  isDefault: boolean;
  protected: boolean;
  userCanPush: boolean;
  userCanMerge: boolean;
}

export interface TagSummary {
  name: string;
  sha: string;
  message: string | null;
  date: string | null;
  tarballUrl: string | null;
  zipballUrl: string | null;
  downloadCount: number;
}

export interface UserIdentity {
  id: number;
  login: string;
  fullName: string | null;
  email: string | null;
  avatarUrl: string | null;
  isAdmin: boolean;
  htmlUrl: string | null;
}

export interface Label {
  id: number;
  name: string;
  color: string;
  description: string | null;
}

export interface Milestone {
  id: number;
  title: string;
  state: string;
  openIssues: number;
  closedIssues: number;
  dueOn: string | null;
}

export type IssueState = "open" | "closed" | "all";

export interface Comment {
  id: number;
  body: string;
  author: RepoOwner;
  createdAt: string;
  updatedAt: string | null;
  htmlUrl: string | null;
}

export interface IssueSummary {
  id: number;
  number: number;
  title: string;
  body: string;
  state: "open" | "closed";
  isPull: boolean;
  author: RepoOwner;
  labels: Label[];
  milestone: Milestone | null;
  comments: number;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
  htmlUrl: string | null;
}

export interface IssueDetail extends IssueSummary {
  assignees: RepoOwner[];
  timeline: TimelineEntry[];
}

export interface TimelineEntry {
  id: number;
  type: string;
  body: string | null;
  author: RepoOwner | null;
  createdAt: string;
}

export type PullState = "open" | "closed" | "all";

export interface PullSummary {
  id: number;
  number: number;
  title: string;
  body: string;
  state: "open" | "closed";
  merged: boolean;
  draft: boolean;
  mergeable: boolean;
  additions: number;
  deletions: number;
  changedFiles: number;
  author: RepoOwner;
  headRef: string;
  headSha: string;
  baseRef: string;
  baseSha: string;
  labels: Label[];
  comments: number;
  reviewComments: number;
  createdAt: string;
  updatedAt: string;
  mergedAt: string | null;
  htmlUrl: string | null;
}

export interface PullDetail extends PullSummary {
  mergeCommitSha: string | null;
  commits: CommitSummary[];
  files: ChangedFile[];
  diff: string;
  diffTruncated: boolean;
  reviews: ReviewSummary[];
}

export interface ReviewSummary {
  id: number;
  state: string;
  body: string;
  author: RepoOwner;
  submittedAt: string | null;
  comments: ReviewComment[];
}

export interface ReviewComment {
  id: number;
  body: string;
  path: string;
  position: number | null;
  line: number | null;
  diffHunk: string | null;
  author: RepoOwner;
  createdAt: string;
}

export interface ReleaseAsset {
  id: number;
  name: string;
  size: number;
  downloadCount: number;
  contentType: string | null;
  browserDownloadUrl: string | null;
  createdAt: string;
}

export interface ReleaseSummary {
  id: number;
  tagName: string;
  name: string;
  body: string;
  draft: boolean;
  prerelease: boolean;
  createdAt: string;
  publishedAt: string | null;
  htmlUrl: string | null;
  author: RepoOwner;
  assets: ReleaseAsset[];
}

export interface SshKey {
  id: number;
  title: string;
  fingerprint: string | null;
  keyType: string | null;
  readOnly: boolean;
  createdAt: string;
}

export interface AccessTokenInfo {
  id: number;
  name: string;
  scopes: string[];
  lastEight: string | null;
  /** Forgejo 15 does not send created_at for listed tokens; null when unknown. */
  createdAt: string | null;
}

export interface CreatedAccessToken {
  id: number;
  name: string;
  /** Shown exactly once. Never persisted by Keep. */
  token: string;
  scopes: string[];
}

export interface ActivityEvent {
  id: number;
  opType: string;
  actor: RepoOwner | null;
  repoOwner: string | null;
  repoName: string | null;
  refName: string | null;
  content: string | null;
  comment: string | null;
  isPrivate: boolean;
  createdAt: string;
}

export interface CompareResult {
  commits: CommitSummary[];
  files: ChangedFile[];
  diff: string;
  diffTruncated: boolean;
  aheadBy: number;
  behindBy: number;
}

export interface Paginated<T> {
  items: T[];
  /** Total count when Forgejo reports it (X-Total-Count), otherwise items.length. */
  total: number;
  hasMore: boolean;
}

export interface RepoSearchFilters {
  query?: string;
  page?: number;
  limit?: number;
  sort?: "updated" | "created" | "name" | "stars";
  order?: "asc" | "desc";
}
