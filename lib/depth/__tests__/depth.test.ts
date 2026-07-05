/**
 * Phase 5 depth logic — ratings, chart builders, H2H — asserted against the
 * hand-balanced mock universe AND the real bundled Cricsheet match, so the
 * math is proven on messy real data, not just curated fixtures.
 */
import { describe, expect, it } from "vitest";
import { buildMockUniverse } from "@/lib/providers/mock-data";
import { CricsheetAdapter } from "@/lib/providers/cricsheet.adapter";
import { buildHeadToHead, seriesDateKeys, winnerTeamId } from "@/lib/depth/h2h";
import { fieldingCredits, matchRatings, ratingTone } from "@/lib/depth/ratings";
import {
  batterWagon,
  bowlerDeliveries,
  eventsOfInnings,
  inningsBallCoverage,
  manhattanSeries,
  partnershipSeries,
  wormSeries,
} from "@/lib/depth/stats";

const NOW = new Date("2026-07-04T10:00:00Z");
const universe = buildMockUniverse(NOW);
const LIVE_ID = "eng-in-ind-2026-t20i-3";
const liveCard = universe.scorecards[LIVE_ID]!;

describe("matchRatings", () => {
  const ratings = matchRatings(liveCard, "T20");

  it("rates a match-defining innings near the top of the scale", () => {
    const kohli = ratings.get("p-kohli")!; // 67 (45)
    expect(kohli.batted).toBe(true);
    expect(kohli.rating).toBeGreaterThanOrEqual(8);
    expect(kohli.rating).toBeLessThanOrEqual(10);
  });

  it("rewards wickets and a tight economy", () => {
    const rashid = ratings.get("p-rashid")!; // 4-0-27-2 + a catch... no, 2 wickets
    expect(rashid.bowled).toBe(true);
    expect(rashid.rating).toBeGreaterThan(6.5);
    const jordan = ratings.get("p-jordan")!; // 4-0-39-2 — pricier, still solid
    expect(rashid.rating).toBeGreaterThan(jordan.rating);
  });

  it("punishes a duck below par", () => {
    const livingstone = ratings.get("p-livingstone")!; // 0 (3) lbw + 2-0-19-0 bowling
    const buttler = ratings.get("p-buttler")!; // 43* (31)
    expect(buttler.rating).toBeGreaterThan(livingstone.rating);
  });

  it("gives no rating to players yet to be involved", () => {
    expect(ratings.get("p-bethell")).toBeUndefined(); // yet to bat, hasn't bowled
  });

  it("stays inside 0–10 with one-decimal precision", () => {
    for (const r of ratings.values()) {
      expect(r.rating).toBeGreaterThanOrEqual(1);
      expect(r.rating).toBeLessThanOrEqual(10);
      expect(Math.round(r.rating * 10) / 10).toBe(r.rating);
    }
  });

  it("parses fielding credits from dismissal text", () => {
    // Buttler stumped Axar in innings 1 → England fielding credit.
    expect(fieldingCredits(liveCard, "t-eng", "Buttler")).toBeGreaterThanOrEqual(1);
    // Livingstone ran out Pant ("run out (Livingstone)").
    expect(fieldingCredits(liveCard, "t-eng", "Livingstone")).toBeGreaterThanOrEqual(1);
    expect(fieldingCredits(liveCard, "t-ind", "Buttler")).toBe(0);
  });

  it("maps tones for the badge", () => {
    expect(ratingTone(8.4)).toBe("top");
    expect(ratingTone(7.1)).toBe("good");
    expect(ratingTone(5.5)).toBe("ok");
    expect(ratingTone(3)).toBe("poor");
  });
});

describe("partnershipSeries", () => {
  it("reconstructs every stand and foots to the innings total (mock)", () => {
    for (const inn of liveCard.innings) {
      const stands = partnershipSeries(inn);
      const sum = stands.reduce((acc, s) => acc + s.runs, 0);
      expect(sum).toBe(inn.runs);
      // A broken stand exists per fall of wicket.
      expect(stands.filter((s) => !s.unbroken)).toHaveLength(inn.fallOfWickets.length);
    }
  });

  it("names the unbroken pair currently at the crease", () => {
    const stands = partnershipSeries(liveCard.innings[1]!);
    const last = stands.at(-1)!;
    expect(last.unbroken).toBe(true);
    expect(last.names.sort()).toEqual(["Jos Buttler", "Will Jacks"]);
    expect(last.runs).toBe(92 - 68);
  });
});

