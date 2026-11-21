"use client";

import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { apiRequest } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Disclosure, FormFeedback } from "@/components/forms/form-bits";
import { useApiAction } from "@/components/forms/use-api-action";
import { Input, Label } from "@/components/ui/input";

export function BranchActions({
  owner,
  repo,
  branches,
  branchToDelete,
}: {
  owner: string;
  repo: string;
  branches: { name: string; isDefault: boolean }[];
  branchToDelete?: string;
}) {
  const action = useApiAction();
  const [name, setName] = useState("");
  const [from, setFrom] = useState(
    branches.find((branch) => branch.isDefault)?.name ?? branches[0]?.name ?? "main",
  );
  const [confirming, setConfirming] = useState(false);

  if (branchToDelete) {
    if (confirming) {
      return (
        <span className="flex items-center gap-1">
          <Button
            variant="danger"
            size="sm"
            disabled={action.pending}
            onClick={async () => {
              await action.run(
                () =>
                  apiRequest(
                    `/api/v1/repos/${owner}/${repo}/branches/${encodeURIComponent(branchToDelete)}`,
                    { method: "DELETE" },
                  ),
                { successMessage: "Branch deleted." },
              );
              setConfirming(false);
            }}
          >
            {action.pending ? "Deleting…" : "Confirm"}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setConfirming(false)}>
            Cancel
          </Button>
        </span>
      );
    }
    return (
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={`Delete branch ${branchToDelete}`}
        title={`Delete ${branchToDelete}`}
        onClick={() => setConfirming(true)}
      >
        <Trash2 aria-hidden="true" />
      </Button>
    );
  }

  return (
    <Disclosure summary="New branch">
      <form
        className="flex flex-col gap-2"
        onSubmit={async (event) => {
          event.preventDefault();
          const result = await action.run(
            () =>
              apiRequest(`/api/v1/repos/${owner}/${repo}/branches`, {
                method: "POST",
                body: { name, from },
              }),
            { successMessage: `Branch ${name} created.` },
          );
          if (result) setName("");
        }}
      >
        <Label htmlFor="branch-name" className="text-fg-muted text-xs font-normal">
          Branch name
          <Input
            id="branch-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="feature/my-change"
            required
          />
        </Label>
        <Label htmlFor="branch-from" className="text-fg-muted text-xs font-normal">
          From
          <select
            id="branch-from"
            value={from}
            onChange={(event) => setFrom(event.target.value)}
            className="border-border bg-surface-2 text-fg h-8 rounded-sm border px-2 text-sm"
          >
            {branches.map((branch) => (
              <option key={branch.name} value={branch.name}>
                {branch.name}
              </option>
            ))}
          </select>
        </Label>
        <FormFeedback error={action.error} success={action.success} />
        <div>
          <Button
            type="submit"
            variant="secondary"
            size="sm"
            disabled={action.pending || !name.trim()}
          >
            <Plus aria-hidden="true" />
            Create branch
          </Button>
        </div>
      </form>
    </Disclosure>
  );
}
