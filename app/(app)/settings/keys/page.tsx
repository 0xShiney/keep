import type { Metadata } from "next";
import { Terminal } from "lucide-react";
import { AddKeyForm, RevokeKeyButton, SshHelp } from "@/components/forms/account-forms";
import { PageHeader } from "@/components/ui/feedback";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";
import { getEnv } from "@/lib/env";
import { formatDate } from "@/lib/utils";
import { pageContext } from "@/server/context";
import { listKeys } from "@/server/account";

export const metadata: Metadata = { title: "SSH keys" };

export default async function KeysPage() {
  const { gateway } = await pageContext("/settings/keys");
  const keys = await listKeys(gateway);
  const env = getEnv();

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <PageHeader
        title="SSH keys"
        description={`Authenticate git over SSH against ${env.SSH_HOST}:${env.SSH_PORT}.`}
      />

      <Panel>
        <PanelHeader
          title="Add a key"
          description="Paste an OpenSSH public key. Private keys never leave your machine."
        />
        <PanelBody className="flex flex-col gap-3">
          <AddKeyForm />
          <SshHelp />
        </PanelBody>
      </Panel>

      <Panel>
        <PanelHeader
          title="Your keys"
          description={`${keys.length} key${keys.length === 1 ? "" : "s"}`}
        />
        <PanelBody className="p-0">
          {keys.length === 0 ? (
            <div className="flex flex-col items-center gap-1 px-3 py-6 text-center">
              <Terminal aria-hidden="true" className="text-fg-subtle size-5" />
              <p className="text-fg-muted text-xs">No SSH keys yet</p>
              <p className="text-2xs text-fg-subtle font-mono">
                ssh-keygen -t ed25519 -C &quot;you@host&quot;
              </p>
            </div>
          ) : (
            <ul className="divide-border divide-y">
              {keys.map((key) => (
                <li key={key.id} className="flex flex-wrap items-center gap-2 px-3 py-2 text-xs">
                  <span className="text-fg font-medium">{key.title}</span>
                  {key.readOnly ? <span className="text-2xs text-fg-subtle">read-only</span> : null}
                  <span className="border-border bg-surface-2 text-2xs text-fg-subtle rounded-sm border px-1.5 py-px font-mono">
                    {key.keyType ?? "ssh"}
                  </span>
                  <span className="text-2xs text-fg-subtle min-w-0 flex-1 truncate font-mono">
                    {key.fingerprint ?? ""}
                  </span>
                  <span className="text-2xs text-fg-subtle">added {formatDate(key.createdAt)}</span>
                  <RevokeKeyButton id={key.id} title={key.title} />
                </li>
              ))}
            </ul>
          )}
        </PanelBody>
      </Panel>

      <p className="text-2xs text-fg-subtle">
        Deleting a key immediately denies the next SSH push or fetch. SSH brute-force protection is
        a host firewall concern; see docs/SECURITY.md.
      </p>
    </div>
  );
}
