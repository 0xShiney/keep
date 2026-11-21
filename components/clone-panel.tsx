import { CopyButton } from "@/components/copy-button";

/**
 * Clone URLs in a native <details> disclosure: keyboard accessible, no JS bundle
 * cost, and it works before hydration.
 */
export function ClonePanel({ httpsUrl, sshUrl }: { httpsUrl: string; sshUrl: string }) {
  return (
    <details className="group relative">
      <summary className="border-border bg-surface-2 text-fg hover:border-border-strong hover:bg-surface-3 flex h-8 cursor-pointer list-none items-center gap-1.5 rounded-md border px-3 text-sm transition-colors [&::-webkit-details-marker]:hidden">
        <span aria-hidden="true" className="text-fg-subtle font-mono text-xs">
          {"</>"}
        </span>
        Clone
      </summary>
      <div className="border-border bg-surface-3 shadow-popover absolute right-0 z-30 mt-1.5 w-[min(92vw,420px)] rounded-lg border p-3">
        <p className="text-2xs text-fg-subtle mb-2 font-medium tracking-wider uppercase">
          Clone over HTTPS
        </p>
        <div className="flex items-center gap-2">
          <code className="border-border bg-surface-1 text-fg-muted flex-1 overflow-x-auto rounded-sm border px-2 py-1.5 font-mono text-xs whitespace-nowrap">
            {httpsUrl}
          </code>
          <CopyButton value={httpsUrl} label="Copy HTTPS clone URL" />
        </div>

        <p className="text-2xs text-fg-subtle mt-3 mb-2 font-medium tracking-wider uppercase">
          Clone over SSH
        </p>
        <div className="flex items-center gap-2">
          <code className="border-border bg-surface-1 text-fg-muted flex-1 overflow-x-auto rounded-sm border px-2 py-1.5 font-mono text-xs whitespace-nowrap">
            {sshUrl}
          </code>
          <CopyButton value={sshUrl} label="Copy SSH clone URL" />
        </div>
        <p className="text-2xs text-fg-subtle mt-2">
          HTTPS uses a personal access token as the password. SSH uses a key added under Settings.
        </p>
      </div>
    </details>
  );
}
