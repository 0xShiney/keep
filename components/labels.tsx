import type { Label } from "@/lib/forgejo/model";
import { badgeStyle } from "@/lib/label-style";

export function LabelChip({ label }: { label: Label }) {
  return (
    <span
      className="text-2xs inline-flex items-center rounded-full border border-transparent px-2 py-0.5 font-medium"
      style={badgeStyle(label.color)}
    >
      {label.name}
    </span>
  );
}

export function LabelList({ labels }: { labels: Label[] }) {
  if (labels.length === 0) return null;
  return (
    <span className="flex flex-wrap items-center gap-1">
      {labels.map((label) => (
        <LabelChip key={label.id} label={label} />
      ))}
    </span>
  );
}
