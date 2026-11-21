import type {
  ActivityEvent,
  BranchSummary,
  CommitDetail,
  CommitSummary,
  CompareResult,
  CreatedAccessToken,
  FileBlob,
  IssueDetail,
  IssueState,
  IssueSummary,
  Paginated,
  PullDetail,
  PullState,
  PullSummary,
  ReleaseSummary,
  RepoSearchFilters,
  RepoSummary,
  SshKey,
  TagSummary,
  AccessTokenInfo,
  TreeEntry,
  UserIdentity,
  CommitDetail as CommitDetailModel,
} from "./model";

/**
 * The single seam between Keep and its Git engine.
 *
 * `HttpForgejoGateway` implements this against Forgejo's REST API.
 * `FixtureForgejoGateway` implements it against an in-memory demo dataset that
 * is only reachable with KEEP_BACKEND=fixture. Keeping the interface narrow means
 * every call site is testable without a network.
 */
export interface ForgejoGateway {
  getUser(): Promise<UserIdentity>;

  listRepos(filters: RepoSearchFilters): Promise<Paginated<RepoSummary>>;
  getRepo(owner: string, name: string): Promise<RepoSummary>;
  createRepo(input: CreateRepoInput): Promise<RepoSummary>;
  updateRepo(owner: string, name: string, input: UpdateRepoInput): Promise<RepoSummary>;
  deleteRepo(owner: string, name: string): Promise<void>;

  listBranches(owner: string, name: string): Promise<BranchSummary[]>;
  createBranch(owner: string, name: string, branch: string, from: string): Promise<void>;
  deleteBranch(owner: string, name: string, branch: string): Promise<void>;
  listTags(owner: string, name: string): Promise<TagSummary[]>;
  createTag(owner: string, name: string, tag: string, target: string): Promise<void>;
  deleteTag(owner: string, name: string, tag: string): Promise<void>;

  listTree(
    owner: string,
    name: string,
    ref: string,
    path: string,
  ): Promise<{ entries: TreeEntry[]; readme: FileBlob | null }>;
  getFile(owner: string, name: string, ref: string, path: string): Promise<FileBlob>;
  getRawFile(owner: string, name: string, ref: string, path: string): Promise<Response>;

  listCommits(
    owner: string,
    name: string,
    options: { ref?: string; path?: string; page: number; limit: number },
  ): Promise<Paginated<CommitSummary>>;
  getCommit(owner: string, name: string, sha: string): Promise<CommitDetail>;
  getCommitDiff(owner: string, name: string, sha: string): Promise<string>;
  compare(owner: string, name: string, base: string, head: string): Promise<CompareResult>;
  getLanguages(owner: string, name: string): Promise<Record<string, number>>;

  listIssues(
    owner: string,
    name: string,
    filters: { state: IssueState; labels?: string; query?: string; page: number; limit: number },
  ): Promise<Paginated<IssueSummary>>;
  getIssue(owner: string, name: string, index: number): Promise<IssueDetail>;
  createIssue(
    owner: string,
    name: string,
    input: { title: string; body: string; labels?: number[] },
  ): Promise<IssueSummary>;
  updateIssue(
    owner: string,
    name: string,
    index: number,
    input: { state?: "open" | "closed"; title?: string; body?: string },
  ): Promise<IssueSummary>;
  addIssueComment(owner: string, name: string, index: number, body: string): Promise<void>;

  listPulls(
    owner: string,
    name: string,
    filters: { state: PullState; page: number; limit: number },
  ): Promise<Paginated<PullSummary>>;
  getPull(owner: string, name: string, index: number): Promise<PullDetail>;
  getPullDiff(owner: string, name: string, index: number): Promise<string>;
  createPull(
    owner: string,
    name: string,
    input: { title: string; body: string; head: string; base: string },
  ): Promise<PullSummary>;
  mergePull(
    owner: string,
    name: string,
    index: number,
    input: { style: "merge" | "squash" | "rebase" | "fast-forward-only"; message?: string },
  ): Promise<void>;
  createPullReview(
    owner: string,
    name: string,
    index: number,
    input: {
      event: "APPROVED" | "REQUEST_CHANGES" | "COMMENT";
      body: string;
      comments?: { path: string; body: string; new_position?: number; old_position?: number }[];
    },
  ): Promise<void>;

  listReleases(owner: string, name: string): Promise<ReleaseSummary[]>;
  createRelease(
    owner: string,
    name: string,
    input: { tagName: string; title: string; notes: string; prerelease: boolean },
  ): Promise<ReleaseSummary>;

  listKeys(): Promise<SshKey[]>;
  addKey(title: string, key: string): Promise<SshKey>;
  deleteKey(id: number): Promise<void>;

  listTokens(): Promise<AccessTokenInfo[]>;
  createToken(name: string, scopes: string[]): Promise<CreatedAccessToken>;
  deleteToken(name: string): Promise<void>;

  listActivity(limit: number): Promise<ActivityEvent[]>;

  /** Clone URLs, resolved from Forgejo's own repository payload. */
  cloneUrls(owner: string, name: string): { httpsUrl: string; sshUrl: string };
}

export interface CreateRepoInput {
  name: string;
  description: string;
  private: boolean;
  autoInit: boolean;
  gitignores?: string;
  license?: string;
  readme?: string;
  defaultBranch?: string;
}

export interface UpdateRepoInput {
  name?: string;
  description?: string;
  private?: boolean;
  defaultBranch?: string;
  archived?: boolean;
}

export type CommitDetailShape = CommitDetailModel;
