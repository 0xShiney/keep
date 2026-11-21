import type { Metadata } from "next";
import Link from "next/link";
import { KeyRound, Monitor, ShieldCheck, Terminal } from "lucide-react";
import { Avatar } from "@/components/avatar";
import { PrefsForm } from "@/components/forms/prefs-form";
import { RevokeSessionButton } from "@/components/forms/account-forms";
import { PageHeader } from "@/components/ui/feedback";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";
import { Badge } from "@/components/ui/badge";
import { getThemePref } from "@/lib/theme";
import { formatDateTime, formatRelativeTime } from "@/lib/utils";
import { pageContext } from "@/server/context";
import { listSessions } from "@/server/account";

export const metadata: Metadata = { title: "Settings" };

export default async function UserSettingsPage() {
  const { identity, gateway } = await pageContext("/settings");
  const [user, theme, sessions] = await Promise.all([
    gateway.getUser().catch(() => null),
    getThemePref(),
    listSessions(identity.userId, identity.sessionHash),
  ]);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <PageHeader title="Settings" description="Account, appearance and active sessions." />

      <Panel>
        <PanelHeader
          title="Profile"
          description="Identity comes from Forgejo; Keep stores no credentials."
        />
        <PanelBody className="flex flex-wrap items-center gap-3">
          <Avatar name={user?.login ?? identity.username} src={user?.avatarUrl} size={40} />
          <div className="min-w-0">
            <p className="text-fg text-sm font-medium">
              {user?.fullName ?? user?.login ?? identity.username}
            </p>
            <p className="text-fg-subtle text-xs">
              {user?.login ?? identity.username}
              {user?.email ? ` · ${user.email}` : ""}
            </p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            {identity.isOwner ? <Badge tone="accent">Owner</Badge> : null}
            {user?.isAdmin ? <Badge tone="neutral">Forgejo admin</Badge> : null}
          </div>
        </PanelBody>
      </Panel>

      <Panel>
        <PanelHeader title="Appearance" description="Theme, density and the default diff view." />
        <PanelBody>
          <PrefsForm initialTheme={theme} initialDensity="compact" initialDiffMode="unified" />
        </PanelBody>
      </Panel>

      <Panel id="sessions">
        <PanelHeader
          title="Active sessions"
          description="Server-side sessions for this account. Revoking one signs that browser out."
          action={
            <span className="text-2xs text-fg-subtle flex items-center gap-1">
              <Monitor aria-hidden="true" className="size-3" />
              {sessions.length}
            </span>
          }
        />
        <PanelBody className="p-0">
          <ul className="divide-border divide-y">
            {sessions.map((session) => (
              <li key={session.id} className="flex flex-wrap items-center gap-2 px-3 py-2 text-xs">
                <ShieldCheck aria-hidden="true" className="text-fg-subtle size-3.5" />
                <span className="text-fg-muted font-mono">{session.id}…</span>
                {session.current ? <Badge tone="success">this session</Badge> : null}
                <span className="text-2xs text-fg-subtle">
                  started {formatDateTime(session.createdAt)} · last used{" "}
                  {formatRelativeTime(session.lastSeenAt)}
                </span>
                <span className="ml-auto">
                  {session.current ? null : <RevokeSessionButton handle={session.id} />}
                </span>
              </li>
            ))}
          </ul>
        </PanelBody>
      </Panel>

      <div className="grid gap-3 sm:grid-cols-2">
        <Panel>
          <PanelHeader title="SSH keys" description="Used for git over SSH." />
          <PanelBody>
            <Link
              href="/settings/keys"
              className="text-accent flex items-center gap-1.5 text-xs hover:underline"
            >
              <Terminal aria-hidden="true" className="size-3.5" />
              Manage SSH keys
            </Link>
          </PanelBody>
        </Panel>
        <Panel>
          <PanelHeader title="Access tokens" description="Used as the HTTPS password." />
          <PanelBody>
            <Link
              href="/settings/tokens"
              className="text-accent flex items-center gap-1.5 text-xs hover:underline"
            >
              <KeyRound aria-hidden="true" className="size-3.5" />
              Manage access tokens
            </Link>
          </PanelBody>
        </Panel>
      </div>
    </div>
  );
}
