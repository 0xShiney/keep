"use client";

import { KeyRound, Plus, Trash2, Terminal } from "lucide-react";
import { useState } from "react";
import { apiRequest } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/copy-button";
import { FormFeedback } from "@/components/forms/form-bits";
import { useApiAction } from "@/components/forms/use-api-action";
import { Input, Label, Textarea } from "@/components/ui/input";
import type { CreatedAccessToken, SshKey } from "@/lib/forgejo/model";

export function AddKeyForm() {
  const action = useApiAction();
  const [title, setTitle] = useState("");
  const [key, setKey] = useState("");

  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={async (event) => {
        event.preventDefault();
        const result = await action.run(
          () => apiRequest<SshKey>("/api/v1/keys", { method: "POST", body: { title, key } }),
          { successMessage: "SSH key added." },
        );
        if (result) {
          setTitle("");
          setKey("");
        }
      }}
    >
      <div className="grid gap-2 sm:grid-cols-[1fr_1fr]">
        <Label htmlFor="key-title" className="text-fg-muted text-xs font-normal">
          Title
          <Input
            id="key-title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Laptop (ed25519)"
            required
          />
        </Label>
        <Label htmlFor="key-value" className="text-fg-muted text-xs font-normal">
          Public key
          <Textarea
            id="key-value"
            value={key}
            onChange={(event) => setKey(event.target.value)}
            rows={3}
            placeholder="ssh-ed25519 AAAAC3Nza… user@host"
            required
            className="font-mono text-xs"
          />
        </Label>
      </div>
      <FormFeedback error={action.error} success={action.success} />
      <div>
        <Button
          type="submit"
          variant="secondary"
          size="sm"
          disabled={action.pending || !title || !key}
        >
          <Plus aria-hidden="true" />
          {action.pending ? "Adding…" : "Add SSH key"}
        </Button>
      </div>
    </form>
  );
}

export function RevokeKeyButton({ id, title }: { id: number; title: string }) {
  const action = useApiAction();
  const [confirming, setConfirming] = useState(false);

  if (!confirming) {
    return (
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={`Delete SSH key ${title}`}
        onClick={() => setConfirming(true)}
      >
        <Trash2 aria-hidden="true" />
      </Button>
    );
  }

  return (
    <span className="flex items-center gap-1">
      <Button
        variant="danger"
        size="sm"
        disabled={action.pending}
        onClick={async () => {
          await action.run(() => apiRequest(`/api/v1/keys/${id}`, { method: "DELETE" }), {
            successMessage: "SSH key deleted.",
          });
          setConfirming(false);
        }}
      >
        {action.pending ? "Deleting…" : "Confirm"}
      </Button>
      <Button variant="ghost" size="sm" onClick={() => setConfirming(false)}>
        Cancel
      </Button>
      <FormFeedback error={action.error} />
    </span>
  );
}

const SCOPES = [
  { value: "write:repository", label: "Repositories (read & write)" },
  { value: "write:user", label: "User settings (read & write)" },
  { value: "write:issue", label: "Issues (read & write)" },
  { value: "read:organization", label: "Organisations (read)" },
];

