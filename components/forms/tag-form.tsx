"use client";

import { Tag } from "lucide-react";
import { useState } from "react";
import { apiRequest } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Disclosure, FormFeedback } from "@/components/forms/form-bits";
import { useApiAction } from "@/components/forms/use-api-action";
import { Input, Label } from "@/components/ui/input";

export function TagForm({
  owner,
  repo,
  defaultTarget,
}: {
  owner: string;
  repo: string;
  defaultTarget: string;
}) {
  const action = useApiAction();
  const [tag, setTag] = useState("");
  const [target, setTarget] = useState(defaultTarget);

  return (
    <Disclosure summary="New tag">
      <form
        className="flex flex-col gap-2"
        onSubmit={async (event) => {
          event.preventDefault();
          const result = await action.run(
            () =>
              apiRequest(`/api/v1/repos/${owner}/${repo}/tags`, {
                method: "POST",
                body: { tag, target },
              }),
            { successMessage: `Tag ${tag} created.` },
          );
          if (result) setTag("");
        }}
      >
        <Label htmlFor="tag-name" className="text-fg-muted text-xs font-normal">
          Tag name
          <Input
            id="tag-name"
            value={tag}
            onChange={(event) => setTag(event.target.value)}
            placeholder="v1.0.0"
            required
          />
        </Label>
        <Label htmlFor="tag-target" className="text-fg-muted text-xs font-normal">
          Target ref
          <Input
            id="tag-target"
            value={target}
            onChange={(event) => setTarget(event.target.value)}
          />
        </Label>
        <FormFeedback error={action.error} success={action.success} />
        <div>
          <Button
            type="submit"
            variant="secondary"
            size="sm"
            disabled={action.pending || !tag.trim()}
          >
            <Tag aria-hidden="true" />
            Create tag
          </Button>
        </div>
      </form>
    </Disclosure>
  );
}
