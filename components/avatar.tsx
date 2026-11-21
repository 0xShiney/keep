import { cn, initials } from "@/lib/utils";

export function Avatar({
  name,
  src,
  size = 20,
  className,
}: {
  name: string;
  src?: string | null;
  size?: number;
  className?: string;
}) {
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- avatars come from Forgejo's origin
      <img
        src={src}
        alt=""
        width={size}
        height={size}
        className={cn("border-border rounded-full border object-cover", className)}
      />
    );
  }

  return (
    <span
      aria-hidden="true"
      style={{ width: size, height: size, fontSize: Math.max(9, size * 0.4) }}
      className={cn(
        "border-border bg-surface-3 text-fg-muted inline-flex items-center justify-center rounded-full border font-medium",
        className,
      )}
    >
      {initials(name)}
    </span>
  );
}
