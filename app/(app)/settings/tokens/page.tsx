import type { Metadata } from "next";
import Link from "next/link";
import { KeyRound } from "lucide-react";
import { CreateTokenForm, RevokeTokenButton } from "@/components/forms/account-forms";
import { InlineNotice, PageHeader } from "@/components/ui/feedback";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";
import { getEnv } from "@/lib/env";
import { brokerStatus } from "@/lib/forgejo/token-broker";
import { formatDate } from "@/lib/utils";
import { pageContext } from "@/server/context";
import { listTokens } from "@/server/account";

export const metadata: Metadata = { title: "Access tokens" };

export default async function TokensPage() {
  const { gateway } = await pageContext("/settings/tokens");
  const tokens = await listTokens(gateway);
  const env = getEnv();
  const broker = brokerStatus();

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <PageHeader
        title="Access tokens"
        description={`Use a token as the password when cloning over ${env.GIT_PUBLIC_URL}.`}
      />

      {!broker.configured ? (
        <InlineNotice tone="warning">
          {broker.reason} Forgejo requires HTTP Basic auth as an admin service account to issue
          personal access tokens, so Keep uses a dedicated broker account rather than an admin
          token. Create one with <code className="font-mono">./deploy/forgejo/bootstrap.sh</code>.
        </InlineNotice>
      ) : null}

      <Panel>
        <PanelHeader
          title="Create a token"
          description="Scoped tokens are safer than your account password."
        />
        <PanelBody>
          <CreateTokenForm />
        </PanelBody>
      </Panel>

      <Panel>
        <PanelHeader
          title="Existing tokens"
          description={`${tokens.length} token${tokens.length === 1 ? "" : "s"}`}
        />
        <PanelBody className="p-0">
          {tokens.length === 0 ? (
            <div className="flex flex-col items-center gap-1 px-3 py-6 text-center">
              <KeyRound aria-hidden="true" className="text-fg-subtle size-5" />
              <p className="text-fg-muted text-xs">No access tokens</p>
              <p className="text-2xs text-fg-subtle">
                Keep stores token metadata from Forgejo; the token value is never persisted.
              </p>
            </div>
          ) : (
            <ul className="divide-border divide-y">
              {tokens.map((token) => (
                <li key={token.id} className="flex flex-wrap items-center gap-2 px-3 py-2 text-xs">
                  <span className="text-fg font-medium">{token.name}</span>
                  <span className="text-2xs text-fg-subtle font-mono">
                    …{token.lastEight ?? "????????"}
                  </span>
                  <span className="text-2xs text-fg-subtle">
                    {token.scopes.length > 0 ? token.scopes.join(", ") : "all scopes"}
                  </span>
                  <span className="text-2xs text-fg-subtle ml-auto">
                    created {formatDate(token.createdAt)}
                  </span>
                  <RevokeTokenButton name={token.name} />
                </li>
              ))}
            </ul>
          )}
        </PanelBody>
      </Panel>

      <p className="text-2xs text-fg-subtle">
        Clone with HTTPS: <code className="font-mono">{env.GIT_PUBLIC_URL}/owner/repo.git</code> and
        use your username with the token as the password. See{" "}
        <Link href="/settings/keys" className="underline underline-offset-2">
          SSH keys
        </Link>{" "}
        for the key-based alternative.
      </p>
    </div>
  );
}
