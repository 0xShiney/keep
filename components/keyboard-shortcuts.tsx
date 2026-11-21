"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Kbd } from "@/components/ui/feedback";

const SEQUENCES: Record<string, string> = {
  d: "/",
  c: "/",
  i: "/?view=issues",
  p: "/?view=pulls",
};

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName.toLowerCase();
  return (
    tag === "input" ||
    tag === "textarea" ||
    tag === "select" ||
    target.isContentEditable ||
    target.closest("[role='dialog']") !== null
  );
}

/**
 * Global keyboard shortcuts: `g` sequences, `/` to focus search, `?` for help.
 * Sequences are intentionally simple and never fire while typing.
 */
export function KeyboardShortcuts() {
  const [helpOpen, setHelpOpen] = useState(false);
  const pending = useRef<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    let timer: number | undefined;

    function onKeyDown(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (isTypingTarget(event.target)) return;

      if (event.key === "?") {
        event.preventDefault();
        setHelpOpen((value) => !value);
        return;
      }

      if (event.key === "/") {
        const target = document.querySelector<HTMLInputElement>("[data-search-input]");
        if (target) {
          event.preventDefault();
          target.focus();
        }
        return;
      }

      if (event.key === "g") {
        pending.current = "g";
        window.clearTimeout(timer);
        timer = window.setTimeout(() => {
          pending.current = null;
        }, 1200);
        return;
      }

      if (pending.current === "g") {
        const destination = SEQUENCES[event.key];
        pending.current = null;
        window.clearTimeout(timer);
        if (destination) {
          event.preventDefault();
          router.push(destination);
        }
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.clearTimeout(timer);
    };
  }, [router]);

  const rows = [
    { keys: "g d", action: "Go to dashboard" },
    { keys: "g c", action: "Go to code" },
    { keys: "g i", action: "Go to issues" },
    { keys: "g p", action: "Go to pull requests" },
    { keys: "⌘K / Ctrl K", action: "Open command palette" },
    { keys: "/", action: "Focus search" },
    { keys: "?", action: "Show this help" },
  ];

  return (
    <Dialog.Root open={helpOpen} onOpenChange={setHelpOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className="bg-overlay fixed inset-0 z-50" />
        <Dialog.Content
          className="border-border bg-surface-3 shadow-dialog fixed top-1/2 left-1/2 z-50 w-[min(92vw,420px)] -translate-x-1/2 -translate-y-1/2 rounded-lg border p-4"
          aria-describedby={undefined}
        >
          <Dialog.Title className="text-fg text-sm font-semibold">Keyboard shortcuts</Dialog.Title>
          <dl className="mt-3 flex flex-col gap-2">
            {rows.map((row) => (
              <div key={row.keys} className="flex items-center justify-between gap-4 text-sm">
                <dt className="text-fg-muted">{row.action}</dt>
                <dd className="flex gap-1">
                  {row.keys.split(" ").map((key, index) => (
                    <Kbd key={`${row.keys}-${index}`}>{key}</Kbd>
                  ))}
                </dd>
              </div>
            ))}
          </dl>
          <Dialog.Close className="border-border text-fg-muted hover:bg-surface-2 mt-4 w-full rounded-sm border py-1.5 text-xs">
            Close
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
