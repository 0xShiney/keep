"use client";

import { AlertTriangle, Trash2 } from "lucide-react";
import { useState } from "react";
import { apiRequest, errorMessage } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { FormFeedback } from "@/components/forms/form-bits";
import { useApiAction } from "@/components/forms/use-api-action";
import { Input, Label } from "@/components/ui/input";
import type { RepoSummary } from "@/lib/forgejo/model";

export function RepoSettingsForm({
  owner,
  repo,
  branches,
}: {
  owner: string;
  repo: RepoSummary;
  branches: string[];
}) {
  const action = useApiAction();
  const [name, setName] = useState(repo.name);
  const [description, setDescription] = useState(repo.description ?? "");
  const [isPrivate, setIsPrivate] = useState(repo.private);
  const [defaultBranch, setDefaultBranch] = useState(repo.defaultBranch);
  const [archived, setArchived] = useState(repo.archived);

  const [confirmName, setConfirmName] = useState("");
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    const next = repo.name !== name ? name : undefined;
    await action.run(
      () =>
        apiRequest<RepoSummary>(`/api/v1/repos/${owner}/${repo.name}`, {
          method: "PATCH",
          body: {
            ...(next ? { name: next } : {}),
            description,
            private: isPrivate,
            defaultBranch,
            archived,
          },
        }),
      {
        successMessage: "Settings saved.",
        onSuccess: (updated) => {
          if (updated.name !== repo.name) {
            action.router.push(`/${owner}/${updated.name}/settings`);
          }
        },
      },
    );
  }

  async function destroy() {
    setDeleting(true);
    setDeleteError(null);
    try {
      await apiRequest(`/api/v1/repos/${owner}/${repo.name}`, {
        method: "DELETE",
        body: { confirm: confirmName },
      });
      window.location.assign("/");
    } catch (error) {
      setDeleteError(errorMessage(error));
      setDeleting(false);
    }
  }

  const fieldError = (field: string) =>
    action.error && field === "name" ? action.error : undefined;

  return (
    <div className="flex flex-col gap-4">
      <form
        onSubmit={save}
        className="border-border bg-surface-1 flex flex-col gap-4 rounded-md border p-4"
      >
        <h2 className="text-fg text-sm font-semibold">General</h2>

        <Label
          htmlFor="settings-name"
          hint="Renaming keeps existing clone URLs working via a redirect."
        >
          Repository name
          <Input
            id="settings-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={100}
            required
          />
          {fieldError("name") ? (
            <span className="text-danger text-xs">{fieldError("name")}</span>
          ) : null}
        </Label>

        <Label htmlFor="settings-description" hint="Up to 500 characters.">
          Description
          <Input
            id="settings-description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            maxLength={500}
          />
        </Label>

        <div className="grid gap-3 sm:grid-cols-2">
          <Label htmlFor="settings-visibility" className="text-fg-muted text-xs font-normal">
            Visibility
            <select
              id="settings-visibility"
              value={isPrivate ? "private" : "public"}
              onChange={(event) => setIsPrivate(event.target.value === "private")}
              className="border-border bg-surface-2 text-fg h-8 rounded-sm border px-2 text-sm"
            >
              <option value="private">Private</option>
              <option value="public">Public</option>
            </select>
          </Label>

          <Label htmlFor="settings-branch" className="text-fg-muted text-xs font-normal">
            Default branch
            <select
              id="settings-branch"
              value={defaultBranch}
              onChange={(event) => setDefaultBranch(event.target.value)}
              className="border-border bg-surface-2 text-fg h-8 rounded-sm border px-2 text-sm"
            >
              {(branches.length > 0 ? branches : [repo.defaultBranch]).map((branch) => (
                <option key={branch} value={branch}>
                  {branch}
                </option>
              ))}
            </select>
          </Label>
        </div>

        <label className="text-fg-muted flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={archived}
            onChange={(event) => setArchived(event.target.checked)}
            className="accent-[var(--accent)]"
          />
          Archive this repository (read-only)
        </label>

        <FormFeedback error={action.error} success={action.success} />

        <div>
          <Button type="submit" variant="primary" disabled={action.pending}>
            {action.pending ? "Saving…" : "Save settings"}
          </Button>
        </div>
      </form>

      <div className="border-danger/30 bg-surface-1 rounded-md border p-4">
        <h2 className="text-danger flex items-center gap-1.5 text-sm font-semibold">
          <AlertTriangle aria-hidden="true" className="size-3.5" />
          Danger zone
        </h2>
        <p className="text-fg-muted mt-1 text-xs">
          Deleting a repository removes its git data, issues and pull requests from Forgejo. This
          cannot be undone. Type <span className="text-fg font-mono">{repo.name}</span> to confirm.
        </p>
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <Label
            htmlFor="confirm-delete"
            className="text-fg-muted min-w-56 flex-1 text-xs font-normal"
          >
            Confirm repository name
            <Input
              id="confirm-delete"
              value={confirmName}
              onChange={(event) => setConfirmName(event.target.value)}
              autoComplete="off"
              placeholder={repo.name}
            />
          </Label>
          <Button
            type="button"
            variant="danger"
            onClick={destroy}
            disabled={deleting || confirmName !== repo.name}
          >
            <Trash2 aria-hidden="true" />
            {deleting ? "Deleting…" : "Delete repository"}
          </Button>
        </div>
        {deleteError ? (
          <p role="alert" className="text-danger mt-2 text-xs">
            {deleteError}
          </p>
        ) : null}
      </div>
    </div>
  );
}
