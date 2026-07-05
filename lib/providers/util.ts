import type { BallEvent, BallRef, MatchFormat, TeamRef } from "./types";

/** Strictly after, by (innings, over, ball). Wides share a ball number with
 *  the re-bowled delivery; a per-event sequence id lands in Phase 2. */
export function isAfterBall(e: Pick<BallEvent, "innings" | "over" | "ball">, since: BallRef): boolean {
  if (e.innings !== since.innings) return e.innings > since.innings;
  if (e.over !== since.over) return e.over > since.over;
  return e.ball > since.ball;
}

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** "MI New York" → "MNY", "India" → "IND". */
export function shortNameFor(teamName: string): string {
  const words = teamName.split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    return words
      .map((w) => (w[0] ?? "").toUpperCase())
      .join("")
      .slice(0, 4);
  }
  return teamName.slice(0, 3).toUpperCase();
}

/** International sides → ISO country codes for emoji flags. Franchises miss → monogram. */
const COUNTRY_CODES: Record<string, string> = {
  Afghanistan: "AF",
  Australia: "AU",
  Bangladesh: "BD",
  Canada: "CA",
  England: "GB",
  India: "IN",
  Ireland: "IE",
  Namibia: "NA",
  Nepal: "NP",
  Netherlands: "NL",
  "New Zealand": "NZ",
  Oman: "OM",
  Pakistan: "PK",
  Scotland: "GB",
  "South Africa": "ZA",
  "Sri Lanka": "LK",
  "United Arab Emirates": "AE",
  "United States of America": "US",
  USA: "US",
  "West Indies": "JM",
  Zimbabwe: "ZW",
};

export function teamRefFromName(name: string): TeamRef {
  const countryCode = COUNTRY_CODES[name];
  return {
    id: `t-${slugify(name)}`,
    name,
    shortName: shortNameFor(name),
    ...(countryCode ? { countryCode } : {}),
  };
}

/** Cricsheet / provider match_type strings → canonical format. */
export function toMatchFormat(matchType: string | undefined, oversPerInnings?: number): MatchFormat {
  const t = (matchType ?? "").toLowerCase();
  if (t.includes("test") || t === "mdm") return "TEST";
  if (t === "odi" || t === "odm") return "ODI";
  if (t.includes("100")) return "HUNDRED";
  if (t === "t10") return "T10";
  if (t.includes("t20") || t === "it20") return "T20";
  if (oversPerInnings === 50) return "ODI";
  if (oversPerInnings === 20) return "T20";
  return oversPerInnings ? "T20" : "TEST";
}
