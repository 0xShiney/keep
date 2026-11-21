"use client";

import { GitBranch, Tag } from "lucide-react";
import { useRouter } from "next/navigation";

export function RefSwitcher({
  owner,
  repo,
  current,
  branches,
  tags,
  mode,
  path,
}: {
  owner: string;
  repo: string;
  current: string;
  branches: { name: string; isDefault: boolean }[];
  tags: { name: string }[];
  mode: "tree" | "blob" | "commits";
  path?: string;
}) {
  const router = useRouter();

  function onChange(event: React.ChangeEvent<HTMLSelectElement>) {
    const ref = event.target.value;
    const encoded = encodeURIComponent(ref);
    const suffix = path ? `/${path.split("/").map(encodeURIComponent).join("/")}` : "";
    const target =
      mode === "tree"
        ? `/${owner}/${repo}/tree/${encoded}${suffix}`
        : mode === "blob"
          ? `/${owner}/${repo}/blob/${encoded}${suffix}`
          : `/${owner}/${repo}/commits?ref=${encoded}`;
    router.push(target);
  }

  return (
    <div className="relative inline-flex items-center">
      <label htmlFor="ref-switcher" className="sr-only">
        Branch or tag
      </label>
      <span aria-hidden="true" className="text-fg-subtle pointer-events-none absolute left-2">
        {tags.some((tag) => tag.name === current) ? (
          <Tag className="size-3.5" />
        ) : (
          <GitBranch className="size-3.5" />
        )}
      </span>
      <select
        id="ref-switcher"
        value={current}
        onChange={onChange}
        className="border-border bg-surface-2 text-fg hover:border-border-strong focus-visible:border-ring focus-visible:outline-ring h-8 min-w-40 appearance-none rounded-md border pr-7 pl-7 text-xs focus-visible:outline-2 focus-visible:outline-offset-1"
      >
        <optgroup label="Branches">
          {branches.map((branch) => (
            <option key={branch.name} value={branch.name}>
              {branch.name}
              {branch.isDefault ? " (default)" : ""}
            </option>
          ))}
        </optgroup>
        {tags.length > 0 ? (
          <optgroup label="Tags">
            {tags.map((tag) => (
              <option key={tag.name} value={tag.name}>
                {tag.name}
              </option>
            ))}
          </optgroup>
        ) : null}
      </select>
      <span
        aria-hidden="true"
        className="text-2xs text-fg-subtle pointer-events-none absolute right-2"
      >
        ▾
      </span>
    </div>
  );
}
