"use client";

import { Package } from "lucide-react";
import { useState } from "react";
import { apiRequest } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Disclosure, FormFeedback } from "@/components/forms/form-bits";
import { useApiAction } from "@/components/forms/use-api-action";
import { Input, Label, Textarea } from "@/components/ui/input";

export function ReleaseForm({
  owner,
  repo,
  defaultTag,
}: {
  owner: string;
  repo: string;
  defaultTag: string;
}) {
  const action = useApiAction();
  const [tagName, setTagName] = useState(defaultTag);
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [prerelease, setPrerelease] = useState(false);

  return (
    <Disclosure summary="New release">
      <form
        className="flex flex-col gap-3"
        onSubmit={async (event) => {
          event.preventDefault();
          const result = await action.run(
            () =>
              apiRequest(`/api/v1/repos/${owner}/${repo}/releases`, {
                method: "POST",
                body: { tagName, title, notes, prerelease },
              }),
            { successMessage: "Release published." },
          );
          if (result) {
            setTitle("");
            setNotes("");
          }
        }}
      >
        <div className="grid gap-2 sm:grid-cols-2">
          <Label htmlFor="release-tag" className="text-fg-muted text-xs font-normal">
            Tag
            <Input
              id="release-tag"
              value={tagName}
              onChange={(event) => setTagName(event.target.value)}
              placeholder="v1.0.0"
              required
            />
          </Label>
          <Label htmlFor="release-title" className="text-fg-muted text-xs font-normal">
            Title
            <Input
              id="release-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Version 1.0.0"
            />
          </Label>
        </div>
        <Label htmlFor="release-notes" hint="Markdown supported.">
          Release notes
          <Textarea
            id="release-notes"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            rows={6}
          />
        </Label>
        <label className="text-fg-muted flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={prerelease}
            onChange={(event) => setPrerelease(event.target.checked)}
            className="accent-[var(--accent)]"
          />
          Mark as pre-release
        </label>
        <FormFeedback error={action.error} success={action.success} />
        <div>
          <Button
            type="submit"
            variant="primary"
            size="sm"
            disabled={action.pending || !tagName.trim()}
          >
            <Package aria-hidden="true" />
            {action.pending ? "Publishing…" : "Publish release"}
          </Button>
        </div>
      </form>
    </Disclosure>
  );
}
