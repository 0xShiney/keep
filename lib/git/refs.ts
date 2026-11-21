/**
 * Central validators for repository identifiers and git refs.
 *
 * Every ref that reaches Forgejo must pass through here first. Rules follow
 * git-check-ref-format(1) and additionally reject option-like refs (leading
 * "-"), which would be dangerous if ever passed to a CLI.
 */

export const REPO_NAME_PATTERN = /^[A-Za-z0-9._-]{1,100}$/;
export const OWNER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/;

const MAX_REF_LENGTH = 255;

export class InvalidRefError extends Error {
  readonly code = "invalid_ref";
  constructor(message: string) {
    super(message);
    this.name = "InvalidRefError";
  }
}

export function isValidOwner(owner: string): boolean {
  return OWNER_PATTERN.test(owner) && !owner.includes("..") && !owner.endsWith(".");
}

export function isValidRepoName(name: string): boolean {
  if (!REPO_NAME_PATTERN.test(name)) return false;
  if (name === "." || name === "..") return false;
  if (name.endsWith(".git") && name.length <= 4) return false;
  if (name.endsWith(".lock")) return false;
  return true;
}

/**
 * Validates a branch, tag, or ref. Accepts short names ("main"), full refs
 * ("refs/heads/main"), and commit SHAs (full or abbreviated).
 */
export function assertValidRef(ref: string): string {
  if (typeof ref !== "string" || ref.length === 0) {
    throw new InvalidRefError("Ref must be a non-empty string");
  }
  if (ref.length > MAX_REF_LENGTH) {
    throw new InvalidRefError("Ref is too long");
  }
  if (ref.startsWith("-")) {
    throw new InvalidRefError("Ref must not start with '-'");
  }
  if (/[\u0000-\u001f\u007f]/.test(ref)) {
    throw new InvalidRefError("Ref must not contain control characters");
  }
  if (/[\s~^:?*[\]\\]/.test(ref)) {
    throw new InvalidRefError("Ref contains a character that git forbids");
  }
  if (ref.includes("..") || ref.includes("@{") || ref.includes("//")) {
    throw new InvalidRefError("Ref contains a forbidden sequence");
  }
  if (ref.startsWith("/") || ref.endsWith("/") || ref.endsWith(".")) {
    throw new InvalidRefError("Ref must not start or end with '/' or end with '.'");
  }
  if (ref.endsWith(".lock")) {
    throw new InvalidRefError("Ref must not end with '.lock'");
  }
  for (const segment of ref.split("/")) {
    if (segment.length === 0 || segment === "." || segment === "..") {
      throw new InvalidRefError("Ref contains an invalid path segment");
    }
    if (segment.startsWith(".")) {
      throw new InvalidRefError("Ref segments must not start with '.'");
    }
  }
  return ref;
}

export function isValidRef(ref: string): boolean {
  try {
    assertValidRef(ref);
    return true;
  } catch {
    return false;
  }
}

/**
 * A commit-ish used for URLs: SHA (7-64 hex), branch, tag, or "refs/..." name.
 * Branch names containing slashes are allowed; only the ref rules apply.
 */
export function assertValidRevision(revision: string): string {
  if (/^[0-9a-f]{7,64}$/i.test(revision)) return revision;
  return assertValidRef(revision);
}

export function isCommitSha(value: string): boolean {
  return /^[0-9a-f]{40}$/i.test(value);
}

/** Detects the risky refspec forms we never accept from a client. */
export function isForbiddenRefspec(value: string): boolean {
  return (
    value.startsWith("-") ||
    value.includes("\u0000") ||
    value.includes("\\") ||
    value.includes("..")
  );
}