describe("worm / manhattan / coverage (real Cricsheet match)", () => {
  it("cross-checks against the recorded scorecard", async () => {
    const adapter = new CricsheetAdapter({ dir: "data/cricsheet" });
    const scorecard = await adapter.getScorecard("1490706");
    const events = await adapter.getBallByBall("1490706");

    for (const inn of scorecard.innings) {
      const innEvents = eventsOfInnings(events, inn.number);
      expect(inningsBallCoverage(innEvents, inn)).toBe(true);

      // Worm's final point equals the innings total.
      const worm = wormSeries(innEvents);
      expect(worm.at(-1)!.runs).toBe(inn.runs);
      expect(worm.filter((p) => p.wicket)).toHaveLength(inn.fallOfWickets.length);

      // Manhattan sums back to the innings total.
      const bars = manhattanSeries(innEvents);
      expect(bars.reduce((acc, b) => acc + b.runs, 0)).toBe(inn.runs);
      expect(bars.reduce((acc, b) => acc + b.wickets, 0)).toBe(inn.fallOfWickets.length);

      // Partnerships foot on real data too.
      const stands = partnershipSeries(inn);
      expect(stands.reduce((acc, s) => acc + s.runs, 0)).toBe(inn.runs);
    }
  });

  it("flags the mock live match's sampled window as incomplete", () => {
    const events = eventsOfInnings(universe.balls[LIVE_ID]!, 2);
    expect(inningsBallCoverage(events, liveCard.innings[1]!)).toBe(false);
  });
});

describe("wagon wheels & bowler scatter", () => {
  const events = universe.balls[LIVE_ID]!;
  const squads = universe.squads[LIVE_ID]!;

  it("collects only the batter's scoring deliveries", () => {
    const wagon = batterWagon(events, "p-jacks", squads);
    expect(wagon.length).toBeGreaterThan(0);
    for (const { event, shot } of wagon) {
      expect(event.batterId).toBe("p-jacks");
      expect(event.runs.batter).toBeGreaterThan(0);
      expect(shot.wagonZone).toBeGreaterThanOrEqual(1);
      expect(shot.wagonZone).toBeLessThanOrEqual(8);
    }
  });

  it("collects every delivery for a bowler with parsed line/length", () => {
    const balls = bowlerDeliveries(events, "p-bumrah", squads);
    expect(balls.length).toBeGreaterThan(0);
    for (const { event, shot } of balls) {
      expect(event.bowlerId).toBe("p-bumrah");
      expect(["yorker", "full", "good", "short", "bouncer"]).toContain(shot.length);
      expect(["off", "middle", "leg", "wide-off", "wide-leg"]).toContain(shot.line);
    }
  });
});

describe("head-to-head", () => {
  const fixtures = universe.fixtures;
  const [ind, eng] = [fixtures[0]!.teams.home, fixtures[0]!.teams.away];

  it("derives the winner from the result sentence", () => {
    const m1 = fixtures.find((f) => f.id === "eng-in-ind-2026-t20i-1")!;
    expect(winnerTeamId(m1)).toBe("t-ind");
    const m2 = fixtures.find((f) => f.id === "eng-in-ind-2026-t20i-2")!;
    expect(winnerTeamId(m2)).toBe("t-eng");
    const live = fixtures.find((f) => f.id === LIVE_ID)!;
    expect(winnerTeamId(live)).toBeNull(); // not completed
  });

  it("summarizes the rivalry and each side's form", () => {
    const h2h = buildHeadToHead(fixtures, ind, eng, "Arun Jaitley Stadium");
    expect(h2h.meetings).toHaveLength(2);
    expect(h2h.wins["t-ind"]).toBe(1);
    expect(h2h.wins["t-eng"]).toBe(1);
    expect(h2h.noResults).toBe(0);
    // Newest first: ENG won the 2nd T20I yesterday, IND the 1st three days ago.
    expect(h2h.form["t-ind"]).toEqual(["L", "W"]);
    expect(h2h.form["t-eng"]).toEqual(["W", "L"]);
    expect(h2h.atVenue).toHaveLength(1);
    expect(h2h.atVenue[0]!.id).toBe("eng-in-ind-2026-t20i-2");
  });

  it("dedupes fixtures collected across overlapping date scans", () => {
    const doubled = [...fixtures, ...fixtures];
    const h2h = buildHeadToHead(doubled, ind, eng);
    expect(h2h.meetings).toHaveLength(2);
  });

  it("caps the series date window", () => {
    const keys = seriesDateKeys(
      { id: "s", name: "S", formats: ["T20"], startDate: "2026-01-01", endDate: "2026-12-31" },
      NOW,
      21,
    );
    expect(keys).toHaveLength(21);
    expect(keys.at(-1)).toBe("2026-12-31");
    const noSeries = seriesDateKeys(undefined, NOW, 21);
    expect(noSeries.length).toBeLessThanOrEqual(21);
  });
});
