import { getFixtures } from "@/lib/data";
import { dateKey } from "@/lib/format";
import { Logo } from "@/components/brand/logo";
import { DateStrip } from "@/components/home/date-strip";
import { FeaturedHero } from "@/components/home/featured-hero";
import { LiveFilterPill, MatchDayList } from "@/components/home/match-day";

export const dynamic = "force-dynamic";

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ live?: string }>;
}) {
  const { live } = await searchParams;
  const liveOnly = live === "1";
  const todayKey = dateKey(new Date());
  const fixtures = await getFixtures(todayKey);

  const liveMatches = fixtures.filter((f) => f.status === "live" || f.status === "innings-break");
  const featured = liveMatches[0];
  const visible = liveOnly ? liveMatches : fixtures;
  const listFixtures = featured && !liveOnly ? visible.filter((f) => f.id !== featured.id) : visible;

  return (
    <>
      <div className="flex items-center justify-between pt-4 pb-1">
        <Logo />
        <LiveFilterPill basePath="/" liveActive={liveOnly} liveCount={liveMatches.length} />
      </div>

      <div className="sticky top-0 z-30 -mx-3 bg-night/95 px-3 backdrop-blur sm:-mx-4 sm:px-4">
        <DateStrip activeKey={todayKey} todayKey={todayKey} />
      </div>

      <div className="mt-2 space-y-4">
        {featured && !liveOnly ? <FeaturedHero fixture={featured} /> : null}
        <MatchDayList
          fixtures={listFixtures}
          emptyLabel={liveOnly ? "Nothing live right now" : "No matches today"}
        />
      </div>
    </>
  );
}
