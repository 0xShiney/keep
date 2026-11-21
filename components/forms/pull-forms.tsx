"use client";

import { Check, GitMerge, MessageSquare, Plus, X } from "lucide-react";
import { useState } from "react";
import { apiRequest } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { FormFeedback, Disclosure } from "@/components/forms/form-bits";
import { useApiAction } from "@/components/forms/use-api-action";
import { Input, Label, Textarea } from "@/components/ui/input";
import type { PullSummary } from "@/lib/forgejo/model";

export function CreatePullForm({
  owner,
  repo,
  branches,
  defaultBase,
}: {
  owner: string;
  repo: string;
  branches: string[];
  defaultBase: string;
}) {
  const action = useApiAction();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [head, setHead] = useState(branches.find((branch) => branch !== defaultBase) ?? "");
  const [base, setBase] = useState(defaultBase);

  return (
    <Disclosure summary="New pull request">
      <form
        className="flex flex-col gap-3"
        onSubmit={async (event) => {
          event.preventDefault();
          await action.run(
            () =>
              apiRequest<PullSummary>(`/api/v1/repos/${owner}/${repo}/pulls`, {
                method: "POST",
                body: { title, body, head, base },
              }),
            {
              onSuccess: (pull) => action.router.push(`/${owner}/${repo}/pulls/${pull.number}`),
            },
          );
        }}
      >
        <div className="grid gap-2 sm:grid-cols-2">
          <Label htmlFor="pr-base" className="text-fg-muted text-xs font-normal">
            Base
            <select
              id="pr-base"
              value={base}
              onChange={(event) => setBase(event.target.value)}
              className="border-border bg-surface-2 text-fg h-8 rounded-sm border px-2 text-sm"
            >
              {branches.map((branch) => (
                <option key={branch} value={branch}>
                  {branch}
                </option>
              ))}
            </select>
          </Label>
          <Label htmlFor="pr-head" className="text-fg-muted text-xs font-normal">
            Compare (head)
            <select
              id="pr-head"
              value={head}
              onChange={(event) => setHead(event.target.value)}
              className="border-border bg-surface-2 text-fg h-8 rounded-sm border px-2 text-sm"
            >
              <option value="">Choose a branch…</option>
              {branches.map((branch) => (
                <option key={branch} value={branch}>
                  {branch}
                </option>
              ))}
            </select>
          </Label>
        </div>
        <Label htmlFor="pr-title">
          Title
          <Input
            id="pr-title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            maxLength={255}
            required
          />
        </Label>
        <Label htmlFor="pr-body" hint="Markdown supported.">
          Description
          <Textarea
            id="pr-body"
            value={body}
            onChange={(event) => setBody(event.target.value)}
            rows={6}
          />
        </Label>
        <FormFeedback error={action.error} success={action.success} />
        <div>
          <Button
            type="submit"
            variant="primary"
            disabled={action.pending || !title.trim() || !head || head === base}
          >
            <Plus aria-hidden="true" />
            {action.pending ? "Creating…" : "Create pull request"}
          </Button>
        </div>
      </form>
    </Disclosure>
  );
}

interface DraftComment {
  path: string;
  line: string;
  body: string;
}

