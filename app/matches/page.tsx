import { redirect } from "next/navigation";
import { dateKey } from "@/lib/format";

export const dynamic = "force-dynamic";

export default function MatchesIndexPage() {
  redirect(`/matches/${dateKey(new Date())}`);
}
