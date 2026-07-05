import { Skeleton } from "@/components/ui/skeleton";

/** Skeleton mirrors the final home layout — no jump on load (CLAUDE.md §8). */
export default function HomeLoading() {
  return (
    <>
      <div className="flex items-center justify-between pt-4 pb-1">
        <Skeleton className="h-7 w-32" />
        <Skeleton className="h-7 w-20 rounded-full" />
      </div>
      <div className="flex gap-1.5 py-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-7 w-20 rounded-full" />
        ))}
      </div>
      <div className="mt-2 space-y-4">
        <Skeleton className="h-48 rounded-2xl" />
        <Skeleton className="h-40 rounded-2xl" />
        <Skeleton className="h-40 rounded-2xl" />
      </div>
    </>
  );
}
