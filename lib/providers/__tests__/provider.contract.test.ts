/**
 * Provider contract tests (CLAUDE.md §9): every adapter must return canonical,
 * internally-consistent data. Run against the mock (frozen clock) and the
 * Cricsheet adapter (real recorded match: IND v AUS, Women's T20 WC, Lord's).
 */
import path from "node:path";
import { describe, expect, it } from "vitest";
import { dateKey } from "@/lib/format";
import { CricsheetAdapter } from "../cricsheet.adapter";
import { MockAdapter } from "../mock.adapter";
import { PlayerNotFoundError } from "../errors";
import type { CricketDataProvider } from "../provider.interface";
import type { InningsScorecard, Scorecard } from "../types";

const FROZEN = new Date("2026-07-02T12:00:00Z");
const FIXTURE_DIR = path.resolve(__dirname, "../__fixtures__/cricsheet");

const mock = new MockAdapter({ now: () => FROZEN });
const cricsheet = new CricsheetAdapter({ dir: FIXTURE_DIR });

function assertInningsConsistent(innings: InningsScorecard) {
  const batterRuns = innings.batting.reduce((sum, b) => sum + b.runs, 0);
  expect(batterRuns + innings.extras.total, `innings ${innings.number} total`).toBe(innings.runs);

  // Balls faced counts no-balls (the batter plays them); legal balls does not.
  const ballsFaced = innings.batting.reduce((sum, b) => sum + b.balls, 0);
  expect(ballsFaced, `innings ${innings.number} balls faced`).toBeGreaterThanOrEqual(innings.legalBalls);
  expect(ballsFaced, `innings ${innings.number} balls faced`).toBeLessThanOrEqual(
    innings.legalBalls + innings.extras.noballs,
  );

  const ballsBowled = innings.bowling.reduce((sum, b) => sum + b.legalBalls, 0);
  expect(ballsBowled, `innings ${innings.number} balls bowled`).toBe(innings.legalBalls);

  const conceded = innings.bowling.reduce((sum, b) => sum + b.runs, 0);
  expect(conceded, `innings ${innings.number} bowler-conceded`).toBe(
    innings.runs - innings.extras.byes - innings.extras.legbyes - innings.extras.penalty,
  );

  const bowlerWickets = innings.bowling.reduce((sum, b) => sum + b.wickets, 0);
  expect(bowlerWickets, `innings ${innings.number} bowler wickets`).toBeLessThanOrEqual(innings.wickets);

  expect(innings.fallOfWickets, `innings ${innings.number} FoW count`).toHaveLength(innings.wickets);
  for (let i = 1; i < innings.fallOfWickets.length; i++) {
    expect(innings.fallOfWickets[i]!.runs).toBeGreaterThanOrEqual(innings.fallOfWickets[i - 1]!.runs);
  }

  const outCount = innings.batting.filter((b) => b.isOut).length;
  expect(outCount, `innings ${innings.number} dismissed batters`).toBe(innings.wickets);
}

function assertScorecardConsistent(scorecard: Scorecard) {
  for (const innings of scorecard.innings) assertInningsConsistent(innings);
}

async function firstMatchId(provider: CricketDataProvider, date: string): Promise<string> {
  const fixtures = await provider.getFixtures(date);
  expect(fixtures.length).toBeGreaterThan(0);
  return fixtures[0]!.id;
}

describe.each([
  ["mock", mock, dateKey(FROZEN)],
  ["cricsheet", cricsheet, "2026-06-28"],
] as const)("%s adapter contract", (_name, provider, date) => {
  it("returns fixtures for the date with the required shape", async () => {
    const fixtures = await provider.getFixtures(date);
    expect(fixtures.length).toBeGreaterThan(0);
    for (const f of fixtures) {
      expect(f.id).toBeTruthy();
      expect(f.seriesName).toBeTruthy();
      expect(f.teams.home.shortName).toBeTruthy();
      expect(f.teams.away.shortName).toBeTruthy();
      expect(f.dateKey).toBe(date);
      expect(f.statusText).toBeTypeOf("string");
      for (const i of f.innings) {
        expect(i.legalBalls).toBeGreaterThanOrEqual(0);
        expect(i.oversText).toBeTruthy();
      }
    }
  });

  it("returns an empty list for a dateless day", async () => {
    expect(await provider.getFixtures("1999-01-01")).toEqual([]);
  });

  it("matches fixture innings summaries to the scorecard", async () => {
    const id = await firstMatchId(provider, date);
    const [detail, scorecard] = await Promise.all([provider.getMatch(id), provider.getScorecard(id)]);
    expect(detail.id).toBe(id);
    expect(scorecard.innings.length).toBe(detail.innings.length);
    detail.innings.forEach((summary, idx) => {
      const card = scorecard.innings[idx]!;
      expect(card.runs).toBe(summary.runs);
      expect(card.wickets).toBe(summary.wickets);
      expect(card.legalBalls).toBe(summary.legalBalls);
      expect(card.battingTeamId).toBe(summary.battingTeamId);
    });
  });

  it("returns internally consistent scorecards", async () => {
    const id = await firstMatchId(provider, date);
    assertScorecardConsistent(await provider.getScorecard(id));
  });

  it("streams ball events in order and filters sinceBall", async () => {
    const id = await firstMatchId(provider, date);
    const all = await provider.getBallByBall(id);
    expect(all.length).toBeGreaterThan(0);
    for (let i = 1; i < all.length; i++) {
      const prev = all[i - 1]!;
      const cur = all[i]!;
      const ordered =
        cur.innings > prev.innings || (cur.innings === prev.innings && cur.over >= prev.over);
      expect(ordered, `event ${i} ordering`).toBe(true);
    }
    for (const e of all) {
      expect(e.matchId).toBe(id);
      expect(e.commentaryText).toBeTruthy();
      expect(e.runs.total).toBe(e.runs.batter + e.runs.extras);
      expect(e.timestamp).toBeTruthy();
    }

    const pivot = all[Math.floor(all.length / 2)]!;
    const since = { innings: pivot.innings, over: pivot.over, ball: pivot.ball };
    const after = await provider.getBallByBall(id, since);
    expect(after.length).toBeLessThan(all.length);
    for (const e of after) {
      const isAfter =
        e.innings > since.innings ||
        (e.innings === since.innings && (e.over > since.over || (e.over === since.over && e.ball > since.ball)));
      expect(isAfter).toBe(true);
    }
  });

  it("returns full squads", async () => {
    const id = await firstMatchId(provider, date);
    const squads = await provider.getSquads(id);
    expect(squads.matchId).toBe(id);
    expect(squads.teams).toHaveLength(2);
    for (const { team, players } of squads.teams) {
      expect(team.id).toBeTruthy();
      expect(players.length).toBe(11);
      for (const p of players) {
        expect(p.id).toBeTruthy();
        expect(p.name).toBeTruthy();
      }
    }
  });

  it("lists series", async () => {
    const series = await provider.getSeries();
    expect(series.length).toBeGreaterThan(0);
    for (const s of series) {
      expect(s.id).toBeTruthy();
      expect(s.name).toBeTruthy();
      expect(s.formats.length).toBeGreaterThan(0);
    }
  });

  it("rejects unknown matches and players", async () => {
    await expect(provider.getMatch("no-such-match")).rejects.toThrow();
    await expect(provider.getPlayer("no-such-player")).rejects.toThrow(PlayerNotFoundError);
  });
});

