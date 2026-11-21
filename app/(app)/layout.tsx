import type { ReactNode } from "react";
import { AppShell } from "@/components/app-shell";
import { isFixtureMode } from "@/lib/forgejo";
import { pageContext } from "@/server/context";
import { childLogger } from "@/lib/logger";

const log = childLogger({ module: "app-shell" });

export default async function AuthenticatedLayout({ children }: { children: ReactNode }) {
  const { identity, gateway } = await pageContext();

  const [user, repos] = await Promise.all([
    gateway.getUser().catch((error: unknown) => {
      log.warn({ err: (error as Error).message }, "could not load viewer profile");
      return null;
    }),
    gateway.listRepos({ limit: 50 }).catch((error: unknown) => {
      log.warn({ err: (error as Error).message }, "could not load repositories for the palette");
      return null;
    }),
  ]);

  const paletteRepos = (repos?.items ?? []).map((repo) => ({
    fullName: repo.fullName,
    name: repo.name,
    description: repo.description,
  }));

  return (
    <AppShell
      login={user?.login ?? identity.username}
      avatarUrl={user?.avatarUrl ?? null}
      repos={paletteRepos}
      demo={isFixtureMode()}
    >
      {children}
    </AppShell>
  );
}
