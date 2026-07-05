/**
 * Integration: every delivery of the bundled real Cricsheet match through the
 * synthesizer. Generated Cricsheet commentary is deliberately low-signal, so
 * the assertions here are invariants, honesty (low confidence on bare lines)
 * and outcome cross-checks — exactly what the replay pipeline will feed the
 * pitch map with zero API keys.
 */
import { describe, expect, it } from "vitest";
import { CricsheetAdapter } from "@/lib/providers/cricsheet.adapter";
import { synthesizeShot } from "../synthesize";

const MATCH_ID = "1490706";
const adapter = new CricsheetAdapter({ dir: "lib/providers/__fixtures__/cricsheet" });

describe("synthesizer over a full real match (Cricsheet replay feed)", () => {
  it("synthesizes every delivery without throwing, within invariants", async () => {
    const events = await adapter.getBallByBall(MATCH_ID);
    expect(events.length).toBeGreaterThan(200);

    for (const event of events) {
      const shot = synthesizeShot(event);
      expect(shot.landingRadius).toBeGreaterThanOrEqual(0);
      expect(shot.landingRadius).toBeLessThanOrEqual(1);
      expect(shot.confidence).toBeGreaterThan(0);
      expect(shot.confidence).toBeLessThanOrEqual(1);
      expect(shot.wagonZone).toBeGreaterThanOrEqual(1);
      expect(shot.wagonZone).toBeLessThanOrEqual(8);

      // Outcome cross-checks hold on real structured data.
      expect(shot.isBoundary).toBe(event.runs.batter === 4 || event.runs.batter === 6);
      if (event.runs.batter >= 4) expect(shot.landingRadius).toBe(1);
      if (event.runs.batter === 6) expect(shot.trajectory).not.toBe("ground");
      if (event.wicket?.kind === "bowled" || event.wicket?.kind === "lbw" || event.wicket?.kind === "stumped") {
        expect(shot.landingRadius).toBeLessThanOrEqual(0.05);
      }
      if (event.wicket?.kind === "run out") expect(shot.shotType).toBe("run-out-scramble");
    }
  });

  it("stays honest: bare generated lines synthesize at generic-animation confidence", async () => {
    const events = await adapter.getBallByBall(MATCH_ID);
    const nonWicket = events.filter((e) => !e.wicket);
    const lowConfidence = nonWicket.filter((e) => synthesizeShot(e).confidence < 0.5);
    // Generated Cricsheet prose carries no shot vocabulary — the parser must
    // say so rather than invent scenes (§4 ambiguity policy).
    expect(lowConfidence.length / nonWicket.length).toBeGreaterThan(0.95);
  });
});