describe("mock adapter — the reference live scenario", () => {
  const LIVE_ID = "eng-in-ind-2026-t20i-3";

  it("shows IND 189/7 v ENG 92/3 (11.2) live at the Wankhede", async () => {
    const detail = await mock.getMatch(LIVE_ID);
    expect(detail.status).toBe("live");
    expect(detail.venue.name).toBe("Wankhede Stadium");
    expect(detail.statusText).toBe("England need 98 off 52 balls");
    expect(detail.innings[0]).toMatchObject({ runs: 189, wickets: 7, legalBalls: 120 });
    expect(detail.innings[1]).toMatchObject({ runs: 92, wickets: 3, legalBalls: 68 });
    expect(detail.lastBall).toEqual({ innings: 2, over: 11, ball: 2 });
  });

  it("carries the CLAUDE.md reference commentary for the synthesizer", async () => {
    const events = await mock.getBallByBall(LIVE_ID);
    const cut = events.find((e) => e.innings === 1 && e.over === 17 && e.ball === 4);
    expect(cut?.commentaryText).toContain("cuts to the right of sweeper cover");
    const stumping = events.find((e) => e.wicket?.kind === "stumped");
    expect(stumping?.wicket).toEqual({ kind: "stumped", playerOutId: "p-axar", fielderIds: ["p-buttler"] });
    expect(stumping?.commentaryText).toContain("googly");
  });

  it("keeps every match in the universe internally consistent", async () => {
    const days = [-3, -1, 0];
    for (const offset of days) {
      const d = new Date(FROZEN);
      d.setDate(d.getDate() + offset);
      for (const fixture of await mock.getFixtures(dateKey(d))) {
        assertScorecardConsistent(await mock.getScorecard(fixture.id));
      }
    }
  });

  it("serves the MLC points table", async () => {
    const table = await mock.getPointsTable("ser-mlc-2026");
    expect(table.groups[0]?.rows).toHaveLength(6);
    expect(table.groups[0]?.rows[0]).toMatchObject({ teamShortName: "MINY", points: 8 });
  });

  it("resolves players from profiles and squad fallback", async () => {
    const kohli = await mock.getPlayer("p-kohli");
    expect(kohli.name).toBe("Virat Kohli");
    expect(kohli.batting?.T20?.runs).toBeGreaterThan(0);
    const brook = await mock.getPlayer("p-brook");
    expect(brook.name).toBe("Harry Brook");
  });
});

describe("cricsheet adapter — recorded IND v AUS (1490706)", () => {
  const ID = "1490706";

  it("maps the match header faithfully", async () => {
    const detail = await cricsheet.getMatch(ID);
    expect(detail.teams.home.name).toBe("India");
    expect(detail.teams.away.name).toBe("Australia");
    expect(detail.venue.name).toContain("Lord's");
    expect(detail.seriesName).toContain("ICC Women's T20 World Cup");
    expect(detail.status).toBe("completed");
    expect(detail.resultText).toBe("Australia won by 6 wickets");
    expect(detail.toss).toEqual({ winnerTeamId: "t-india", decision: "bat" });
    expect(detail.format).toBe("T20");
  });

  it("aggregates the known totals from raw deliveries", async () => {
    const scorecard = await cricsheet.getScorecard(ID);
    expect(scorecard.innings[0]).toMatchObject({ runs: 170, wickets: 4, oversText: "20", legalBalls: 120 });
    expect(scorecard.innings[1]).toMatchObject({ runs: 172, wickets: 4, oversText: "19", legalBalls: 114 });
  });

  it("returns an empty points table (not derivable from match files)", async () => {
    const table = await cricsheet.getPointsTable("cs-anything");
    expect(table.groups).toEqual([]);
  });
});
