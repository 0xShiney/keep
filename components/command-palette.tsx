"use client";

import * as Dialog from "@radix-ui/react-dialog";
import {
  ArrowRight,
  CircleDot,
  FileCode2,
  GitPullRequest,
  Hash,
  Plus,
  Search,
  Settings,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { Kbd } from "@/components/ui/feedback";
import { cn } from "@/lib/utils";

export interface PaletteRepo {
  fullName: string;
  name: string;
  description: string | null;
}

interface PaletteItem {
  id: string;
  label: string;
  hint?: string;
  group: string;
  icon: React.ReactNode;
  href: string;
}

export function CommandPalette({ repos }: { repos: PaletteRepo[] }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const isModifier = event.metaKey || event.ctrlKey;
      if (isModifier && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((value) => !value);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => inputRef.current?.focus(), 20);
    return () => window.clearTimeout(timer);
  }, [open]);

  function setPaletteOpen(next: boolean) {
    setOpen(next);
    if (!next) {
      setQuery("");
      setActive(0);
    }
  }

  const items = useMemo<PaletteItem[]>(() => {
    const actions: PaletteItem[] = [
      {
        id: "new-repo",
        label: "Create a repository",
        group: "Actions",
        icon: <Plus aria-hidden="true" className="size-3.5" />,
        href: "/new",
      },
      {
        id: "settings",
        label: "User settings",
        group: "Actions",
        icon: <Settings aria-hidden="true" className="size-3.5" />,
        href: "/settings",
      },
    ];

    const repoItems: PaletteItem[] = repos.map((repo) => ({
      id: `repo-${repo.fullName}`,
      label: repo.fullName,
      hint: repo.description ?? undefined,
      group: "Repositories",
      icon: <Hash aria-hidden="true" className="size-3.5" />,
      href: `/${repo.fullName}`,
    }));

    const repo = repos[0];
    const contextual: PaletteItem[] = repo
      ? [
          {
            id: "repo-code",
            label: `Browse ${repo.name} code`,
            group: "Current repository",
            icon: <FileCode2 aria-hidden="true" className="size-3.5" />,
            href: `/${repo.fullName}`,
          },
          {
            id: "repo-issues",
            label: `Issues in ${repo.name}`,
            group: "Current repository",
            icon: <CircleDot aria-hidden="true" className="size-3.5" />,
            href: `/${repo.fullName}/issues`,
          },
          {
            id: "repo-pulls",
            label: `Pull requests in ${repo.name}`,
            group: "Current repository",
            icon: <GitPullRequest aria-hidden="true" className="size-3.5" />,
            href: `/${repo.fullName}/pulls`,
          },
        ]
      : [];

    return [...actions, ...repoItems, ...contextual];
  }, [repos]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return items;
    return items.filter((item) =>
      `${item.label} ${item.hint ?? ""} ${item.group}`.toLowerCase().includes(needle),
    );
  }, [items, query]);

  const grouped = useMemo(() => {
    const map = new Map<string, PaletteItem[]>();
    for (const item of filtered) {
      const list = map.get(item.group) ?? [];
      list.push(item);
      map.set(item.group, list);
    }
    return [...map.entries()];
  }, [filtered]);

  function choose(item: PaletteItem | undefined) {
    if (!item) return;
    setPaletteOpen(false);
    router.push(item.href);
  }

  function onInputKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((value) => Math.min(value + 1, filtered.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((value) => Math.max(value - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      choose(filtered[active]);
    }
  }

  let runningIndex = -1;

  return (
    <>
      <button
        type="button"
        onClick={() => setPaletteOpen(true)}
        className="border-border bg-surface-1 text-fg-subtle hover:border-border-strong hover:text-fg-muted hidden h-8 min-w-56 items-center gap-2 rounded-md border px-2.5 text-xs transition-colors sm:flex"
        aria-label="Open command palette"
      >
        <Search aria-hidden="true" className="size-3.5" />
        <span className="flex-1 text-left">Search or jump to…</span>
        <Kbd>⌘K</Kbd>
      </button>
      <button
        type="button"
        onClick={() => setPaletteOpen(true)}
        className="border-border text-fg-muted inline-flex size-8 items-center justify-center rounded-md border sm:hidden"
        aria-label="Open command palette"
      >
        <Search aria-hidden="true" className="size-4" />
      </button>

      <Dialog.Root open={open} onOpenChange={setPaletteOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="bg-overlay fixed inset-0 z-50 backdrop-blur-[2px]" />
          <Dialog.Content
            className="border-border bg-surface-3 shadow-dialog fixed top-[12vh] left-1/2 z-50 w-[min(92vw,640px)] -translate-x-1/2 overflow-hidden rounded-lg border"
            aria-describedby={undefined}
          >
            <Dialog.Title className="sr-only">Command palette</Dialog.Title>
            <div className="border-border flex items-center gap-2 border-b px-3">
              <Search aria-hidden="true" className="text-fg-subtle size-4" />
              <input
                ref={inputRef}
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setActive(0);
                }}
                onKeyDown={onInputKeyDown}
                placeholder="Jump to a repository, issue, or action…"
                aria-label="Search commands"
                className="text-fg placeholder:text-fg-subtle h-11 w-full bg-transparent text-sm outline-none"
              />
              <Kbd>esc</Kbd>
            </div>
            <div className="max-h-[52vh] scrollbar-thin overflow-y-auto p-1.5">
              {filtered.length === 0 ? (
                <p className="text-fg-subtle px-3 py-6 text-center text-sm">No matches.</p>
              ) : (
                grouped.map(([group, groupItems]) => (
                  <div key={group} className="mb-1">
                    <p className="text-2xs text-fg-subtle px-2.5 pt-2 pb-1 font-medium tracking-wider uppercase">
                      {group}
                    </p>
                    <ul role="listbox" aria-label={group}>
                      {groupItems.map((item) => {
                        runningIndex += 1;
                        const index = runningIndex;
                        return (
                          <li key={item.id}>
                            <button
                              type="button"
                              role="option"
                              aria-selected={index === active}
                              onMouseEnter={() => setActive(index)}
                              onClick={() => choose(item)}
                              className={cn(
                                "flex w-full items-center gap-2.5 rounded-sm px-2.5 py-1.5 text-left text-sm",
                                index === active
                                  ? "bg-accent-subtle text-fg"
                                  : "text-fg-muted hover:bg-surface-2",
                              )}
                            >
                              <span className="text-fg-subtle">{item.icon}</span>
                              <span className="min-w-0 flex-1 truncate">{item.label}</span>
                              {item.hint ? (
                                <span className="text-2xs text-fg-subtle hidden max-w-48 truncate sm:block">
                                  {item.hint}
                                </span>
                              ) : null}
                              <ArrowRight aria-hidden="true" className="text-fg-subtle size-3" />
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))
              )}
            </div>
            <div className="border-border text-2xs text-fg-subtle flex items-center justify-between border-t px-3 py-2">
              <span className="flex items-center gap-1.5">
                <Kbd>↑</Kbd>
                <Kbd>↓</Kbd> to navigate
              </span>
              <span className="flex items-center gap-1.5">
                <Kbd>↵</Kbd> to open
              </span>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
