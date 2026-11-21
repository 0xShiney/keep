import { ForgejoApiError, type ForgejoClient } from "./client";
import { AppError } from "@/lib/errors";
import {
  mapActivity,
  mapBranch,
  mapChangedFile,
  mapCommit,
  mapCommitDetail,
  mapFileBlob,
  mapGitEntry,
  mapIssue,
  mapPull,
  mapPullDetail,
  mapRelease,
  mapRepo,
  mapReview,
  mapReviewComment,
  mapSshKey,
  mapTag,
  mapTimelineComment,
  mapUser,
  type ApiActivity,
  type ApiBranch,
  type ApiChangedFile,
  type ApiCommit,
  type ApiContents,
  type ApiGitTree,
  type ApiIssue,
  type ApiPublicKey,
  type ApiPull,
  type ApiRelease,
  type ApiRepository,
  type ApiReview,
  type ApiReviewComment,
  type ApiTag,
  type ApiTimelineComment,
  type ApiUser,
} from "./mappers";
import type { ForgejoGateway, CreateRepoInput, UpdateRepoInput } from "./gateway";
import type {
  AccessTokenInfo,
  ActivityEvent,
  BranchSummary,
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
  TreeEntry,
  UserIdentity,
  CommitSummary,
  CommitDetail,
} from "./model";
import { cached } from "@/lib/cache";
import { cloneUrls } from "@/lib/env";
import { childLogger } from "@/lib/logger";
import { getTokenBroker } from "./token-broker";

const log = childLogger({ module: "forgejo-gateway" });

/** Forgejo caps `limit` at 50 server-wide; keep requests inside that. */
export const FORGEJO_MAX_LIMIT = 50;

/** Refuse to hand more than this many bytes of diff to the parser/UI. */
export const MAX_DIFF_BYTES = 2 * 1024 * 1024;

/**
 * Read-only lists that render on nearly every page. 30 s is short enough that a
 * newly pushed commit or repository shows up on the next view, and long enough
 * to collapse a page's sidebar + dashboard requests into one Forgejo call.
 */
const LIST_CACHE_TTL_MS = 30_000;

/**
 * Commit pages are the one Forgejo read that is CPU-bound on the server side
 * (~200 ms per page on 5k commits, ~1 s each under five concurrent requests).
 * The single-flight TTL collapses duplicate traffic; the trade-off is that a
 * push can take up to 30 s to appear on the commits page. The tree page reads
 * branch heads and is not affected.
 */
const COMMITS_CACHE_TTL_MS = 30_000;

function clampLimit(limit: number): number {
  return Math.min(Math.max(1, limit), FORGEJO_MAX_LIMIT);
}

function totalFrom(headers: Headers, fallback: number): number {
  const raw = headers.get("x-total-count");
  const parsed = raw ? Number(raw) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : fallback;
}

function capText(text: string): { text: string; truncated: boolean } {
  if (Buffer.byteLength(text, "utf8") <= MAX_DIFF_BYTES) return { text, truncated: false };
  return { text: text.slice(0, MAX_DIFF_BYTES), truncated: true };
}

interface ComparePayload {
  commits?: ApiCommit[];
  files?: ApiChangedFile[];
  ahead_by?: number;
  behind_by?: number;
}

export class HttpForgejoGateway implements ForgejoGateway {
  /** One gateway lives for one request, so this only de-duplicates page loads. */
  private readonly repoCache = new Map<string, Promise<RepoSummary>>();

  constructor(
    private readonly client: ForgejoClient,
    private readonly username: string,
    private readonly login: string,
  ) {}

  async getUser(): Promise<UserIdentity> {
    const { data } = await this.client.json<ApiUser>("/user");
    return mapUser(data);
  }

  async listRepos(filters: RepoSearchFilters): Promise<Paginated<RepoSummary>> {
    const page = filters.page ?? 1;
    const limit = clampLimit(filters.limit ?? 20);
    const key = `repos:${this.username}:${JSON.stringify({ ...filters, page, limit })}`;
    return cached(key, LIST_CACHE_TTL_MS, async () => {
      const { data, headers } = await this.client.json<{ data?: ApiRepository[] }>(
        "/repos/search",
        {
          query: {
            q: filters.query,
            page,
            limit,
            sort: filters.sort,
            order: filters.order,
            topic: false,
          },
        },
      );
      const raw = data.data ?? [];
      const items = raw.map((repo) => mapRepo(repo));
      return {
        items,
        total: totalFrom(headers, items.length),
        hasMore: raw.length === limit,
      };
    });
  }

