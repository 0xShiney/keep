import type { Metadata } from "next";
import { CreateRepoForm } from "@/components/forms/create-repo-form";
import { PageHeader } from "@/components/ui/feedback";
import { Panel, PanelBody } from "@/components/ui/panel";
import { pageContext } from "@/server/context";

export const metadata: Metadata = { title: "New repository" };

export default async function NewRepoPage() {
  // Ensures an unauthenticated visitor is redirected before rendering the form.
  await pageContext("/new");

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <PageHeader
        title="Create a repository"
        description="Repositories are private by default. You can change visibility later in settings."
      />
      <Panel>
        <PanelBody className="p-4">
          <CreateRepoForm />
        </PanelBody>
      </Panel>
      <p className="text-2xs text-fg-subtle">
        Keep never reimplements git. A new repository is created directly in Forgejo, so it is
        cloneable immediately over HTTPS and SSH.
      </p>
    </div>
  );
}
