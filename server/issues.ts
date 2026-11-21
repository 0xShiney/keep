import type { ForgejoGateway } from "@/lib/forgejo/gateway";
import type { IssueDetail, IssueState, IssueSummary, Paginated } from "@/lib/forgejo/model";

export async function listIssues(
  gateway: ForgejoGateway,
  owner: string,
  name: string,
  filters: { state: IssueState; label?: string; query?: string; page: number; limit?: number },
): Promise<Paginated<IssueSummary>> {
  return gateway.listIssues(owner, name, {
    state: filters.state,
    labels: filters.label,
    query: filters.query,
    page: filters.page,
    limit: Math.min(filters.limit ?? 25, 50),
  });
}

export async function loadIssue(
  gateway: ForgejoGateway,
  owner: string,
  name: string,
  number: number,
): Promise<IssueDetail> {
  return gateway.getIssue(owner, name, number);
}

export function issueStateLabel(state: "open" | "closed"): string {
  return state === "open" ? "Open" : "Closed";
}

export function labelColorStyle(color: string): { backgroundColor: string; color: string } {
  const normalized = color.replace(/^#/, "");
  const safe = /^[0-9a-fA-F]{6}$/.test(normalized) ? normalized : "888888";
  const r = parseInt(safe.slice(0, 2), 16);
  const g = parseInt(safe.slice(2, 4), 16);
  const b = parseInt(safe.slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return {
    backgroundColor: `#${safe}22`,
    color: luminance > 0.6 ? "#1f2328" : `#${safe}`,
  };
}
