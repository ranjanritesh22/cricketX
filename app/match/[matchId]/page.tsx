import { redirect } from "next/navigation";
import { getMatchOr404 } from "@/lib/data";

export const dynamic = "force-dynamic";

/** Land on /live for in-play matches, /info otherwise (CLAUDE.md §6). */
export default async function MatchIndexPage({ params }: { params: Promise<{ matchId: string }> }) {
  const { matchId } = await params;
  const detail = await getMatchOr404(matchId);
  const target = detail.status === "live" || detail.status === "innings-break" ? "live" : "info";
  redirect(`/match/${matchId}/${target}`);
}
