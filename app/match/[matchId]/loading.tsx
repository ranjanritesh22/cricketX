import { Skeleton } from "@/components/ui/skeleton";

/** Tab-content skeleton — the score header persists from the layout above. */
export default function MatchTabLoading() {
  return (
    <div className="space-y-4 py-4">
      <Skeleton className="h-44 rounded-2xl" />
      <Skeleton className="h-72 rounded-2xl" />
    </div>
  );
}