  async getRepo(owner: string, name: string): Promise<RepoSummary> {
    const key = `${owner}/${name}`;
    const cached = this.repoCache.get(key);
    if (cached) return cached;
    const request = this.client
      .json<ApiRepository>(`/repos/${owner}/${name}`)
      .then(({ data }) => mapRepo(data));
    this.repoCache.set(key, request);
    return request;
  }

  async createRepo(input: CreateRepoInput): Promise<RepoSummary> {
    const { data } = await this.client.send<ApiRepository>("POST", "/user/repos", {
      name: input.name,
      description: input.description,
      private: input.private,
      auto_init: input.autoInit,
      gitignores: input.gitignores,
      license: input.license,
      readme: input.readme ?? (input.autoInit ? "Default" : undefined),
      default_branch: input.defaultBranch ?? "main",
    });
    return mapRepo(data);
  }

  async updateRepo(owner: string, name: string, input: UpdateRepoInput): Promise<RepoSummary> {
    const { data } = await this.client.send<ApiRepository>("PATCH", `/repos/${owner}/${name}`, {
      name: input.name,
      description: input.description,
      private: input.private,
      default_branch: input.defaultBranch,
      archived: input.archived,
    });
    return mapRepo(data);
  }

  async deleteRepo(owner: string, name: string): Promise<void> {
    await this.client.empty("DELETE", `/repos/${owner}/${name}`);
  }

  async listBranches(owner: string, name: string): Promise<BranchSummary[]> {
    const repo = await this.getRepo(owner, name);
    const { data } = await this.client.json<ApiBranch[]>(`/repos/${owner}/${name}/branches`, {
      query: { page: 1, limit: FORGEJO_MAX_LIMIT },
    });
    return data.map((branch) => mapBranch(branch, repo.defaultBranch));
  }

  async createBranch(owner: string, name: string, branch: string, from: string): Promise<void> {
    await this.client.empty("POST", `/repos/${owner}/${name}/branches`, {
      new_branch_name: branch,
      old_branch_name: from,
    });
  }

  async deleteBranch(owner: string, name: string, branch: string): Promise<void> {
    await this.client.empty(
      "DELETE",
      `/repos/${owner}/${name}/branches/${encodeURIComponent(branch)}`,
    );
  }

  async listTags(owner: string, name: string): Promise<TagSummary[]> {
    const { data } = await this.client.json<ApiTag[]>(`/repos/${owner}/${name}/tags`, {
      query: { page: 1, limit: FORGEJO_MAX_LIMIT },
    });
    return data.map(mapTag);
  }

  async createTag(owner: string, name: string, tag: string, target: string): Promise<void> {
    await this.client.empty("POST", `/repos/${owner}/${name}/tags`, {
      tag_name: tag,
      target,
    });
  }

  async deleteTag(owner: string, name: string, tag: string): Promise<void> {
    await this.client.empty("DELETE", `/repos/${owner}/${name}/tags/${encodeURIComponent(tag)}`);
  }

  /**
   * Directory listings come from the git tree API, not `/contents`.
   *
   * Forgejo's `/contents` resolves the last commit of every entry by walking
   * history; on the 10k-file / 5k-commit fixture it took ~1.2 s at the root and
   * ~18 s per subdirectory, blowing the tree NFR. The git tree API answers in
   * ~40 ms. The trade-off is that entries no longer carry last-commit metadata
   * (the git API does not provide it); the UI simply leaves that column blank.
   *
   * The tree API is not path-scoped, so each path segment is resolved through
   * the tree objects instead of one recursive request over 10k entries.
   */
  async listTree(
    owner: string,
    name: string,
    ref: string,
    path: string,
  ): Promise<{ entries: TreeEntry[]; readme: FileBlob | null }> {
    const treePath = (sha: string) =>
      `/repos/${owner}/${name}/git/trees/${encodeURIComponent(sha)}`;

    let tree = await this.client.json<ApiGitTree>(treePath(ref));
    for (const segment of path.split("/").filter(Boolean)) {
      const next = (tree.data.tree ?? []).find(
        (entry) => entry.path === segment && entry.type === "tree" && entry.sha,
      );
      if (!next?.sha) return { entries: [], readme: null };
      tree = await this.client.json<ApiGitTree>(treePath(next.sha));
    }

    const entries = (tree.data.tree ?? []).map(mapGitEntry).sort((a, b) => {
      if (a.type === b.type) return a.name.localeCompare(b.name);
      return a.type === "dir" ? -1 : 1;
    });

    let readme: FileBlob | null = null;
    if (!path) {
      const candidate = entries.find(
        (entry) => entry.type === "file" && /^readme(\.(md|markdown|txt))?$/i.test(entry.name),
      );
      if (candidate) {
        try {
          readme = await this.getFile(owner, name, ref, candidate.path);
        } catch (error) {
          log.warn({ err: (error as Error).message }, "README fetch failed");
        }
      }
    }

    return { entries, readme };
  }

