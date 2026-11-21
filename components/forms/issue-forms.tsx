"use client";

import { CircleDot, MessageSquare, Plus } from "lucide-react";
import { useState } from "react";
import { apiRequest } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { FormFeedback } from "@/components/forms/form-bits";
import { useApiAction } from "@/components/forms/use-api-action";
import { Input, Label, Textarea } from "@/components/ui/input";
import { Disclosure } from "@/components/forms/form-bits";

export function IssueComposer({ owner, repo }: { owner: string; repo: string }) {
  const action = useApiAction();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");

  return (
    <Disclosure summary="New issue">
      <form
        className="flex flex-col gap-3"
        onSubmit={async (event) => {
          event.preventDefault();
          const created = await action.run(
            () =>
              apiRequest<{ number: number }>(`/api/v1/repos/${owner}/${repo}/issues`, {
                method: "POST",
                body: { title, body },
              }),
            {
              successMessage: "Issue created.",
              onSuccess: (issue) => {
                setTitle("");
                setBody("");
                action.router.push(`/${owner}/${repo}/issues/${issue.number}`);
              },
            },
          );
          return created;
        }}
      >
        <Label htmlFor="issue-title">
          Title
          <Input
            id="issue-title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            maxLength={255}
            required
            placeholder="Short, specific summary"
          />
        </Label>
        <Label htmlFor="issue-body" hint="Markdown is rendered with a strict sanitizer.">
          Description
          <Textarea
            id="issue-body"
            value={body}
            onChange={(event) => setBody(event.target.value)}
            rows={7}
          />
        </Label>
        <FormFeedback error={action.error} success={action.success} />
        <div>
          <Button type="submit" variant="primary" disabled={action.pending || title.trim() === ""}>
            <Plus aria-hidden="true" />
            {action.pending ? "Creating…" : "Create issue"}
          </Button>
        </div>
      </form>
    </Disclosure>
  );
}

export function IssueCommentForm({
  owner,
  repo,
  number,
}: {
  owner: string;
  repo: string;
  number: number;
}) {
  const action = useApiAction();
  const [body, setBody] = useState("");

  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={async (event) => {
        event.preventDefault();
        const result = await action.run(
          () =>
            apiRequest(`/api/v1/repos/${owner}/${repo}/issues/${number}/comments`, {
              method: "POST",
              body: { body },
            }),
          { successMessage: "Comment added." },
        );
        if (result) setBody("");
      }}
    >
      <Label htmlFor="comment-body" className="text-xs">
        Add a comment
        <Textarea
          id="comment-body"
          value={body}
          onChange={(event) => setBody(event.target.value)}
          rows={4}
          placeholder="Leave a comment (Markdown supported)"
        />
      </Label>
      <FormFeedback error={action.error} success={action.success} />
      <div>
        <Button
          type="submit"
          variant="secondary"
          size="sm"
          disabled={action.pending || !body.trim()}
        >
          <MessageSquare aria-hidden="true" />
          {action.pending ? "Posting…" : "Comment"}
        </Button>
      </div>
    </form>
  );
}

export function IssueStateButton({
  owner,
  repo,
  number,
  state,
}: {
  owner: string;
  repo: string;
  number: number;
  state: "open" | "closed";
}) {
  const action = useApiAction();
  const next = state === "open" ? "closed" : "open";

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        variant={state === "open" ? "danger" : "secondary"}
        size="sm"
        disabled={action.pending}
        onClick={async () => {
          await action.run(
            () =>
              apiRequest(`/api/v1/repos/${owner}/${repo}/issues/${number}`, {
                method: "PATCH",
                body: { state: next },
              }),
            { successMessage: next === "closed" ? "Issue closed." : "Issue reopened." },
          );
        }}
      >
        <CircleDot aria-hidden="true" />
        {action.pending ? "Saving…" : state === "open" ? "Close issue" : "Reopen issue"}
      </Button>
      <FormFeedback error={action.error} success={action.success} />
    </div>
  );
}
