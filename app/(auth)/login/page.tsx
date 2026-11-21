import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, Lock, ShieldCheck } from "lucide-react";
import { getIdentity } from "@/lib/auth/session";
import { safeNextPath } from "@/lib/auth/oauth";
import { isFixtureMode } from "@/lib/forgejo";
import { Button, ButtonLink } from "@/components/ui/button";
import { InlineNotice } from "@/components/ui/feedback";

export const metadata: Metadata = { title: "Sign in" };

const ERROR_MESSAGES: Record<string, string> = {
  state: "That sign-in attempt expired or could not be verified. Try again.",
  exchange: "The identity provider rejected the sign-in. Try again.",
  session: "Your session could not be created. Try again.",
  ratelimited: "Too many sign-in attempts. Wait a minute and try again.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const params = await searchParams;
  const next = safeNextPath(params.next);
  const identity = await getIdentity();
  if (identity) redirect(next);

  const demo = isFixtureMode();
  const error = params.error
    ? (ERROR_MESSAGES[params.error] ?? "Sign-in failed. Try again.")
    : null;

  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center gap-2.5">
          <span
            aria-hidden="true"
            className="border-accent/40 bg-accent-subtle text-accent flex size-8 items-center justify-center rounded-md border text-sm font-bold"
          >
            K
          </span>
          <div>
            <p className="text-md font-semibold tracking-tight">Keep</p>
            <p className="text-2xs text-fg-subtle">Private code forge</p>
          </div>
        </div>

        <div className="border-border bg-surface-1 rounded-lg border p-5">
          <h1 className="text-md text-fg font-semibold">Sign in</h1>
          <p className="text-fg-muted mt-1 text-xs">
            Keep uses this instance&apos;s Forgejo as its identity provider. Your password is never
            seen by this application.
          </p>

          {error ? (
            <div className="mt-3">
              <InlineNotice tone="danger">{error}</InlineNotice>
            </div>
          ) : null}

          <div className="mt-4 flex flex-col gap-2">
            {demo ? (
              <form action="/api/auth/demo" method="post">
                <Button type="submit" variant="primary" size="lg" className="w-full">
                  Continue to the demo
                  <ArrowRight aria-hidden="true" />
                </Button>
              </form>
            ) : (
              <ButtonLink
                href={`/api/auth/login?next=${encodeURIComponent(next)}`}
                variant="primary"
                size="lg"
                className="w-full"
              >
                Continue to Forgejo
                <ArrowRight aria-hidden="true" />
              </ButtonLink>
            )}

            <p className="text-2xs text-fg-subtle mt-1 flex items-start gap-1.5">
              <Lock aria-hidden="true" className="mt-0.5 size-3 shrink-0" />
              Sessions are server-side, HttpOnly and encrypted at rest. Registration is disabled:
              this instance has exactly one owner.
            </p>
          </div>
        </div>

        <div className="border-border bg-surface-1 text-2xs text-fg-subtle mt-4 flex items-start gap-2 rounded-md border px-3 py-2.5">
          <ShieldCheck aria-hidden="true" className="text-fg-muted mt-0.5 size-3.5 shrink-0" />
          <p>
            First run? The owner account is created by{" "}
            <code className="font-mono">deploy/forgejo/bootstrap.sh</code>. See{" "}
            <Link href="/healthz" className="text-fg-muted underline underline-offset-2">
              health
            </Link>{" "}
            for service status.
          </p>
        </div>
      </div>
    </main>
  );
}
