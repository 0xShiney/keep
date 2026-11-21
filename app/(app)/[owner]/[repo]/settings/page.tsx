import type { Metadata } from "next";
import { ShieldAlert } from "lucide-react";
import { RepoSettingsForm } from "@/components/forms/repo-settings-form";
import { RepoHeader } from "@/components/repo-header";
import { InlineNotice } from "@/components/ui/feedback";
import { loadRepoForPage, pageContext } from "@/server/context";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ owner: string; repo: string }>;
}): Promise<Metadata> {
  const { owner, repo } = await params;
  return { title: `${owner}/${repo} · settings` };
}

export default async function RepoSettingsPage({
  params,
}: {
  params: Promise<{ owner: string; repo: string }>;
}) {
  const { owner, repo: repoName } = await params;
  const { viewer, gateway } = await pageContext(`/${owner}/${repoName}/settings`);
  const repo = await loadRepoForPage(gateway, viewer, owner, repoName, "repo:admin");
  const branches = await gateway.listBranches(owner, repoName).catch(() => []);

  return (
    <div>
      <RepoHeader repo={repo} active="settings" />

      <div className="mx-auto flex max-w-3xl flex-col gap-4">
        <div>
          <h2 className="text-fg text-sm font-semibold">Repository settings</h2>
          <p className="text-fg-muted mt-0.5 text-xs">
            Name, description, visibility and the default branch. Changes are applied in Forgejo,
            which owns this repository.
          </p>
        </div>

        <RepoSettingsForm
          owner={owner}
          repo={repo}
          branches={branches.map((branch) => branch.name)}
        />

        <InlineNotice tone="neutral">
          <span className="flex items-start gap-2">
            <ShieldAlert aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
            <span>
              Branch protection, webhooks and collaborators are Forgejo features exposed by its
              admin UI, which is reachable only from the private network. Wiring them into Keep is
              Planned.
            </span>
          </span>
        </InlineNotice>
      </div>
    </div>
  );
}
