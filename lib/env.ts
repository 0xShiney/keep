import { z } from "zod";

const DEV_SESSION_SECRET = "dev-only-insecure-session-secret-change-me-32+chars";

const booleanish = z
  .string()
  .optional()
  .transform((v) => v === "1" || v === "true");

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

  /** Public origin of the Next.js app, e.g. https://app.example.com */
  APP_ORIGIN: z.string().url().default("http://localhost:3000"),

  /** Where the Next.js server reaches Forgejo (docker service name). */
  FORGEJO_INTERNAL_URL: z.string().url().default("http://forgejo:3000"),
  /** Where the *browser* reaches Forgejo for the OAuth authorize redirect. */
  FORGEJO_PUBLIC_URL: z.string().url().default("http://localhost:3001"),

  FORGEJO_CLIENT_ID: z.string().default(""),
  FORGEJO_CLIENT_SECRET: z.string().default(""),
  /** Server-held admin token used only for PAT issuance via the Sudo header. */
  FORGEJO_ADMIN_TOKEN: z.string().default(""),

  SESSION_SECRET: z.string().min(32).default(DEV_SESSION_SECRET),
  DATABASE_URL: z.string().default(""),

  /** `forgejo` talks to the real engine; `fixture` serves an in-memory demo. */
  KEEP_BACKEND: z.enum(["forgejo", "fixture"]).default("forgejo"),
  /** Explicit acknowledgement required to run fixture mode outside tests. */
  KEEP_FIXTURE_ACK: booleanish,

  KEEP_OWNER_LOGIN: z.string().default(""),

  /** Clone URLs shown to users. */
  GIT_PUBLIC_URL: z.string().default("https://git.example.com"),
  SSH_HOST: z.string().default("git.example.com"),
  SSH_PORT: z.coerce.number().int().positive().default(2222),

  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),

  SESSION_IDLE_MINUTES: z.coerce.number().int().positive().default(120),
  SESSION_ABSOLUTE_HOURS: z.coerce.number().int().positive().default(720),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | null = null;

/**
 * Reads and validates environment variables. Deliberately lazy: Next.js
 * evaluates modules during `next build` without runtime secrets present.
 */
export function getEnv(): Env {
  if (cached) return cached;

  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const detail = parsed.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
    throw new Error(`Invalid environment configuration: ${detail}`);
  }

  const env = parsed.data;

  if (env.KEEP_BACKEND === "fixture" && env.NODE_ENV === "production" && !env.KEEP_FIXTURE_ACK) {
    throw new Error(
      "KEEP_BACKEND=fixture is refused in production unless KEEP_FIXTURE_ACK=1 is set. " +
        "Fixture mode serves invented data and must never be mistaken for a real forge.",
    );
  }

  if (env.NODE_ENV === "production" && env.KEEP_BACKEND === "forgejo") {
    const missing: string[] = [];
    if (!env.FORGEJO_CLIENT_ID) missing.push("FORGEJO_CLIENT_ID");
    if (!env.DATABASE_URL) missing.push("DATABASE_URL");
    if (env.SESSION_SECRET === DEV_SESSION_SECRET) missing.push("SESSION_SECRET");
    if (missing.length > 0) {
      throw new Error(`Missing required production configuration: ${missing.join(", ")}`);
    }
  }

  cached = env;
  return env;
}

/** Test helper — never call from application code. */
export function resetEnvCache(): void {
  cached = null;
}

export function isFixtureBackend(): boolean {
  return getEnv().KEEP_BACKEND === "fixture";
}

export function cloneUrls(owner: string, name: string) {
  const env = getEnv();
  const base = env.GIT_PUBLIC_URL.replace(/\/+$/, "");
  const httpsUrl = `${base}/${owner}/${name}.git`;
  const sshUrl = `ssh://git@${env.SSH_HOST}:${env.SSH_PORT}/${owner}/${name}.git`;
  return { httpsUrl, sshUrl };
}
