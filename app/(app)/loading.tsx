import { Skeleton, SkeletonHeader, SkeletonRows } from "@/components/ui/skeleton";

export default function AppLoading() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading…</span>
      <SkeletonHeader />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="border-border bg-surface-1 rounded-md border py-2">
          <SkeletonRows rows={6} />
        </div>
        <div className="flex flex-col gap-3">
          <div className="border-border bg-surface-1 rounded-md border p-3">
            <Skeleton className="mb-3 h-4 w-32" />
            <SkeletonRows rows={3} />
          </div>
          <div className="border-border bg-surface-1 rounded-md border p-3">
            <Skeleton className="mb-3 h-4 w-24" />
            <SkeletonRows rows={3} />
          </div>
        </div>
      </div>
    </div>
  );
}