  async getFile(owner: string, name: string, ref: string, path: string): Promise<FileBlob> {
    const suffix = path.split("/").map(encodeURIComponent).join("/");
    const { data } = await this.client.json<ApiContents>(
      `/repos/${owner}/${name}/contents/${suffix}`,
      { query: { ref } },
    );
    const buffer = data.content ? Buffer.from(data.content, "base64") : null;
    return mapFileBlob(data, buffer);
  }

  async getRawFile(owner: string, name: string, ref: string, path: string): Promise<Response> {
    const suffix = path.split("/").map(encodeURIComponent).join("/");
    return this.client.rawRequest(`/repos/${owner}/${name}/raw/${suffix}`, {
      query: { ref },
      headers: { accept: "application/octet-stream" },
    });
  }

  async listCommits(
    owner: string,
    name: string,
    options: { ref?: string; path?: string; page: number; limit: number },
  ): Promise<Paginated<CommitSummary>> {
    const limit = clampLimit(options.limit);
    const key = `commits:${this.username}:${owner}/${name}:${JSON.stringify({ ...options, limit })}`;
    return cached(key, COMMITS_CACHE_TTL_MS, async () => {
      const { data, headers } = await this.client.json<ApiCommit[]>(
        `/repos/${owner}/${name}/commits`,
        {
          query: {
            sha: options.ref,
            path: options.path,
            page: options.page,
            limit,
          },
        },
      );
      const items = data.map(mapCommit);
      return { items, total: totalFrom(headers, items.length), hasMore: data.length === limit };
    });
  }

  async getCommit(owner: string, name: string, sha: string): Promise<CommitDetail> {
    const { data } = await this.client.json<ApiCommit>(
      `/repos/${owner}/${name}/git/commits/${encodeURIComponent(sha)}`,
    );
    return mapCommitDetail(data);
  }

  async getCommitDiff(owner: string, name: string, sha: string): Promise<string> {
    const text = await this.client.text(
      `/repos/${owner}/${name}/git/commits/${encodeURIComponent(sha)}.diff`,
    );
    return capText(text).text;
  }

  async compare(owner: string, name: string, base: string, head: string): Promise<CompareResult> {
    const { data } = await this.client.json<ComparePayload>(
      `/repos/${owner}/${name}/compare/${encodeURIComponent(base)}...${encodeURIComponent(head)}`,
    );
    const diffText = await this.client.text(
      `/repos/${owner}/${name}/compare/${encodeURIComponent(base)}...${encodeURIComponent(head)}.diff`,
    );
    const capped = capText(diffText);
    return {
      commits: (data.commits ?? []).map(mapCommit),
      files: (data.files ?? []).map(mapChangedFile),
      diff: capped.text,
      diffTruncated: capped.truncated,
      aheadBy: data.ahead_by ?? 0,
      behindBy: data.behind_by ?? 0,
    };
  }

  async getLanguages(owner: string, name: string): Promise<Record<string, number>> {
    const { data } = await this.client.json<Record<string, number>>(
      `/repos/${owner}/${name}/languages`,
    );
    return data ?? {};
  }

  async listIssues(
    owner: string,
    name: string,
    filters: { state: IssueState; labels?: string; query?: string; page: number; limit: number },
  ): Promise<Paginated<IssueSummary>> {
    const limit = clampLimit(filters.limit);
    const { data, headers } = await this.client.json<ApiIssue[]>(`/repos/${owner}/${name}/issues`, {
      query: {
        state: filters.state,
        labels: filters.labels,
        q: filters.query,
        type: "issues",
        page: filters.page,
        limit,
      },
    });
    const items = data.map(mapIssue);
    return { items, total: totalFrom(headers, items.length), hasMore: data.length === limit };
  }

