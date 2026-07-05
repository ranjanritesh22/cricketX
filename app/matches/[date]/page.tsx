import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getFixtures } from "@/lib/data";
import { dateKey, dayLabel, isValidDateKey } from "@/lib/format";
import { Logo } from "@/components/brand/logo";
import { DateStrip } from "@/components/home/date-strip";
import { LiveFilterPill, MatchDayList } from "@/components/home/match-day";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ date: string }> }): Promise<Metadata> {
  const { date } = await params;
  return { title: `Matches on ${date}` };
}

export default async function MatchesByDatePage({
  params,
  searchParams,
}: {
  params: Promise<{ date: string }>;
  searchParams: Promise<{ live?: string }>;
}) {
  const [{ date }, { live }] = await Promise.all([params, searchParams]);
  if (!isValidDateKey(date)) notFound();

  const liveOnly = live === "1";
  const todayKey = dateKey(new Date());
  const fixtures = await getFixtures(date);
  const liveMatches = fixtures.filter((f) => f.status === "live" || f.status === "innings-break");
  const visible = liveOnly ? liveMatches : fixtures;
  const label = dayLabel(date, todayKey);

  return (
    <>
      <div className="flex items-center justify-between pt-4 pb-1">
        <Logo />
        <LiveFilterPill basePath={`/matches/${date}`} liveActive={liveOnly} liveCount={liveMatches.length} />
      </div>

      <div className="sticky top-0 z-30 -mx-3 bg-night/95 px-3 backdrop-blur sm:-mx-4 sm:px-4">
        <DateStrip activeKey={date} todayKey={todayKey} />
      </div>

      <div className="mt-2">
        <MatchDayList
          fixtures={visible}
          emptyLabel={liveOnly ? "Nothing live on this day" : `No matches ${label === "Today" ? "today" : `on ${label}`}`}
        />
      </div>
    </>
  );
}
