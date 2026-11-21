import Link from "next/link";
import type { ReactNode } from "react";
import { CommandPalette, type PaletteRepo } from "@/components/command-palette";
import { KeyboardShortcuts } from "@/components/keyboard-shortcuts";
import { ThemeToggle } from "@/components/theme-toggle";
import { UserMenu } from "@/components/user-menu";
import { ButtonLink } from "@/components/ui/button";

export function AppShell({
  children,
  login,
  avatarUrl,
  repos,
  demo,
}: {
  children: ReactNode;
  login: string;
  avatarUrl: string | null;
  repos: PaletteRepo[];
  demo: boolean;
}) {
  return (
    <div className="bg-bg flex min-h-dvh flex-col">
      <a
        href="#main"
        className="focus:bg-surface-3 sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-50 focus:rounded-sm focus:px-3 focus:py-1.5 focus:text-sm"
      >
        Skip to content
      </a>

      <header className="border-border bg-bg/90 sticky top-0 z-40 border-b backdrop-blur">
        <div className="mx-auto flex h-12 w-full max-w-[1440px] items-center gap-3 px-4">
          <Link href="/" className="flex items-center gap-2 text-sm font-semibold tracking-tight">
            <span
              aria-hidden="true"
              className="border-accent/40 bg-accent-subtle text-accent flex size-6 items-center justify-center rounded-sm border text-xs font-bold"
            >
              K
            </span>
            <span className="hidden sm:inline">Keep</span>
          </Link>

          <div className="flex flex-1 items-center gap-2">
            <CommandPalette repos={repos} />
          </div>

          <nav aria-label="Account" className="flex items-center gap-1">
            <ButtonLink href="/new" variant="ghost" size="sm" className="hidden sm:inline-flex">
              New
            </ButtonLink>
            <ThemeToggle />
            <UserMenu login={login} avatarUrl={avatarUrl} />
          </nav>
        </div>
      </header>

      {demo ? (
        <div className="border-warning/30 bg-warning-subtle text-2xs text-warning border-b px-4 py-1.5 text-center">
          Demo data: KEEP_BACKEND=fixture is active. Nothing here is a real repository.
        </div>
      ) : null}

      <main id="main" className="mx-auto w-full max-w-[1440px] flex-1 px-4 py-4">
        {children}
      </main>

      <footer className="border-border border-t px-4 py-3">
        <div className="text-2xs text-fg-subtle mx-auto flex w-full max-w-[1440px] flex-wrap items-center justify-between gap-2">
          <span>Keep — private forge for one owner. Git engine: Forgejo.</span>
          <span className="flex items-center gap-2">
            <Link href="/settings" className="hover:text-fg-muted">
              Settings
            </Link>
            <span aria-hidden="true">·</span>
            <Link href="/healthz" className="hover:text-fg-muted">
              Health
            </Link>
          </span>
        </div>
      </footer>

      <KeyboardShortcuts />
    </div>
  );
}
