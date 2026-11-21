import { ForgejoClient } from "./client";
import {
  mapAccessToken,
  mapActivity,
  mapBranch,
  mapChangedFile,
  mapCommit,
  mapCommitDetail,
  mapFileBlob,
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
  mapTreeEntry,
  mapUser,
  type ApiAccessToken,
  type ApiActivity,
  type ApiBranch,
  type ApiChangedFile,
  type ApiCommit,
  type ApiContents,
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
import { cloneUrls, getEnv } from "@/lib/env";
import { childLogger } from "@/lib/logger";

const log = childLogger({ module: "forgejo-gateway" });

/** Forgejo caps `limit` at 50 server-wide; keep requests inside that. */
export const FORGEJO_MAX_LIMIT = 50;

/** Refuse to hand more than this many bytes of diff to the parser/UI. */
export const MAX_DIFF_BYTES = 2 * 1024 * 1024;

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

function isContentsArray(value: unknown): value is ApiContents[] {
  return Array.isArray(value);
}

interface ComparePayload {
  commits?: ApiCommit[];
  files?: ApiChangedFile[];
  ahead_by?: number;
  behind_by?: number;
}

export class HttpForgejoGateway implements ForgejoGateway {
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
    const { data, headers } = await this.client.json<{ data?: ApiRepository[] }>("/repos/search", {
      query: {
        q: filters.query,
        page,
        limit,
        sort: filters.sort,
        order: filters.order,
        topic: false,
      },
    });
    const raw = data.data ?? [];
    const items = raw.map((repo) => mapRepo(repo));
    return {
      items,
      total: totalFrom(headers, items.length),
      hasMore: raw.length === limit,
    };
  }

  async getRepo(owner: string, name: string): Promise<RepoSummary> {
    const { data } = await this.client.json<ApiRepository>(`/repos/${owner}/${name}`);
    return mapRepo(data);
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

  async listTree(
    owner: string,
    name: string,
    ref: string,
    path: string,
  ): Promise<{ entries: TreeEntry[]; readme: FileBlob | null }> {
    const suffix = path ? `/${path.split("/").map(encodeURIComponent).join("/")}` : "";
    const { data } = await this.client.json<ApiContents[] | ApiContents>(
      `/repos/${owner}/${name}/contents${suffix}`,
      { query: { ref } },
    );

    const entries = (isContentsArray(data) ? data : [data]).map(mapTreeEntry).sort((a, b) => {
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
      timeline: timeline.data.map(mapTimelineComment),
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
    const { data } = await this.client.json<ApiAccessToken[]>(
      `/users/${encodeURIComponent(this.username)}/tokens`,
      { sudo: this.login },
    );
    return data.map(mapAccessToken);
  }

  async createToken(name: string, scopes: string[]): Promise<CreatedAccessToken> {
    const env = getEnv();
    if (!env.FORGEJO_ADMIN_TOKEN) {
      throw new Error(
        "FORGEJO_ADMIN_TOKEN is not configured. Forgejo only issues personal access tokens to " +
          "basic-authenticated users, so Keep needs an admin token to act on the owner's behalf.",
      );
    }
    const admin = new ForgejoClient({
      baseUrl: env.FORGEJO_INTERNAL_URL,
      token: env.FORGEJO_ADMIN_TOKEN,
    });
    const { data } = await admin.send<ApiAccessToken>(
      "POST",
      `/users/${encodeURIComponent(this.username)}/tokens`,
      { name, scopes },
      { sudoHeader: this.login },
    );
    return { id: data.id ?? 0, name: data.name ?? name, token: data.sha1 ?? "", scopes };
  }

  async deleteToken(name: string): Promise<void> {
    const env = getEnv();
    if (!env.FORGEJO_ADMIN_TOKEN) {
      throw new Error("FORGEJO_ADMIN_TOKEN is required to revoke personal access tokens");
    }
    const admin = new ForgejoClient({
      baseUrl: env.FORGEJO_INTERNAL_URL,
      token: env.FORGEJO_ADMIN_TOKEN,
    });
    await admin.empty(
      "DELETE",
      `/users/${encodeURIComponent(this.username)}/tokens/${encodeURIComponent(name)}`,
      undefined,
      { sudoHeader: this.login },
    );
  }

  async listActivity(limit: number): Promise<ActivityEvent[]> {
    const { data } = await this.client.json<ApiActivity[]>(
      `/users/${encodeURIComponent(this.username)}/activities/feeds`,
      { query: { limit: clampLimit(limit), "only-performed-by": true } },
    );
    return data.map(mapActivity);
  }

  cloneUrls(owner: string, name: string): { httpsUrl: string; sshUrl: string } {
    return cloneUrls(owner, name);
  }
}
