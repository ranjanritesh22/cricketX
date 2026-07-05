import { describe, expect, it } from "vitest";
import {
  ballLabel,
  chaseSentence,
  chaseState,
  dateKey,
  dayLabel,
  formatOvers,
  isValidDateKey,
  oversToBalls,
  runRate,
  scoreLine,
  strikeRate,
} from "@/lib/format";
import type { Fixture } from "@/lib/providers/types";

describe("overs math", () => {
  it("formats legal balls as overs", () => {
    expect(formatOvers(112)).toBe("18.4");
    expect(formatOvers(120)).toBe("20");
    expect(formatOvers(0)).toBe("0");
    expect(formatOvers(5)).toBe("0.5");
  });

  it("round-trips oversText", () => {
    expect(oversToBalls("18.4")).toBe(112);
    expect(oversToBalls("20")).toBe(120);
    expect(oversToBalls("0.5")).toBe(5);
  });

  it("computes rates", () => {
    expect(runRate(92, 68)).toBeCloseTo(8.12, 2);
    expect(runRate(10, 0)).toBeNull();
    expect(strikeRate(43, 31)).toBeCloseTo(138.71, 2);
    expect(strikeRate(0, 0)).toBeNull();
  });
});

function liveChaseFixture(): Fixture {
  return {
    id: "m",
    seriesId: "s",
    seriesName: "Series",
    format: "T20",
    status: "live",
    statusText: "",
    startTime: "2026-07-02T13:30:00.000Z",
    dateKey: "2026-07-02",
    venue: { name: "Wankhede Stadium" },
    teams: {
      home: { id: "t-ind", name: "India", shortName: "IND" },
      away: { id: "t-eng", name: "England", shortName: "ENG" },
    },
    innings: [
      { number: 1, battingTeamId: "t-ind", runs: 189, wickets: 7, oversText: "20", legalBalls: 120 },
      { number: 2, battingTeamId: "t-eng", runs: 92, wickets: 3, oversText: "11.2", legalBalls: 68 },
    ],
    oversPerInnings: 20,
    battingTeamId: "t-eng",
  };
}

describe("chase equation — the CLAUDE.md reference scenario", () => {
  it("computes 'England need 98 off 52'", () => {
    const chase = chaseState(liveChaseFixture());
    expect(chase).not.toBeNull();
    expect(chase?.target).toBe(190);
    expect(chase?.runsNeeded).toBe(98);
    expect(chase?.ballsRemaining).toBe(52);
    expect(chase?.requiredRate).toBeCloseTo(11.31, 2);
    expect(chaseSentence("England", chase!)).toBe("England need 98 off 52 balls");
  });

  it("does not apply to the first innings", () => {
    const fixture = liveChaseFixture();
    fixture.innings = [fixture.innings[0]!];
    expect(chaseState(fixture)).toBeNull();
  });

  it("handles the win and last-ball edges", () => {
    const fixture = liveChaseFixture();
    fixture.innings[1] = { ...fixture.innings[1]!, runs: 190, legalBalls: 110 };
    const won = chaseState(fixture)!;
    expect(won.runsNeeded).toBe(0);
    expect(chaseSentence("England", won)).toBe("England have won");

    fixture.innings[1] = { ...fixture.innings[1]!, runs: 180, legalBalls: 120 };
    const short = chaseState(fixture)!;
    expect(short.ballsRemaining).toBe(0);
    expect(short.requiredRate).toBeNull();
  });

  it("formats score lines and ball labels", () => {
    expect(scoreLine({ number: 1, battingTeamId: "t", runs: 189, wickets: 7, oversText: "20", legalBalls: 120 })).toBe("189/7");
    expect(scoreLine({ number: 1, battingTeamId: "t", runs: 152, wickets: 10, oversText: "18.3", legalBalls: 111 })).toBe("152");
    expect(ballLabel(18, 4)).toBe("18.4");
  });
});

describe("date helpers", () => {
  it("produces and validates date keys", () => {
    const key = dateKey(new Date(2026, 6, 2));
    expect(key).toBe("2026-07-02");
    expect(isValidDateKey(key)).toBe(true);
    expect(isValidDateKey("2026-13-40")).toBe(false);
    expect(isValidDateKey("nonsense")).toBe(false);
  });

  it("labels days relative to today", () => {
    expect(dayLabel("2026-07-01", "2026-07-02")).toBe("Yesterday");
    expect(dayLabel("2026-07-02", "2026-07-02")).toBe("Today");
    expect(dayLabel("2026-07-03", "2026-07-02")).toBe("Tomorrow");
    expect(dayLabel("2026-07-05", "2026-07-02")).toMatch(/Sun/);
  });
});
