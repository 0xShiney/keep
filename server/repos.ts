import { and, desc, eq, sql } from "drizzle-orm";
import { recentRepo } from "@/db/schema";
import { getDb, isDatabaseConfigured } from "@/lib/db";
import type { ForgejoGateway } from "@/lib/forgejo/gateway";
import type { Paginated, RepoSearchFilters, RepoSummary } from "@/lib/forgejo/model";
import { childLogger } from "@/lib/logger";

const log = childLogger({ module: "repos" });

export async function listRepos(
  gateway: ForgejoGateway,
  filters: RepoSearchFilters,
): Promise<Paginated<RepoSummary>> {
  return gateway.listRepos({ ...filters, limit: Math.min(filters.limit ?? 30, 50) });
}

export interface RecentRepo {
  fullName: string;
  lastAccessedAt: string;
}

export async function listRecentRepos(userId: number, limit = 5): Promise<RecentRepo[]> {
  if (!isDatabaseConfigured()) return [];
  try {
    const rows = await getDb()
      .select({ fullName: recentRepo.fullName, lastAccessedAt: recentRepo.lastAccessedAt })
      .from(recentRepo)
      .where(eq(recentRepo.userId, userId))
      .orderBy(desc(recentRepo.lastAccessedAt))
      .limit(limit);
    return rows.map((row) => ({
      fullName: row.fullName,
      lastAccessedAt: row.lastAccessedAt.toISOString(),
    }));
  } catch (error) {
    log.warn({ err: (error as Error).message }, "recent repos unavailable");
    return [];
  }
}

/**
 * Records a repository visit. Best-effort: a failure here must never break a
 * page render, because it is only a convenience for the dashboard.
 */
export async function recordRepoAccess(userId: number, fullName: string): Promise<void> {
  if (!isDatabaseConfigured()) return;
  try {
    await getDb()
      .insert(recentRepo)
      .values({ userId, fullName })
      .onConflictDoUpdate({
        target: [recentRepo.userId, recentRepo.fullName],
        set: { lastAccessedAt: sql`now()` },
      });
  } catch (error) {
    log.warn({ err: (error as Error).message }, "could not record recent repo");
  }
}

export async function resolveRecentRepos(
  gateway: ForgejoGateway,
  userId: number,
  limit = 5,
): Promise<RepoSummary[]> {
  const recent = await listRecentRepos(userId, limit);
  const repos = await Promise.all(
    recent.map(async (entry) => {
      const [owner, name] = entry.fullName.split("/");
      if (!owner || !name) return null;
      try {
        return await gateway.getRepo(owner, name);
      } catch {
        return null;
      }
    }),
  );
  return repos.filter((repo): repo is RepoSummary => repo !== null);
}

export async function countReposForUser(gateway: ForgejoGateway): Promise<number> {
  const page = await gateway.listRepos({ page: 1, limit: 1 });
  return page.total;
}

/** Ensures a repo already tracked in recent_repo is removed when it disappears. */
export async function forgetRecentRepo(userId: number, fullName: string): Promise<void> {
  if (!isDatabaseConfigured()) return;
  await getDb()
    .delete(recentRepo)
    .where(and(eq(recentRepo.userId, userId), eq(recentRepo.fullName, fullName)));
}