  async getIssue(owner: string, name: string, index: number): Promise<IssueDetail> {
    const [issue, timeline] = await Promise.all([
      this.client.json<ApiIssue>(`/repos/${owner}/${name}/issues/${index}`),
      this.client.json<ApiTimelineComment[]>(`/repos/${owner}/${name}/issues/${index}/timeline`, {
        query: { limit: FORGEJO_MAX_LIMIT },
      }),
    ]);
    const mapped = mapIssue(issue.data);
    return {
      ...mapped,
      assignees: (issue.data.assignees ?? []).map((assignee) => ({
        login: assignee.login ?? "unknown",
        fullName: assignee.full_name ?? null,
        avatarUrl: assignee.avatar_url ?? null,
      })),
      // Forgejo can return JSON null for an empty timeline; never assume an array.
      timeline: (timeline.data ?? []).map(mapTimelineComment),
    };
  }

  async createIssue(
    owner: string,
    name: string,
    input: { title: string; body: string; labels?: number[] },
  ): Promise<IssueSummary> {
    const { data } = await this.client.send<ApiIssue>("POST", `/repos/${owner}/${name}/issues`, {
      title: input.title,
      body: input.body,
      labels: input.labels,
    });
    return mapIssue(data);
  }

  async updateIssue(
    owner: string,
    name: string,
    index: number,
    input: { state?: "open" | "closed"; title?: string; body?: string },
  ): Promise<IssueSummary> {
    const { data } = await this.client.send<ApiIssue>(
      "PATCH",
      `/repos/${owner}/${name}/issues/${index}`,
      input,
    );
    return mapIssue(data);
  }

  async addIssueComment(owner: string, name: string, index: number, body: string): Promise<void> {
    await this.client.empty("POST", `/repos/${owner}/${name}/issues/${index}/comments`, { body });
  }

  async listPulls(
    owner: string,
    name: string,
    filters: { state: PullState; page: number; limit: number },
  ): Promise<Paginated<PullSummary>> {
    const limit = clampLimit(filters.limit);
    const { data, headers } = await this.client.json<ApiPull[]>(`/repos/${owner}/${name}/pulls`, {
      query: { state: filters.state, page: filters.page, limit },
    });
    const items = data.map(mapPull);
    return { items, total: totalFrom(headers, items.length), hasMore: data.length === limit };
  }

  async getPull(owner: string, name: string, index: number): Promise<PullDetail> {
    const [pull, commits, files, reviews, diffText] = await Promise.all([
      this.client.json<ApiPull>(`/repos/${owner}/${name}/pulls/${index}`),
      this.client.json<ApiCommit[]>(`/repos/${owner}/${name}/pulls/${index}/commits`, {
        query: { limit: FORGEJO_MAX_LIMIT },
      }),
      this.client.json<ApiChangedFile[]>(`/repos/${owner}/${name}/pulls/${index}/files`, {
        query: { limit: FORGEJO_MAX_LIMIT },
      }),
      this.client.json<ApiReview[]>(`/repos/${owner}/${name}/pulls/${index}/reviews`, {
        query: { limit: 20 },
      }),
      this.client.text(`/repos/${owner}/${name}/pulls/${index}.diff`),
    ]);

    const reviewComments = await Promise.all(
      reviews.data.slice(0, 20).map(async (review) => {
        if (!review.id) return [];
        const comments = await this.client.json<ApiReviewComment[]>(
          `/repos/${owner}/${name}/pulls/${index}/reviews/${review.id}/comments`,
          { query: { limit: FORGEJO_MAX_LIMIT } },
        );
        return comments.data.map(mapReviewComment);
      }),
    );

    const capped = capText(diffText);

    return mapPullDetail(pull.data, {
      commits: commits.data.map(mapCommit),
      files: files.data.map(mapChangedFile),
      diff: capped.text,
      diffTruncated: capped.truncated,
      reviews: reviews.data.map((review, i) => mapReview(review, reviewComments[i] ?? [])),
      mergeCommitSha: pull.data.merge_commit_sha || null,
    });
  }

