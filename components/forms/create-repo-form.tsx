"use client";

import { useMutation } from "@tanstack/react-query";
import { Lock, Globe } from "lucide-react";
import { useState } from "react";
import { apiRequest, ApiProblemError, errorMessage } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { FormFeedback, SubmitButton } from "@/components/forms/form-bits";
import { Input, Label } from "@/components/ui/input";
import type { RepoSummary } from "@/lib/forgejo/model";

const GITIGNORES = ["", "Node", "Python", "Go", "Rust", "Java"];
const LICENSES = ["", "MIT", "Apache-2.0", "BSD-3-Clause", "MPL-2.0"];

export function CreateRepoForm() {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isPrivate, setIsPrivate] = useState(true);
  const [autoInit, setAutoInit] = useState(true);
  const [gitignore, setGitignore] = useState("Node");
  const [license, setLicense] = useState("MIT");

  const mutation = useMutation({
    mutationFn: () =>
      apiRequest<RepoSummary>("/api/v1/repos", {
        method: "POST",
        body: { name, description, private: isPrivate, autoInit, gitignore, license, readme: true },
      }),
    onSuccess: (repo) => {
      // Full navigation so the new repository's shell is rendered server-side.
      window.location.assign(`/${repo.fullName}`);
    },
  });

  const nameError =
    mutation.error instanceof ApiProblemError ? mutation.error.fieldError("name") : undefined;

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        mutation.mutate();
      }}
    >
      <div className="grid gap-3 sm:grid-cols-[1fr_220px]">
        <Label htmlFor="repo-name" hint="Letters, digits, dots, dashes and underscores.">
          Repository name
          <Input
            id="repo-name"
            name="name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
            maxLength={100}
            autoFocus
            placeholder="my-project"
            aria-invalid={Boolean(nameError)}
            aria-describedby={nameError ? "repo-name-error" : undefined}
          />
          {nameError ? (
            <span id="repo-name-error" role="alert" className="text-danger text-xs">
              {nameError}
            </span>
          ) : null}
        </Label>

        <fieldset className="flex flex-col gap-1.5">
          <legend className="text-fg mb-1.5 text-sm font-medium">Visibility</legend>
          <label className="border-border bg-surface-1 hover:border-border-strong flex cursor-pointer items-start gap-2 rounded-sm border p-2 text-xs">
            <input
              type="radio"
              name="visibility"
              checked={isPrivate}
              onChange={() => setIsPrivate(true)}
              className="mt-0.5 accent-[var(--accent)]"
            />
            <span>
              <span className="text-fg flex items-center gap-1 font-medium">
                <Lock aria-hidden="true" className="size-3" /> Private
              </span>
              <span className="text-fg-subtle">Only you can see this repository.</span>
            </span>
          </label>
          <label className="border-border bg-surface-1 hover:border-border-strong flex cursor-pointer items-start gap-2 rounded-sm border p-2 text-xs">
            <input
              type="radio"
              name="visibility"
              checked={!isPrivate}
              onChange={() => setIsPrivate(false)}
              className="mt-0.5 accent-[var(--accent)]"
            />
            <span>
              <span className="text-fg flex items-center gap-1 font-medium">
                <Globe aria-hidden="true" className="size-3" /> Public
              </span>
              <span className="text-fg-subtle">Read-only for anonymous Git clients.</span>
            </span>
          </label>
        </fieldset>
      </div>

      <Label
        htmlFor="repo-description"
        hint="Optional. Shown on the dashboard and repository header."
      >
        Description
        <Input
          id="repo-description"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          maxLength={500}
          placeholder="What is this repository for?"
        />
      </Label>

      <div className="border-border bg-surface-1 flex flex-col gap-2 rounded-md border p-3">
        <label className="text-fg flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={autoInit}
            onChange={(event) => setAutoInit(event.target.checked)}
            className="accent-[var(--accent)]"
          />
          Initialize with a README
        </label>
        <div className="grid gap-2 sm:grid-cols-2">
          <Label htmlFor="gitignore" className="text-fg-muted text-xs font-normal">
            .gitignore template
            <select
              id="gitignore"
              value={gitignore}
              onChange={(event) => setGitignore(event.target.value)}
              disabled={!autoInit}
              className="border-border bg-surface-2 text-fg h-8 rounded-sm border px-2 text-xs disabled:opacity-50"
            >
              {GITIGNORES.map((value) => (
                <option key={value || "none"} value={value}>
                  {value || "None"}
                </option>
              ))}
            </select>
          </Label>
          <Label htmlFor="license" className="text-fg-muted text-xs font-normal">
            License
            <select
              id="license"
              value={license}
              onChange={(event) => setLicense(event.target.value)}
              disabled={!autoInit}
              className="border-border bg-surface-2 text-fg h-8 rounded-sm border px-2 text-xs disabled:opacity-50"
            >
              {LICENSES.map((value) => (
                <option key={value || "none"} value={value}>
                  {value || "None"}
                </option>
              ))}
            </select>
          </Label>
        </div>
      </div>

      <FormFeedback error={mutation.isError ? errorMessage(mutation.error) : null} />

      <div className="flex items-center gap-2">
        <SubmitButton pending={mutation.isPending}>
          {mutation.isPending ? "Creating…" : "Create repository"}
        </SubmitButton>
        <Button variant="ghost" type="button" onClick={() => history.back()}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