export function CreateTokenForm() {
  const action = useApiAction();
  const [name, setName] = useState("");
  const [scopes, setScopes] = useState<string[]>(["write:repository"]);
  const [created, setCreated] = useState<CreatedAccessToken | null>(null);

  return (
    <div className="flex flex-col gap-3">
      <form
        className="flex flex-col gap-2"
        onSubmit={async (event) => {
          event.preventDefault();
          const result = await action.run(
            () =>
              apiRequest<CreatedAccessToken>("/api/v1/tokens", {
                method: "POST",
                body: { name, scopes },
              }),
            { successMessage: "Token created." },
          );
          if (result) {
            setCreated(result);
            setName("");
          }
        }}
      >
        <Label htmlFor="token-name" className="text-fg-muted text-xs font-normal">
          Token name
          <Input
            id="token-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="laptop-git"
            pattern="[A-Za-z0-9._-]+"
            required
          />
        </Label>
        <fieldset className="flex flex-col gap-1">
          <legend className="text-fg-muted text-xs">Scopes</legend>
          {SCOPES.map((scope) => (
            <label key={scope.value} className="text-fg-muted flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={scopes.includes(scope.value)}
                onChange={(event) =>
                  setScopes((current) =>
                    event.target.checked
                      ? [...current, scope.value]
                      : current.filter((value) => value !== scope.value),
                  )
                }
                className="accent-[var(--accent)] size-6 shrink-0"
              />
              {scope.label}
            </label>
          ))}
        </fieldset>
        <FormFeedback error={action.error} success={action.success} />
        <div>
          <Button type="submit" variant="secondary" size="sm" disabled={action.pending || !name}>
            <KeyRound aria-hidden="true" />
            {action.pending ? "Creating…" : "Create token"}
          </Button>
        </div>
      </form>

      {created ? (
        <div className="border-warning/30 bg-warning-subtle rounded-sm border p-2.5">
          <p className="text-2xs text-warning font-medium">
            Copy this token now. It is shown once and never stored by Keep.
          </p>
          <div className="mt-1.5 flex items-center gap-2">
            <code className="border-border bg-bg text-fg flex-1 overflow-x-auto rounded-sm border px-2 py-1.5 font-mono text-xs whitespace-nowrap">
              {created.token}
            </code>
            <CopyButton value={created.token} label="Copy token" variant="secondary" />
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function RevokeTokenButton({ name }: { name: string }) {
  const action = useApiAction();
  const [confirming, setConfirming] = useState(false);

  if (!confirming) {
    return (
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={`Revoke token ${name}`}
        onClick={() => setConfirming(true)}
      >
        <Trash2 aria-hidden="true" />
      </Button>
    );
  }

  return (
    <span className="flex items-center gap-1">
      <Button
        variant="danger"
        size="sm"
        disabled={action.pending}
        onClick={async () => {
          await action.run(
            () => apiRequest(`/api/v1/tokens/${encodeURIComponent(name)}`, { method: "DELETE" }),
            { successMessage: "Token revoked." },
          );
          setConfirming(false);
        }}
      >
        {action.pending ? "Revoking…" : "Confirm"}
      </Button>
      <Button variant="ghost" size="sm" onClick={() => setConfirming(false)}>
        Cancel
      </Button>
    </span>
  );
}

export function RevokeSessionButton({ handle }: { handle: string }) {
  const action = useApiAction();
  const [confirming, setConfirming] = useState(false);

  if (!confirming) {
    return (
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setConfirming(true)}
        aria-label={`Revoke session ${handle}`}
      >
        Revoke
      </Button>
    );
  }

  return (
    <span className="flex items-center gap-1">
      <Button
        variant="danger"
        size="sm"
        disabled={action.pending}
        onClick={async () => {
          await action.run(
            () =>
              apiRequest(`/api/v1/sessions/${encodeURIComponent(handle)}`, { method: "DELETE" }),
            { successMessage: "Session revoked." },
          );
          setConfirming(false);
        }}
      >
        {action.pending ? "Revoking…" : "Confirm"}
      </Button>
      <Button variant="ghost" size="sm" onClick={() => setConfirming(false)}>
        Cancel
      </Button>
    </span>
  );
}

export function SshHelp() {
  return (
    <div className="border-border bg-surface-2/50 text-2xs text-fg-subtle flex items-start gap-2 rounded-sm border px-3 py-2">
      <Terminal aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
      <div>
        <p>Generate a key, then paste the public half here:</p>
        <code className="text-fg-muted mt-1 block font-mono">
          ssh-keygen -t ed25519 -C &quot;you@host&quot;
        </code>
        <code className="text-fg-muted mt-1 block font-mono">cat ~/.ssh/id_ed25519.pub</code>
      </div>
    </div>
  );
}
