import { describe, expect, it } from "vitest";
import {
  mapBranch,
  mapCommit,
  mapFileBlob,
  mapIssue,
  mapPull,
  mapRelease,
  mapRepo,
  mapSshKey,
  mapTag,
  mapTreeEntry,
  mapUser,
  looksBinary,
  type ApiBranch,
  type ApiCommit,
  type ApiContents,
  type ApiIssue,
  type ApiPull,
  type ApiRelease,
  type ApiRepository,
  type ApiTag,
  type ApiUser,
  type ApiPublicKey,
} from "@/lib/forgejo/mappers";

/**
 * Contract fixtures: payloads shaped like Forgejo 15 answers. If a mapper starts
 * reading a renamed field, these fail instead of the UI silently degrading.
 */

const apiRepo = {
  id: 1,
  name: "keep",
  full_name: "ada/keep",
  description: "A forge",
  private: true,
  default_branch: "main",
  empty: false,
  archived: false,
  fork: false,
  language: "TypeScript",
  topics: ["git"],
  stars_count: 3,
  forks_count: 1,
  watchers_count: 2,
  open_issues_count: 4,
  open_pr_counter: 2,
  size: 1024,
  website: "",
  updated_at: "2026-11-20T10:00:00Z",
  created_at: "2026-11-01T10:00:00Z",
  html_url: "https://git.example.com/ada/keep",
  owner: { login: "ada", full_name: "Ada Lovelace", avatar_url: null },
  permissions: { admin: true, push: true, pull: true },
} as unknown as ApiRepository;

describe("mapRepo", () => {
  it("maps fields and permissions", () => {
    const repo = mapRepo(apiRepo);
    expect(repo.fullName).toBe("ada/keep");
    expect(repo.owner).toBe("ada");
    expect(repo.private).toBe(true);
    expect(repo.defaultBranch).toBe("main");
    expect(repo.stars).toBe(3);
    expect(repo.openPulls).toBe(2);
    expect(repo.permissions.admin).toBe(true);
    expect(repo.website).toBeNull();
    expect(repo.cloneUrlHttps).toMatch(/\/ada\/keep\.git$/);
    expect(repo.cloneUrlSsh).toMatch(/^ssh:\/\/git@/);
  });

  it("survives missing optional fields", () => {
    const repo = mapRepo({
      id: 2,
      name: "bare",
      full_name: "ada/bare",
    } as unknown as ApiRepository);
    expect(repo.description).toBeNull();
    expect(repo.permissions.pull).toBe(true);
    expect(repo.topics).toEqual([]);
  });
});

describe("mapCommit", () => {
  it("maps message, parents and verification", () => {
    const commit = mapCommit({
      sha: "a".repeat(40),
      created: "2026-11-20T10:00:00Z",
      commit: {
        message: "feat: thing\n\nbody",
        author: { name: "Ada", email: "ada@example.com", date: "2026-11-20T10:00:00Z" },
        committer: { name: "Ada", email: "ada@example.com", date: "2026-11-20T10:00:00Z" },
        verification: { verified: true, reason: "valid" },
      },
      parents: [{ sha: "b".repeat(40) }],
      author: { login: "ada", avatar_url: null },
      stats: { additions: 3, deletions: 1, total: 4 },
      files: [],
    } as unknown as ApiCommit);

    expect(commit.summaryLine).toBe("feat: thing");
    expect(commit.shortSha).toHaveLength(7);
    expect(commit.parents).toEqual(["b".repeat(40)]);
    expect(commit.verification?.verified).toBe(true);
    expect(commit.author.login).toBe("ada");
  });
});

