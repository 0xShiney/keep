"use client";

import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { KeyRound, LogOut, Settings, Terminal, User } from "lucide-react";
import Link from "next/link";
import { Avatar } from "@/components/avatar";

const itemClass =
  "flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-fg-muted outline-none data-[highlighted]:bg-surface-2 data-[highlighted]:text-fg";

export function UserMenu({ login, avatarUrl }: { login: string; avatarUrl: string | null }) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger
        className="focus-visible:outline-ring inline-flex items-center gap-1.5 rounded-md p-0.5 outline-none focus-visible:outline-2 focus-visible:outline-offset-2"
        // The visible text is the avatar initials; the accessible name must contain it.
        aria-label={`${login.slice(0, 1).toUpperCase()} · Account menu for ${login}`}
      >
        <Avatar name={login} src={avatarUrl} size={24} />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={8}
          className="border-border bg-surface-3 shadow-popover z-50 min-w-52 rounded-lg border p-1"
        >
          <div className="px-2 py-1.5">
            <p className="text-fg text-xs font-medium">{login}</p>
            <p className="text-2xs text-fg-subtle">Owner</p>
          </div>
          <DropdownMenu.Separator className="bg-border my-1 h-px" />
          <DropdownMenu.Item asChild>
            <Link href="/settings" className={itemClass}>
              <User aria-hidden="true" className="size-3.5" /> Profile & appearance
            </Link>
          </DropdownMenu.Item>
          <DropdownMenu.Item asChild>
            <Link href="/settings/keys" className={itemClass}>
              <Terminal aria-hidden="true" className="size-3.5" /> SSH keys
            </Link>
          </DropdownMenu.Item>
          <DropdownMenu.Item asChild>
            <Link href="/settings/tokens" className={itemClass}>
              <KeyRound aria-hidden="true" className="size-3.5" /> Access tokens
            </Link>
          </DropdownMenu.Item>
          <DropdownMenu.Item asChild>
            <Link href="/settings#sessions" className={itemClass}>
              <Settings aria-hidden="true" className="size-3.5" /> Sessions
            </Link>
          </DropdownMenu.Item>
          <DropdownMenu.Separator className="bg-border my-1 h-px" />
          <form action="/api/auth/logout" method="post">
            <DropdownMenu.Item asChild>
              <button type="submit" className={`${itemClass} w-full`}>
                <LogOut aria-hidden="true" className="size-3.5" /> Sign out
              </button>
            </DropdownMenu.Item>
          </form>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