  async getPullDiff(owner: string, name: string, index: number): Promise<string> {
    const text = await this.client.text(`/repos/${owner}/${name}/pulls/${index}.diff`);
    return capText(text).text;
  }

  async createPull(
    owner: string,
    name: string,
    input: { title: string; body: string; head: string; base: string },
  ): Promise<PullSummary> {
    const { data } = await this.client.send<ApiPull>("POST", `/repos/${owner}/${name}/pulls`, {
      title: input.title,
      body: input.body,
      head: input.head,
      base: input.base,
    });
    return mapPull(data);
  }

  async mergePull(
    owner: string,
    name: string,
    index: number,
    input: { style: "merge" | "squash" | "rebase" | "fast-forward-only"; message?: string },
  ): Promise<void> {
    const styleMap = {
      merge: "merge",
      squash: "squash",
      rebase: "rebase",
      "fast-forward-only": "fast-forward-only",
    } as const;
    await this.client.empty("POST", `/repos/${owner}/${name}/pulls/${index}/merge`, {
      Do: styleMap[input.style],
      MergeTitleField: input.message,
      MergeMessageField: input.message,
    });
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
    try {
      await this.client.empty("POST", `/repos/${owner}/${name}/pulls/${index}/reviews`, {
        event: input.event,
        body: input.body,
        comments: input.comments?.map((comment) => ({
          path: comment.path,
          body: comment.body,
          new_position: comment.new_position,
          old_position: comment.old_position,
        })),
      });
    } catch (error) {
      // Forgejo refuses approvals authored by the pull's own author. A single-owner
      // forge therefore cannot self-approve; say so instead of "the engine rejected
      // this change" so the UI is actionable.
      if (
        error instanceof ForgejoApiError &&
        error.status === 422 &&
        /approve your own pull/i.test(error.body)
      ) {
        throw new AppError(
          409,
          "Self-approval is not allowed",
          "Forgejo does not allow approving your own pull request. Comment on the pull, or have another account approve it.",
        );
      }
      throw error;
    }
  }

  async listReleases(owner: string, name: string): Promise<ReleaseSummary[]> {
    const { data } = await this.client.json<ApiRelease[]>(`/repos/${owner}/${name}/releases`, {
      query: { limit: FORGEJO_MAX_LIMIT },
    });
    return data.map(mapRelease);
  }

  async createRelease(
    owner: string,
    name: string,
    input: { tagName: string; title: string; notes: string; prerelease: boolean },
  ): Promise<ReleaseSummary> {
    const { data } = await this.client.send<ApiRelease>(
      "POST",
      `/repos/${owner}/${name}/releases`,
      {
        tag_name: input.tagName,
        name: input.title,
        body: input.notes,
        prerelease: input.prerelease,
        draft: false,
      },
    );
    return mapRelease(data);
  }

  async listKeys(): Promise<SshKey[]> {
    const { data } = await this.client.json<ApiPublicKey[]>("/user/keys");
    return data.map(mapSshKey);
  }

  async addKey(title: string, key: string): Promise<SshKey> {
    const { data } = await this.client.send<ApiPublicKey>("POST", "/user/keys", {
      title,
      key,
      read_only: false,
    });
    return mapSshKey(data);
  }

  async deleteKey(id: number): Promise<void> {
    await this.client.empty("DELETE", `/user/keys/${id}`);
  }

  async listTokens(): Promise<AccessTokenInfo[]> {
    return getTokenBroker().list(this.username);
  }

  async createToken(name: string, scopes: string[]): Promise<CreatedAccessToken> {
    return getTokenBroker().create(this.username, name, scopes);
  }

  async deleteToken(name: string): Promise<void> {
    return getTokenBroker().revoke(this.username, name);
  }

  async listActivity(limit: number): Promise<ActivityEvent[]> {
    const capped = clampLimit(limit);
    const key = `activity:${this.username}:${capped}`;
    return cached(key, LIST_CACHE_TTL_MS, async () => {
      const { data } = await this.client.json<ApiActivity[]>(
        `/users/${encodeURIComponent(this.username)}/activities/feeds`,
        { query: { limit: capped, "only-performed-by": true } },
      );
      return data.map(mapActivity);
    });
  }

  cloneUrls(owner: string, name: string): { httpsUrl: string; sshUrl: string } {
    return cloneUrls(owner, name);
  }
}