describe("mapContents and binary detection", () => {
  it("classifies a directory entry", () => {
    const entry = mapTreeEntry({
      name: "src",
      path: "src",
      type: "dir",
      sha: "abc",
      last_commit_sha: "def",
      last_commit_when: "2026-11-20T10:00:00Z",
    } as unknown as ApiContents);
    expect(entry.type).toBe("dir");
    expect(entry.lastCommitSha).toBe("def");
  });

  it("detects NUL bytes as binary", () => {
    expect(looksBinary(Buffer.from("plain text"))).toBe(false);
    expect(looksBinary(Buffer.from([0x89, 0x50, 0x00, 0x47]))).toBe(true);
  });

  it("nulls base64 for binary blobs", () => {
    const blob = mapFileBlob(
      {
        name: "logo.png",
        path: "logo.png",
        sha: "s",
        size: 4,
        encoding: "base64",
        content: "AAAA",
      } as unknown as ApiContents,
      Buffer.from([0x00, 0x01]),
    );
    expect(blob.isBinary).toBe(true);
    expect(blob.contentBase64).toBeNull();
  });
});

describe("other mappers", () => {
  it("maps branches with default flag", () => {
    const branch = mapBranch(
      {
        name: "main",
        protected: true,
        commit: {
          id: "c".repeat(40),
          message: "initial",
          timestamp: "2026-11-20T10:00:00Z",
          author: { name: "Ada" },
        },
      } as unknown as ApiBranch,
      "main",
    );
    expect(branch.isDefault).toBe(true);
    expect(branch.protected).toBe(true);
    expect(branch.sha).toHaveLength(40);
  });

  it("maps tags including archive download counts", () => {
    const tag = mapTag({
      name: "v1.0.0",
      message: "release",
      commit: { sha: "d".repeat(40), created: "2026-11-20T10:00:00Z" },
      archive_download_count: 5,
    } as unknown as ApiTag);
    expect(tag.downloadCount).toBe(5);
    const missing = mapTag({ name: "v2" } as unknown as ApiTag);
    expect(missing.downloadCount).toBe(0);
  });

  it("maps issues and detects pull requests", () => {
    const issue = mapIssue({
      id: 1,
      number: 7,
      title: "Bug",
      body: "text",
      state: "open",
      user: { login: "ada" },
      labels: [{ id: 1, name: "bug", color: "ff0000" }],
      comments: 2,
      created_at: "2026-11-20T10:00:00Z",
      updated_at: "2026-11-20T11:00:00Z",
      pull_request: { merged: false },
    } as unknown as ApiIssue);
    expect(issue.number).toBe(7);
    expect(issue.isPull).toBe(true);
    expect(issue.labels[0]!.name).toBe("bug");
  });

  it("maps pulls with branch info", () => {
    const pull = mapPull({
      id: 1,
      number: 2,
      title: "PR",
      body: "",
      state: "open",
      merged: false,
      mergeable: true,
      user: { login: "ada" },
      head: { ref: "feature", sha: "e".repeat(40) },
      base: { ref: "main", sha: "f".repeat(40) },
      additions: 10,
      deletions: 2,
      changed_files: 3,
      created_at: "2026-11-20T10:00:00Z",
      updated_at: "2026-11-20T10:00:00Z",
    } as unknown as ApiPull);
    expect(pull.headRef).toBe("feature");
    expect(pull.baseRef).toBe("main");
    expect(pull.mergeable).toBe(true);
  });

  it("maps releases and assets", () => {
    const release = mapRelease({
      id: 1,
      tag_name: "v1",
      name: "One",
      body: "notes",
      draft: false,
      prerelease: true,
      created_at: "2026-11-20T10:00:00Z",
      published_at: "2026-11-20T10:00:00Z",
      author: { login: "ada" },
      assets: [
        {
          id: 5,
          name: "app.tar.gz",
          size: 100,
          download_count: 2,
          created_at: "2026-11-20T10:00:00Z",
          browser_download_url: "https://x/y",
        },
      ],
    } as unknown as ApiRelease);
    expect(release.tagName).toBe("v1");
    expect(release.assets[0]!.name).toBe("app.tar.gz");
  });

  it("maps users and ssh keys", () => {
    expect(mapUser({ id: 1, login: "ada", is_admin: true } as unknown as ApiUser).isAdmin).toBe(
      true,
    );
    const key = mapSshKey({
      id: 3,
      title: "laptop",
      fingerprint: "SHA256:abc",
    } as unknown as ApiPublicKey);
    expect(key.fingerprint).toBe("SHA256:abc");
  });
});
