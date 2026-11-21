import { z } from "zod";
import { REPO_NAME_PATTERN, OWNER_PATTERN } from "@/lib/git/refs";
import { normalizeRepoPath } from "@/lib/git/path";

/** Shared input validation. Every route handler parses its body/query with one of these. */

export const ownerSchema = z.string().min(1).max(100).regex(OWNER_PATTERN, "Invalid owner name");

export const repoNameSchema = z
  .string()
  .min(1)
  .max(100)
  .regex(REPO_NAME_PATTERN, "Use 1-100 letters, digits, dots, dashes or underscores");

export const refSchema = z
  .string()
  .min(1)
  .max(255)
  .refine((value) => !value.startsWith("-"), "Ref must not start with '-'")
  .refine((value) => !/[\u0000-\u001f\u007f]/.test(value), "Ref contains control characters")
  .refine((value) => !/[\s~^:?*[\]\\]/.test(value), "Ref contains a forbidden character")
  .refine(
    (value) => !value.includes("..") && !value.includes("@{"),
    "Ref contains a forbidden sequence",
  )
  .refine(
    (value) => !value.endsWith(".lock") && !value.endsWith("/") && !value.endsWith("."),
    "Ref has a forbidden suffix",
  );

export const pathSchema = z
  .string()
  .max(1024)
  .transform((value, ctx) => {
    try {
      return normalizeRepoPath(value);
    } catch (error) {
      ctx.addIssue({
        code: "custom",
        message: error instanceof Error ? error.message : "Invalid path",
      });
      return z.NEVER;
    }
  });

const gitignoreSchema = z.enum(["", "Node", "Python", "Go", "Rust", "Java"]).optional();
const licenseSchema = z.enum(["", "MIT", "Apache-2.0", "BSD-3-Clause", "MPL-2.0"]).optional();

export const createRepoSchema = z.object({
  name: repoNameSchema,
  description: z.string().max(500).default(""),
  private: z.boolean().default(true),
  autoInit: z.boolean().default(true),
  gitignore: gitignoreSchema,
  license: licenseSchema,
  readme: z.boolean().default(true),
});

export const updateRepoSchema = z
  .object({
    name: repoNameSchema.optional(),
    description: z.string().max(500).optional(),
    private: z.boolean().optional(),
    defaultBranch: refSchema.optional(),
    archived: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, "Nothing to update");

export const deleteRepoSchema = z.object({
  confirm: z.string().min(1).max(200),
});

export const createBranchSchema = z.object({
  name: refSchema,
  from: refSchema,
});

export const createTagSchema = z.object({
  tag: refSchema,
  target: refSchema,
  message: z.string().max(2000).optional(),
});

export const createIssueSchema = z.object({
  title: z.string().trim().min(1, "A title is required").max(255),
  body: z.string().max(65_536).default(""),
  labels: z.array(z.number().int().positive()).max(20).optional(),
});

export const updateIssueSchema = z
  .object({
    state: z.enum(["open", "closed"]).optional(),
    title: z.string().trim().min(1).max(255).optional(),
    body: z.string().max(65_536).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, "Nothing to update");

export const commentSchema = z.object({
  body: z.string().trim().min(1, "A comment cannot be empty").max(65_536),
});

export const createPullSchema = z.object({
  title: z.string().trim().min(1).max(255),
  body: z.string().max(65_536).default(""),
  head: refSchema,
  base: refSchema,
});

export const reviewCommentSchema = z
  .object({
    path: pathSchema,
    body: z.string().trim().min(1).max(8192),
    /** Target line in the new file; converted server-side to a diff position. */
    line: z.number().int().min(1).max(1_000_000).optional(),
    new_position: z.number().int().min(0).max(100_000).optional(),
    old_position: z.number().int().min(0).max(100_000).optional(),
  })
  .refine(
    (value) =>
      value.line !== undefined ||
      value.new_position !== undefined ||
      value.old_position !== undefined,
    "An inline comment needs a line or a diff position",
  );

export const createReviewSchema = z.object({
  event: z.enum(["APPROVED", "REQUEST_CHANGES", "COMMENT"]),
  body: z.string().max(65_536).default(""),
  comments: z.array(reviewCommentSchema).max(50).optional(),
});

export const mergePullSchema = z.object({
  style: z.enum(["merge", "squash", "rebase", "fast-forward-only"]),
  message: z.string().max(2000).optional(),
});

export const createReleaseSchema = z.object({
  tagName: refSchema,
  title: z.string().trim().max(255).default(""),
  notes: z.string().max(65_536).default(""),
  prerelease: z.boolean().default(false),
});

export const addKeySchema = z.object({
  title: z.string().trim().min(1, "A title is required").max(120),
  key: z.string().trim().min(20).max(8192),
});

export const tokenScopeSchema = z.enum([
  "read:repository",
  "write:repository",
  "read:user",
  "write:user",
  "read:issue",
  "write:issue",
  "read:organization",
  "write:organization",
  "read:notification",
  "write:notification",
]);

export const createTokenSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .regex(/^[A-Za-z0-9._-]+$/, "Use letters, digits, dots, dashes or underscores"),
  // Least privilege by default; `all` is deliberately not an accepted scope here.
  scopes: z.array(tokenScopeSchema).min(1).max(10).default(["read:repository"]),
});

export const prefsSchema = z.object({
  theme: z.enum(["dark", "light"]).optional(),
  density: z.enum(["compact", "comfortable"]).optional(),
  diffMode: z.enum(["unified", "split"]).optional(),
});

export const searchSchema = z.object({
  q: z.string().trim().max(200).default(""),
  page: z.coerce.number().int().min(1).max(1000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});

export type CreateRepoInputSchema = z.infer<typeof createRepoSchema>;
export type UpdateRepoInputSchema = z.infer<typeof updateRepoSchema>;
