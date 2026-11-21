import Link from "next/link";
import { File, FileCode2, Folder, Link2 } from "lucide-react";
import type { TreeEntry } from "@/lib/forgejo/model";
import { formatBytes, formatRelativeTime } from "@/lib/utils";

const CODE_EXTENSIONS = new Set([
  "ts",
  "tsx",
  "js",
  "jsx",
  "json",
  "css",
  "scss",
  "html",
  "py",
  "go",
  "rs",
  "rb",
  "java",
  "kt",
  "c",
  "h",
  "cpp",
  "hpp",
  "cs",
  "php",
  "swift",
  "lua",
  "sh",
  "bash",
  "yml",
  "yaml",
  "toml",
  "sql",
]);

function EntryIcon({ entry }: { entry: TreeEntry }) {
  if (entry.type === "dir") {
    return <Folder aria-hidden="true" className="text-accent/80 size-4 shrink-0" />;
  }
  if (entry.type === "symlink") {
    return <Link2 aria-hidden="true" className="text-fg-subtle size-4 shrink-0" />;
  }
  const extension = entry.name.includes(".")
    ? entry.name.slice(entry.name.lastIndexOf(".") + 1).toLowerCase()
    : "";
  if (CODE_EXTENSIONS.has(extension)) {
    return <FileCode2 aria-hidden="true" className="text-fg-subtle size-4 shrink-0" />;
  }
  return <File aria-hidden="true" className="text-fg-subtle size-4 shrink-0" />;
}

export function FileTable({
  entries,
  owner,
  repo,
  gitRef,
  path,
}: {
  entries: TreeEntry[];
  owner: string;
  repo: string;
  gitRef: string;
  path: string;
}) {
  const encodedRef = encodeURIComponent(gitRef);
  const prefix = path ? `/${path.split("/").map(encodeURIComponent).join("/")}` : "";

  if (entries.length === 0) {
    return <p className="text-fg-subtle px-3 py-6 text-center text-xs">This directory is empty.</p>;
  }

  return (
    <ul className="divide-border divide-y">
      {entries.map((entry) => {
        const encodedName = entry.name.split("/").map(encodeURIComponent).join("/");
        const href =
          entry.type === "dir"
            ? `/${owner}/${repo}/tree/${encodedRef}${prefix}/${encodedName}`
            : `/${owner}/${repo}/blob/${encodedRef}${prefix}/${encodedName}`;
        return (
          <li key={entry.path} className="hover:bg-surface-2 transition-colors">
            <div className="flex items-center gap-2 px-3 py-1.5">
              <EntryIcon entry={entry} />
              <Link
                href={href}
                className="text-fg hover:text-accent min-w-0 flex-1 truncate text-xs hover:underline"
              >
                {entry.name}
                {entry.type === "dir" ? "/" : ""}
              </Link>
              <span className="text-2xs text-fg-subtle hidden max-w-[45%] min-w-0 flex-1 truncate md:block">
                {entry.type === "file" ? formatBytes(entry.size) : ""}
              </span>
              <span className="text-2xs text-fg-subtle hidden w-24 shrink-0 text-right sm:block">
                {entry.lastCommitWhen ? formatRelativeTime(entry.lastCommitWhen) : ""}
              </span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
