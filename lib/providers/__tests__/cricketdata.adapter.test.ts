/**
 * CricketData (api.cricapi.com) contract tests against recorded fixtures in
 * __fixtures__/cricketdata/ — the adapter never touches the network here.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CricketDataAdapter } from "../cricketdata.adapter";
import { ProviderNotConfiguredError, ProviderResponseError } from "../errors";

const FIXTURE_DIR = path.resolve(__dirname, "../__fixtures__/cricketdata");

function fixture(name: string): unknown {
  return JSON.parse(readFileSync(path.join(FIXTURE_DIR, `${name}.json`), "utf8"));
}

function stubFetch(overrides: Record<string, unknown> = {}): typeof fetch {
  return (async (input: string | URL | Request) => {
    const url = new URL(String(input));
    const endpoint = url.pathname.split("/").pop() ?? "";
    const body = overrides[endpoint] ?? fixture(endpoint);
    return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
}

function adapter(overrides?: Record<string, unknown>) {
  return new CricketDataAdapter({ apiKey: "test-key", fetchImpl: stubFetch(overrides) });
}

describe("CricketDataAdapter", () => {
  it("requires an API key", () => {
    const saved = process.env.CRICKETDATA_API_KEY;
    delete process.env.CRICKETDATA_API_KEY;
    expect(() => new CricketDataAdapter()).toThrow(ProviderNotConfiguredError);
    if (saved !== undefined) process.env.CRICKETDATA_API_KEY = saved;
  });

  it("merges current + scheduled matches and maps live state", async () => {
    const fixtures = await adapter().getFixtures("2026-07-02");
    expect(fixtures).toHaveLength(3);

    const live = fixtures.find((f) => f.id === "b2a3f8c1-1111-2222-3333-444455556666")!;
    expect(live.status).toBe("live");
    expect(live.teams.home.shortName).toBe("IND");
    expect(live.teams.away.shortName).toBe("ENG");
    expect(live.venue).toEqual({ name: "Wankhede Stadium", city: "Mumbai" });
    expect(live.innings[0]).toMatchObject({ runs: 189, wickets: 7, legalBalls: 120, oversText: "20" });
    expect(live.innings[1]).toMatchObject({ runs: 92, wickets: 3, legalBalls: 68, oversText: "11.2" });
    expect(live.battingTeamId).toBe(live.teams.away.id);
    expect(live.oversPerInnings).toBe(20);

    const finished = fixtures.find((f) => f.id === "c4d5e6f7-7777-8888-9999-000011112222")!;
    expect(finished.status).toBe("completed");
    expect(finished.statusText).toBe("Australia won by 24 runs");
    expect(finished.format).toBe("ODI");

    const upcoming = fixtures.find((f) => f.id === "d8e9f0a1-3333-4444-5555-666677778888")!;
    expect(upcoming.status).toBe("upcoming");
    expect(upcoming.innings).toEqual([]);
  });

  it("filters fixtures by date", async () => {
    const fixtures = await adapter().getFixtures("2026-07-05");
    expect(fixtures.map((f) => f.id)).toEqual(["e0f1a2b3-5555-6666-7777-888899990000"]);
  });

  it("maps scorecards including float overs", async () => {
    const scorecard = await adapter().getScorecard("b2a3f8c1-1111-2222-3333-444455556666");
    expect(scorecard.innings).toHaveLength(2);

    const first = scorecard.innings[0]!;
    expect(first.runs).toBe(189);
    expect(first.legalBalls).toBe(120);
    expect(first.extras.total).toBe(11);
    const rohit = first.batting.find((b) => b.playerName === "Rohit Sharma")!;
    expect(rohit).toMatchObject({ runs: 41, balls: 28, fours: 5, sixes: 1, isOut: true, dismissal: "c Salt b Rashid" });
    const wood = first.bowling.find((b) => b.playerName === "Mark Wood")!;
    expect(wood).toMatchObject({ oversText: "4", legalBalls: 24, wickets: 1, wides: 2, noballs: 1 });

    const second = scorecard.innings[1]!;
    expect(second.legalBalls).toBe(68);
    expect(second.oversText).toBe("11.2");
    const buttler = second.batting[0]!;
    expect(buttler.isOut).toBe(false);
    expect(buttler.dismissal).toBe("not out");
    const kuldeep = second.bowling[0]!;
    expect(kuldeep.legalBalls).toBe(14);
    expect(kuldeep.oversText).toBe("2.2");
  });

  it("maps toss on match_info", async () => {
    const withToss = {
      ...(fixture("currentMatches") as { data: unknown[] }).data[0]!,
      tossWinner: "England",
      tossChoice: "Field",
    };
    const detail = await adapter({
      match_info: { status: "success", data: withToss },
    }).getMatch("b2a3f8c1-1111-2222-3333-444455556666");
    expect(detail.toss).toEqual({ winnerTeamId: detail.teams.away.id, decision: "field" });
  });

  it("maps squads with role heuristics", async () => {
    const squads = await adapter().getSquads("b2a3f8c1-1111-2222-3333-444455556666");
    expect(squads.teams).toHaveLength(2);
    const india = squads.teams[0]!;
    expect(india.team.name).toBe("India");
    const pant = india.players.find((p) => p.name === "Rishabh Pant")!;
    expect(pant.role).toBe("wicketkeeper");
    expect(pant.battingHand).toBe("left");
    expect(pant.isKeeper).toBe(true);
    const hardik = india.players.find((p) => p.name === "Hardik Pandya")!;
    expect(hardik.role).toBe("allrounder");
  });

  it("maps series with fuzzy end dates and points tables", async () => {
    const series = await adapter().getSeries();
    const tour = series.find((s) => s.id === "aaa11111-bbbb-cccc-dddd-eeeeffff0000")!;
    expect(tour.formats).toEqual(["T20"]);
    expect(tour.startDate).toBe("2026-06-28");
    expect(tour.endDate).toBe("2026-07-06");

    const table = await adapter().getPointsTable("eee55555-ffff-0000-1111-222233334444");
    expect(table.groups[0]?.rows).toHaveLength(3);
    expect(table.groups[0]?.rows[0]).toMatchObject({ teamShortName: "MINY", played: 5, won: 4, points: 8 });
  });

  it("maps player profiles", async () => {
    const player = await adapter().getPlayer("p1-kohli");
    expect(player).toMatchObject({ name: "Virat Kohli", role: "batter", battingHand: "right", born: "1988-11-05" });
  });

  it("throws a typed error on failure envelopes", async () => {
    const failing = adapter({ currentMatches: { status: "failure", reason: "API key limit reached" } });
    await expect(failing.getFixtures("2026-07-02")).rejects.toThrow(ProviderResponseError);
  });

  it("throws a typed error when the payload shape is garbage", async () => {
    const garbage = adapter({
      currentMatches: { status: "success", data: { totally: "wrong" } },
      matches: { status: "success", data: { also: "wrong" } },
    });
    await expect(garbage.getFixtures("2026-07-02")).rejects.toThrow(ProviderResponseError);
  });

  it("caches within the TTL window", async () => {
    let calls = 0;
    const counting = (async (input: string | URL | Request) => {
      calls += 1;
      return stubFetch()(input as string);
    }) as typeof fetch;
    const a = new CricketDataAdapter({ apiKey: "k", fetchImpl: counting });
    await a.getSeries();
    await a.getSeries();
    expect(calls).toBe(1);
  });
});
