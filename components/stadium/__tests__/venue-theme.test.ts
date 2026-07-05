/** Parametric venue skinning (CLAUDE.md §5.2) — one model, many grounds. */
import { describe, expect, it } from "vitest";
import { venueTheme } from "../venue-theme";

describe("venueTheme", () => {
  it("skins marquee venues distinctly (Wankhede ≠ MCG)", () => {
    const wankhede = venueTheme({ name: "Wankhede Stadium", city: "Mumbai" });
    const mcg = venueTheme({ name: "Melbourne Cricket Ground", city: "Melbourne" });
    expect(wankhede.rx).toBeLessThan(mcg.rx); // short square boundaries vs the huge oval
    expect(wankhede.standLower).not.toBe(mcg.standLower);
    expect(wankhede.lighting).toBe("night");
    expect(mcg.lighting).toBe("day");
  });

  it("is deterministic for unknown venues, and varies between them", () => {
    const a1 = venueTheme({ name: "Some Regional Oval", city: "Nowhere" });
    const a2 = venueTheme({ name: "Some Regional Oval", city: "Nowhere" });
    const b = venueTheme({ name: "Another County Ground", city: "Elsewhere" });
    expect(a1).toEqual(a2);
    expect(a1.rx !== b.rx || a1.standLower !== b.standLower).toBe(true);
  });

  it("always returns playable dimensions, even with no venue at all", () => {
    for (const v of [undefined, null, { name: "" }, { name: "Lord's, London" }] as const) {
      const t = venueTheme(v as Parameters<typeof venueTheme>[0]);
      expect(t.rx).toBeGreaterThanOrEqual(50);
      expect(t.rx).toBeLessThanOrEqual(80);
      expect(t.rz).toBeGreaterThanOrEqual(50);
      expect(t.rz).toBeLessThanOrEqual(85);
      expect(t.crowd.length).toBeGreaterThan(0);
    }
  });
});