export function ReviewBar({
  owner,
  repo,
  number,
  files,
}: {
  owner: string;
  repo: string;
  number: number;
  files: string[];
}) {
  const action = useApiAction();
  const [body, setBody] = useState("");
  const [drafts, setDrafts] = useState<DraftComment[]>([]);
  const [path, setPath] = useState(files[0] ?? "");
  const [line, setLine] = useState("");
  const [commentBody, setCommentBody] = useState("");

  function addDraft() {
    if (!path || !line || !commentBody.trim()) return;
    setDrafts((current) => [...current, { path, line, body: commentBody }]);
    setCommentBody("");
    setLine("");
  }

  async function submit(event: "APPROVED" | "REQUEST_CHANGES" | "COMMENT") {
    await action.run(
      () =>
        apiRequest(`/api/v1/repos/${owner}/${repo}/pulls/${number}/reviews`, {
          method: "POST",
          body: {
            event,
            body,
            comments: drafts.map((draft) => ({
              path: draft.path,
              line: Number.parseInt(draft.line, 10),
              body: draft.body,
            })),
          },
        }),
      {
        successMessage:
          event === "APPROVED"
            ? "Approved."
            : event === "REQUEST_CHANGES"
              ? "Changes requested."
              : "Review comment submitted.",
        onSuccess: () => {
          setDrafts([]);
          setBody("");
        },
      },
    );
  }

  return (
    <section
      aria-labelledby="review-heading"
      className="border-border bg-surface-1 rounded-md border p-3"
    >
      <h2 id="review-heading" className="text-fg text-sm font-semibold">
        Review
      </h2>
      <p className="text-2xs text-fg-subtle mt-0.5">
        Inline comments are anchored to the new file line; Keep converts that to Forgejo&apos;s diff
        position.
      </p>

      <div className="mt-2 flex flex-col gap-2">
        <Label htmlFor="review-body" className="text-fg-muted text-xs font-normal">
          Review summary
          <Textarea
            id="review-body"
            value={body}
            onChange={(event) => setBody(event.target.value)}
            rows={3}
            placeholder="Optional summary for the review"
          />
        </Label>

        <fieldset className="border-border bg-bg rounded-sm border p-2">
          <legend className="text-2xs text-fg-subtle px-1">Inline comments</legend>
          <div className="grid gap-2 sm:grid-cols-[1fr_90px]">
            <select
              aria-label="File for inline comment"
              value={path}
              onChange={(event) => setPath(event.target.value)}
              className="border-border bg-surface-2 text-fg h-8 rounded-sm border px-2 text-xs"
            >
              {files.map((file) => (
                <option key={file} value={file}>
                  {file}
                </option>
              ))}
            </select>
            <Input
              aria-label="Line number in the new file"
              value={line}
              onChange={(event) => setLine(event.target.value.replace(/[^0-9]/g, ""))}
              inputMode="numeric"
              placeholder="Line"
            />
          </div>
          <div className="mt-2 flex gap-2">
            <Input
              aria-label="Inline comment"
              value={commentBody}
              onChange={(event) => setCommentBody(event.target.value)}
              placeholder="Comment on this line"
            />
            <Button type="button" variant="secondary" size="sm" onClick={addDraft}>
              Add
            </Button>
          </div>

          {drafts.length > 0 ? (
            <ul className="mt-2 flex flex-col gap-1">
              {drafts.map((draft, index) => (
                <li
                  key={`${draft.path}-${draft.line}-${index}`}
                  className="border-border bg-surface-2 text-2xs flex items-center gap-2 rounded-sm border px-2 py-1"
                >
                  <span className="text-fg-muted font-mono">
                    {draft.path}:{draft.line}
                  </span>
                  <span className="text-fg-subtle min-w-0 flex-1 truncate">{draft.body}</span>
                  <button
                    type="button"
                    aria-label={`Remove comment on ${draft.path}:${draft.line}`}
                    onClick={() => setDrafts((current) => current.filter((_, i) => i !== index))}
                    className="text-fg-subtle hover:bg-surface-3 hover:text-fg rounded-sm p-0.5"
                  >
                    <X aria-hidden="true" className="size-3" />
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </fieldset>
      </div>

      <FormFeedback error={action.error} success={action.success} />

      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          variant="primary"
          size="sm"
          disabled={action.pending}
          onClick={() => submit("APPROVED")}
        >
          <Check aria-hidden="true" />
          Approve
        </Button>
        <Button
          variant="danger"
          size="sm"
          disabled={action.pending}
          onClick={() => submit("REQUEST_CHANGES")}
        >
          <X aria-hidden="true" />
          Request changes
        </Button>
        <Button
          variant="secondary"
          size="sm"
          disabled={action.pending}
          onClick={() => submit("COMMENT")}
        >
          <MessageSquare aria-hidden="true" />
          Comment only
        </Button>
      </div>
    </section>
  );
}

export function MergeBox({
  owner,
  repo,
  number,
  mergeable,
  merged,
}: {
  owner: string;
  repo: string;
  number: number;
  mergeable: boolean;
  merged: boolean;
}) {
  const action = useApiAction();
  const [style, setStyle] = useState<"merge" | "squash" | "rebase">("squash");
  const [message, setMessage] = useState("");

  if (merged) {
    return (
      <div className="border-accent/30 bg-accent-subtle text-accent rounded-md border px-3 py-2 text-xs">
        This pull request has been merged.
      </div>
    );
  }

  return (
    <section
      aria-labelledby="merge-heading"
      className="border-border bg-surface-1 rounded-md border p-3"
    >
      <h2 id="merge-heading" className="text-fg flex items-center gap-1.5 text-sm font-semibold">
        <GitMerge aria-hidden="true" className="text-fg-subtle size-3.5" />
        Merge
      </h2>

      {!mergeable ? (
        <p className="border-danger/30 bg-danger-subtle text-2xs text-danger mt-2 rounded-sm border px-2 py-1.5">
          This pull request cannot be merged automatically: resolve the conflicts on the head branch
          and push again.
        </p>
      ) : (
        <p className="text-2xs text-success mt-1">No conflicts detected.</p>
      )}

      <div className="mt-2 flex flex-col gap-2">
        <Label htmlFor="merge-style" className="text-fg-muted text-xs font-normal">
          Strategy
          <select
            id="merge-style"
            value={style}
            onChange={(event) => setStyle(event.target.value as typeof style)}
            className="border-border bg-surface-2 text-fg h-8 rounded-sm border px-2 text-sm"
          >
            <option value="merge">Create a merge commit</option>
            <option value="squash">Squash and merge</option>
            <option value="rebase">Rebase and merge</option>
          </select>
        </Label>
        <Label htmlFor="merge-message" className="text-fg-muted text-xs font-normal">
          Commit message (optional)
          <Input
            id="merge-message"
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            maxLength={2000}
          />
        </Label>
      </div>

      <FormFeedback error={action.error} success={action.success} />

      <div className="mt-3">
        <Button
          variant="primary"
          size="sm"
          disabled={action.pending || !mergeable}
          onClick={async () => {
            await action.run(
              () =>
                apiRequest(`/api/v1/repos/${owner}/${repo}/pulls/${number}/merge`, {
                  method: "POST",
                  body: { style, message: message || undefined },
                }),
              { successMessage: "Pull request merged." },
            );
          }}
        >
          <GitMerge aria-hidden="true" />
          {action.pending ? "Merging…" : `Merge with ${style}`}
        </Button>
      </div>
    </section>
  );
}
