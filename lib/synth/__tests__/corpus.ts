/**
 * The Shot Synthesizer corpus — real-style commentary lines, table-driven
 * (CLAUDE.md §4: "Build a test suite from 500+ real commentary lines. This
 * parser must be unit-tested to death — it IS the product").
 *
 * Lines follow the register of live Cricbuzz/ESPNcricinfo commentary. Cases
 * tagged `sparse: true` are deliberately low-signal (Cricsheet-generated
 * feeds, bare outcomes) and are EXCLUDED from the ≥80% @ confidence ≥0.7
 * gate — for those the correct behavior is LOW confidence, so the renderer
 * falls back to a generic conservative animation.
 *
 * `expect` asserts only what the line actually pins down; every field it
 * names is checked exactly (plus min/max bounds for confidence and radius).
 */
import type { BattingHand, ExtraType, SynthesizedShot, WicketKind } from "@/lib/providers/types";

export interface CorpusCase {
  text: string;
  /** Batter runs (default 0). */
  runs?: number;
  extras?: { type: ExtraType; runs: number };
  wicket?: WicketKind;
  hand?: BattingHand;
  /** Low-signal input — excluded from the ≥80% @ ≥0.7 aggregate gate. */
  sparse?: boolean;
  expect?: Partial<
    Pick<
      SynthesizedShot,
      "deliveryType" | "length" | "line" | "shotType" | "wagonZone" | "trajectory" | "fielderRole" | "isBoundary" | "runsScored"
    >
  > & {
    minConfidence?: number;
    maxConfidence?: number;
    minRadius?: number;
    maxRadius?: number;
  };
}

export const CORPUS: CorpusCase[] = [
  // ══════════════════════════════════════════════════════════════════════════
  // A. Reference deliveries (CLAUDE.md §4) + dense Cricbuzz-register lines
  // ══════════════════════════════════════════════════════════════════════════
  {
    text: "Adil Rashid to Axar Patel, 1 run, flatter on off stump, Axar goes on the back foot and cuts to the right of sweeper cover",
    runs: 1,
    expect: {
      deliveryType: "spin",
      line: "off",
      shotType: "cut",
      trajectory: "ground",
      fielderRole: "sweeper-cover",
      wagonZone: 6,
      runsScored: 1,
      isBoundary: false,
      minConfidence: 0.7,
      minRadius: 0.85,
      maxRadius: 0.95,
    },
  },
  {
    text: "Adil Rashid to Axar Patel, WICKET! Deceives him with a googly. Axar charges down the track, beaten past the outside edge, and Buttler is lightning quick — whips off the bails. Stumped!",
    wicket: "stumped",
    expect: { deliveryType: "spin", shotType: "missed", maxRadius: 0.05, minConfidence: 0.7 },
  },
  {
    text: "Bumrah to Salt, FOUR! Full and wide outside off, Salt throws his hands at it and carves the drive past backward point, races away to the fence",
    runs: 4,
    expect: { shotType: "drive", length: "full", fielderRole: "backward-point", trajectory: "ground", isBoundary: true, minRadius: 1, minConfidence: 0.7 },
  },
  {
    text: "Kuldeep Yadav to Livingstone, SIX! Tossed up on middle, Livingstone gets down on one knee and slog sweeps it miles over deep midwicket, into the crowd",
    runs: 6,
    expect: { deliveryType: "spin", shotType: "sweep", fielderRole: "deep-midwicket", wagonZone: 3, trajectory: "lofted", isBoundary: true, minRadius: 1, minConfidence: 0.7 },
  },
  {
    text: "Archer to Kohli, no run, back of a length outside off, angles across, Kohli shoulders arms and lets it go through to the keeper",
    expect: { deliveryType: "pace", length: "short", line: "off", shotType: "leave", maxRadius: 0.1, minConfidence: 0.7 },
  },
  {
    text: "Rashid to Pandya, 2 runs, googly on leg stump, worked away wide of deep square leg, they push hard and come back for the second",
    runs: 2,
    expect: { deliveryType: "spin", shotType: "flick", fielderRole: "deep-square-leg", wagonZone: 2, runsScored: 2, minConfidence: 0.7 },
  },
  {
    text: "Wood to Gill, no run, 91mph and short of a length at the body, Gill hops and drops it at his feet with a dead bat",
    expect: { deliveryType: "pace", length: "short", shotType: "defend", maxRadius: 0.15, minConfidence: 0.7 },
  },
  {
    text: "Curran to Suryakumar, FOUR! Slower ball sits up in the slot, Surya waits and laps it fine past short fine leg, nobody moves",
    runs: 4,
    expect: { deliveryType: "pace", shotType: "sweep", fielderRole: "short-fine-leg", wagonZone: 1, isBoundary: true, minRadius: 1, minConfidence: 0.7 },
  },
  {
    text: "Jadeja to Root, 1 run, flighted on off, Root strides out and drives with the spin to long off for an easy single",
    runs: 1,
    expect: { deliveryType: "spin", shotType: "drive", fielderRole: "long-off", wagonZone: 5, runsScored: 1, minConfidence: 0.7 },
  },
  {
    text: "Siraj to Buttler, FOUR! Overpitched on the pads, Buttler flicks it off his toes and beats deep square leg to his left, gorgeous timing",
    runs: 4,
    expect: { shotType: "flick", length: "full", fielderRole: "deep-square-leg", isBoundary: true, minRadius: 1, minConfidence: 0.7 },
  },
  {
    text: "Adil Rashid to Dube, SIX! Drops short, Dube rocks back and pulls it flat over deep backward square leg, that is huge",
    runs: 6,
    expect: { shotType: "pull", length: "short", fielderRole: "deep-backward-square-leg", isBoundary: true, minRadius: 1, minConfidence: 0.7 },
  },
  {
    text: "Bumrah to Brook, no run, yorker on middle, dug out at the very last moment, squirts to silly mid off",
    expect: { length: "yorker", line: "middle", fielderRole: "silly-mid-off", maxRadius: 0.15, minConfidence: 0.7 },
  },
  {
    text: "Chahal to Bairstow, WICKET! Loopy leg break outside off, Bairstow charges down the pitch, misses it completely and the keeper does the rest. Stumped by a mile!",
    wicket: "stumped",
    expect: { deliveryType: "spin", shotType: "missed", maxRadius: 0.05, minConfidence: 0.7 },
  },
  {
    text: "Stokes to Rahul, 3 runs, full on middle, Rahul creams the on drive wide of long on, the sweeper cuts it off with a dive",
    runs: 3,
    expect: { shotType: "drive", length: "full", runsScored: 3, minConfidence: 0.7 },
  },
  {
    text: "Topley to Sharma, FOUR! Width on offer outside off, Rohit stands tall and punches through extra cover, sweeper cover has no chance",
    runs: 4,
    expect: { shotType: "drive", line: "wide-off", isBoundary: true, minRadius: 1, minConfidence: 0.7 },
  },
  {
    text: "Moeen to Pant, SIX! Tossed up and Pant goes downtown, launches it high over long on and into the second tier",
    runs: 6,
    expect: { deliveryType: "spin", trajectory: "lofted", fielderRole: "long-on", wagonZone: 4, isBoundary: true, minConfidence: 0.7 },
  },
  {
    text: "Woakes to Jaiswal, no run, good length in the corridor, Jaiswal pushes defensively to short cover",
    expect: { length: "good", line: "off", shotType: "defend", fielderRole: "short-cover", maxRadius: 0.3, minConfidence: 0.7 },
  },
  {
    text: "Hardik to Livingstone, 1 run, hard length into the pitch, Livingstone punches it off the back foot to sweeper cover, ambles a single",
    runs: 1,
    expect: { deliveryType: "pace", shotType: "drive", fielderRole: "sweeper-cover", runsScored: 1, minConfidence: 0.7 },
  },
  {
    text: "Kuldeep to Salt, WICKET! Ripped past the outside edge and clips the top of off, the googly does him completely. Bowled!",
    wicket: "bowled",
    expect: { deliveryType: "spin", shotType: "missed", maxRadius: 0.05, minConfidence: 0.7 },
  },
  {
    text: "Bumrah to Buttler, WICKET! Searing yorker at the base of off stump, Buttler swings and misses, the stumps are a mess. Bowled him!",
    wicket: "bowled",
    expect: { length: "yorker", shotType: "missed", trajectory: "ground", maxRadius: 0.05, minConfidence: 0.7 },
  },
  {
    text: "Shami to Malan, WICKET! Nips back off the seam and raps the pads, that looked dead in front. LBW!",
    wicket: "lbw",
    expect: { deliveryType: "pace", shotType: "missed", maxRadius: 0.05, minConfidence: 0.7 },
  },
  {
    text: "Axar to Moeen Ali, WICKET! Darted in flat, Moeen goes for the slog sweep, top edges it and deep square leg settles under the swirler. Caught!",
    wicket: "caught",
    expect: { deliveryType: "spin", shotType: "edge", fielderRole: "deep-square-leg", minConfidence: 0.7 },
  },
  {
    text: "Ferguson to Iyer, 2 runs, banged in short, Iyer swivel pulls in front of deep square leg, good running",
    runs: 2,
    expect: { shotType: "pull", length: "short", runsScored: 2, minConfidence: 0.7 },
  },
  {
    text: "Rashid Khan to Miller, no run, wrong'un gripping outside off, Miller reads it late and dabs it to backward point",
    expect: { deliveryType: "spin", shotType: "cut", fielderRole: "backward-point", wagonZone: 7, minConfidence: 0.7 },
  },
  {
    text: "Starc to Warner, FOUR! Inswinger on the pads, tucked away fine, beats short fine leg and runs away to the fence",
    runs: 4,
    hand: "left",
    expect: { deliveryType: "pace", shotType: "flick", isBoundary: true, minRadius: 1, minConfidence: 0.7 },
  },
  {
    text: "Zampa to Gill, 1 run, flighted outside off, Gill waits and late cuts it fine of short third, clever batting",
    runs: 1,
    expect: { deliveryType: "spin", shotType: "cut", fielderRole: "short-third", wagonZone: 8, runsScored: 1, minConfidence: 0.7 },
  },
  {
    text: "Cummins to Kohli, no run, back of a length and it hurries him, Kohli fends it off the glove towards leg gully",
    expect: { deliveryType: "pace", length: "short", fielderRole: "leg-gully", maxRadius: 0.3, minConfidence: 0.7 },
  },
  {
    text: "Maxwell to Pandya, SIX! Short and Pandya muscles it flat over cow corner, tracer bullet into the stands",
    runs: 6,
    expect: { shotType: "slog", fielderRole: "cow-corner", isBoundary: true, minRadius: 1, minConfidence: 0.7 },
  },
  {
    text: "Hazlewood to Rahul, no run, immaculate length on off, Rahul solidly forward with a forward defensive block",
    expect: { length: "good", line: "off", shotType: "defend", maxRadius: 0.15, minConfidence: 0.7 },
  },
  {
    text: "Ashwin to Head, WICKET! Carrom ball, Head goes for the reverse sweep and feathers it through to the keeper. Caught behind!",
    wicket: "caught",
    expect: { deliveryType: "spin", shotType: "edge", fielderRole: "wicketkeeper", minConfidence: 0.7 },
  },
  // ══════════════════════════════════════════════════════════════════════════
  // B. Shot verb coverage — every shotType through its vocabulary
  // ══════════════════════════════════════════════════════════════════════════
  // — drive family —
  { text: "driven crisply to mid off, no run", expect: { shotType: "drive", fielderRole: "mid-off", wagonZone: 5 } },
  { text: "drives elegantly through the covers for two", runs: 2, expect: { shotType: "drive", fielderRole: "cover", wagonZone: 6 } },
  { text: "cover drive for four, absolutely creamed along the ground", runs: 4, expect: { shotType: "drive", trajectory: "ground", isBoundary: true, minConfidence: 0.7 } },
  { text: "caresses the half volley through extra cover, four more", runs: 4, expect: { shotType: "drive", length: "full", fielderRole: "extra-cover", isBoundary: true, minConfidence: 0.7 } },
  { text: "punches off the back foot to long off, one run", runs: 1, expect: { shotType: "drive", fielderRole: "long-off", runsScored: 1 } },
  { text: "strokes it down the ground to long on for a single", runs: 1, expect: { shotType: "drive", fielderRole: "long-on", wagonZone: 4 } },
  { text: "thumps the drive straight past the bowler, four runs", runs: 4, expect: { shotType: "drive", isBoundary: true } },
  { text: "hammers it through cover point, the sweeper gives chase, three runs", runs: 3, expect: { shotType: "drive", runsScored: 3, minConfidence: 0.7 } },
  { text: "spanks the full ball through mid off, no chance for the fielder, FOUR", runs: 4, expect: { shotType: "drive", length: "full", isBoundary: true, minConfidence: 0.7 } },
  { text: "crunches it off the front foot to deep cover, easy single", runs: 1, expect: { shotType: "drive", fielderRole: "deep-cover", wagonZone: 6 } },
  { text: "blasts it back past the bowler for four, straight drive", runs: 4, expect: { shotType: "drive", isBoundary: true, minConfidence: 0.7 } },
  { text: "smashes the overpitched delivery through extra cover for four", runs: 4, expect: { shotType: "drive", length: "full", fielderRole: "extra-cover", isBoundary: true, minConfidence: 0.7 } },
  { text: "on drives sweetly, mid on dives but it beats him, four", runs: 4, expect: { shotType: "drive", isBoundary: true, minConfidence: 0.7 } },
  { text: "square drives hard, cut off at deep point, two runs taken", runs: 2, expect: { shotType: "drive", fielderRole: "deep-point", wagonZone: 7, minConfidence: 0.7 } },
  { text: "times it to perfection through mid on, sweetly timed indeed, four", runs: 4, expect: { shotType: "drive", isBoundary: true } },
  { text: "threads the gap between cover and point, races to the rope, FOUR", runs: 4, expect: { shotType: "drive", isBoundary: true, trajectory: "ground" } },
  { text: "pierces the off side ring through short cover, they take two", runs: 2, expect: { shotType: "drive", fielderRole: "short-cover" } },
  // — cut family —
  { text: "cuts hard to deep point for a single", runs: 1, expect: { shotType: "cut", fielderRole: "deep-point", wagonZone: 7, runsScored: 1 } },
  { text: "square cuts the short and wide delivery for four", runs: 4, expect: { shotType: "cut", length: "short", isBoundary: true, minConfidence: 0.7 } },
  { text: "late cuts it very fine, third man cleans up, one run", runs: 1, expect: { shotType: "cut", fielderRole: "third-man", wagonZone: 8 } },
  { text: "slashes at width outside off, flies over backward point for four", runs: 4, expect: { shotType: "cut", line: "wide-off", isBoundary: true, minConfidence: 0.7 } },
  { text: "steers it gently to short third for no run", expect: { shotType: "cut", fielderRole: "short-third", maxRadius: 0.3 } },
  { text: "dabs it into the gap at backward point, quick single", runs: 1, expect: { shotType: "cut", fielderRole: "backward-point", runsScored: 1 } },
  { text: "guides it deliberately down to deep third, one run", runs: 1, expect: { shotType: "cut", fielderRole: "deep-third", wagonZone: 8 } },
  { text: "runs it down to third man with soft hands, single", runs: 1, expect: { shotType: "cut", fielderRole: "third-man" } },
  { text: "upper cuts the bouncer over the keeper, six runs!", runs: 6, expect: { shotType: "cut", length: "bouncer", isBoundary: true, minConfidence: 0.7 } },
  { text: "opens the face and steers to gully, no run", expect: { shotType: "cut", fielderRole: "gully", maxRadius: 0.3 } },
  { text: "cut away savagely off the back foot, deep point cuts it off, two", runs: 2, expect: { shotType: "cut", fielderRole: "deep-point", runsScored: 2 } },
  // — pull / hook —
  { text: "pulls the short ball to deep midwicket, one bounce into the fence, four", runs: 4, expect: { shotType: "pull", length: "short", fielderRole: "deep-midwicket", isBoundary: true, minConfidence: 0.7 } },
  { text: "pulled hard in front of square leg, two runs", runs: 2, expect: { shotType: "pull", fielderRole: "square-leg", wagonZone: 2 } },
  { text: "hooks the bumper down to fine leg, one run", runs: 1, expect: { shotType: "pull", length: "bouncer", fielderRole: "fine-leg", wagonZone: 1, minConfidence: 0.7 } },
  { text: "hooked away and it sails over deep fine leg, SIX!", runs: 6, expect: { shotType: "pull", fielderRole: "deep-fine-leg", isBoundary: true, trajectory: "lofted", minConfidence: 0.7 } },
  { text: "short arm jab off the hip, beats short fine leg, four runs", runs: 4, expect: { shotType: "pull", isBoundary: true, minConfidence: 0.7 } },
  { text: "swivel pulls it round the corner to deep backward square leg, single", runs: 1, expect: { shotType: "pull", fielderRole: "deep-backward-square-leg", wagonZone: 2 } },
  { text: "pull shot played with disdain, deep midwicket has no chance, FOUR", runs: 4, expect: { shotType: "pull", fielderRole: "deep-midwicket", isBoundary: true, minConfidence: 0.7 } },
  // — sweep family —
  { text: "sweeps it hard from off stump to deep square leg for a single", runs: 1, expect: { shotType: "sweep", fielderRole: "deep-square-leg", wagonZone: 2, minConfidence: 0.7 } },
  { text: "swept firmly in front of square leg, two runs taken", runs: 2, expect: { shotType: "sweep", fielderRole: "square-leg" } },
  { text: "reverse sweeps the offbreak past point for four!", runs: 4, expect: { shotType: "sweep", deliveryType: "spin", isBoundary: true, minConfidence: 0.7 } },
  { text: "slog sweeps the flighted ball over cow corner, SIX!", runs: 6, expect: { shotType: "sweep", deliveryType: "spin", fielderRole: "cow-corner", isBoundary: true, minConfidence: 0.7 } },
  { text: "paddles it fine past the keeper, four runs", runs: 4, expect: { shotType: "sweep", isBoundary: true } },
  { text: "scoops it audaciously over short fine leg, four more", runs: 4, expect: { shotType: "sweep", fielderRole: "short-fine-leg", isBoundary: true } },
  { text: "ramps the fast bouncer over the slips, four runs!", runs: 4, expect: { shotType: "sweep", length: "bouncer", isBoundary: true, minConfidence: 0.7 } },
  // "hits it over" (loft) outweighs "switch hits" — a lofted reverse-side hit is the right scene either way.
  { text: "switch hits it over cover point, extraordinary skills, SIX", runs: 6, expect: { fielderRole: "cover-point", isBoundary: true, minRadius: 1 } },
  { text: "laps it round the corner to short fine leg, no run there", expect: { shotType: "sweep", fielderRole: "short-fine-leg", maxRadius: 0.3 } },
  // — flick family —
  { text: "flicks it off the pads through midwicket for two", runs: 2, expect: { shotType: "flick", fielderRole: "midwicket", wagonZone: 3, minConfidence: 0.7 } },
  { text: "whips it wristily off middle stump to deep midwicket, one", runs: 1, expect: { shotType: "flick", fielderRole: "deep-midwicket", minConfidence: 0.7 } },
  { text: "clips it neatly off his toes to mid on, no run", expect: { shotType: "flick", fielderRole: "mid-on", wagonZone: 4 } },
  { text: "glances it fine to long leg, a comfortable single", runs: 1, expect: { shotType: "flick", fielderRole: "long-leg", wagonZone: 1 } },
  { text: "tickles it down the leg side past the keeper, four runs", runs: 4, expect: { shotType: "flick", line: "wide-leg", isBoundary: true } },
  { text: "nudges it into the leg side off the hip, quick single to square leg", runs: 1, expect: { shotType: "flick", fielderRole: "square-leg", runsScored: 1 } },
  { text: "works it off the pads wide of mid on, they cross for one", runs: 1, expect: { shotType: "flick", fielderRole: "mid-on" } },
  { text: "tucks it behind square on the leg side, single to deep backward square leg", runs: 1, expect: { shotType: "flick", fielderRole: "deep-backward-square-leg", wagonZone: 2 } },
  { text: "turns it off his pads to short midwicket, dot ball", expect: { shotType: "flick", fielderRole: "short-midwicket", maxRadius: 0.3 } },
  // — slog family —
  { text: "slogs it high over cow corner for six!", runs: 6, expect: { shotType: "slog", fielderRole: "cow-corner", wagonZone: 4, trajectory: "lofted", isBoundary: true, minConfidence: 0.7 } },
  { text: "heaves it across the line towards deep midwicket, falls safe, two runs", runs: 2, expect: { shotType: "slog", fielderRole: "deep-midwicket" } },
  { text: "mows it over midwicket, that is a huge six", runs: 6, expect: { shotType: "slog", isBoundary: true, trajectory: "lofted" } },
  { text: "hoicks it into the leg side, lands short of deep square leg, one run", runs: 1, expect: { shotType: "slog", fielderRole: "deep-square-leg" } },
  { text: "carts the long hop over deep midwicket for six", runs: 6, expect: { shotType: "slog", length: "short", fielderRole: "deep-midwicket", isBoundary: true, minConfidence: 0.7 } },
  { text: "tonks it downtown, one bounce over the rope at long on, four", runs: 4, expect: { shotType: "slog", isBoundary: true, minConfidence: 0.7 } },
  { text: "clobbers the full toss flat over wide long on for six more", runs: 6, expect: { shotType: "slog", length: "full", isBoundary: true, minConfidence: 0.7 } },
  { text: "bludgeons it back over the bowler, nearly took the umpire with it, four", runs: 4, expect: { shotType: "slog", isBoundary: true } },
  { text: "wild swing across the line, gets a piece of it towards cow corner, two", runs: 2, expect: { shotType: "slog", fielderRole: "cow-corner" } },
  // — loft family —
  { text: "lofts it gracefully over mid off for four", runs: 4, expect: { shotType: "loft", trajectory: "lofted", isBoundary: true, minConfidence: 0.7 } },
  { text: "chips it delicately over the infield, drops safe at long on, two runs", runs: 2, expect: { shotType: "loft", fielderRole: "long-on", trajectory: "lofted" } },
  { text: "launches it high over long off, that has gone all the way, SIX", runs: 6, expect: { shotType: "loft", fielderRole: "long-off", trajectory: "lofted", isBoundary: true, minConfidence: 0.7 } },
  { text: "deposits the flighted ball into the stands over long on, six runs", runs: 6, expect: { shotType: "loft", deliveryType: "spin", isBoundary: true, minConfidence: 0.7 } },
  { text: "goes downtown, monstrous hit over the bowler's head for six", runs: 6, expect: { shotType: "loft", isBoundary: true } },
  { text: "inside out over extra cover, gorgeous shot, four runs", runs: 4, expect: { shotType: "loft", fielderRole: "extra-cover", isBoundary: true } },
  { text: "lifts it over mid on, into the gap, they come back for two", runs: 2, expect: { shotType: "loft", fielderRole: "mid-on" } },
  { text: "takes on the short boundary, clears the ropes at deep midwicket, SIX", runs: 6, expect: { shotType: "loft", fielderRole: "deep-midwicket", isBoundary: true } },
  // — defend family —
  { text: "defends solidly off the front foot, no run", expect: { shotType: "defend", maxRadius: 0.15, maxConfidence: 0.69 } },
  { text: "blocks it back down the pitch to the bowler", expect: { shotType: "defend", maxRadius: 0.15 } },
  { text: "dead bats the good length ball on off stump, dot", expect: { shotType: "defend", length: "good", line: "off", minConfidence: 0.7 } },
  { text: "forward defensive, textbook stuff, no run there", expect: { shotType: "defend", maxRadius: 0.15 } },
  { text: "prods forward carefully at the turning ball, kept out", expect: { shotType: "defend", deliveryType: "spin" } },
  { text: "taps it to silly point and stays home, no run", expect: { shotType: "defend", fielderRole: "silly-point", maxRadius: 0.15 } },
  { text: "pushes it gently to short midwicket, dot ball", expect: { shotType: "defend", fielderRole: "short-midwicket" } },
  { text: "digs out the yorker at the last second, no run", expect: { shotType: "defend", length: "yorker" } },
  { text: "smothers the spin and drops it dead in front of silly point", expect: { shotType: "defend", fielderRole: "silly-point" } },
  { text: "keeps out the nip backer on middle, watchful stuff", expect: { shotType: "defend", line: "middle" } },
  // — leave —
  { text: "leaves it alone comfortably outside off", expect: { shotType: "leave", line: "off", maxRadius: 0.1 } },
  { text: "shoulders arms to a good length ball in the channel", expect: { shotType: "leave", length: "good", line: "off", minConfidence: 0.7 } },
  { text: "watches it through to the keeper, well left on length", expect: { shotType: "leave", maxRadius: 0.1 } },
  { text: "offers no shot, the ball whistles past off stump", expect: { shotType: "leave" } },
  { text: "lets it go through to the keeper, easy leave outside off", expect: { shotType: "leave", line: "off" } },
  // — edge —
  { text: "edges it but it falls short of first slip, no run", expect: { shotType: "edge", fielderRole: "slip", wagonZone: 8 } },
  { text: "thick edge flies wide of gully for four", runs: 4, expect: { shotType: "edge", fielderRole: "gully", isBoundary: true } },
  { text: "nicks it, but there's nobody at slip! Runs away for four", runs: 4, expect: { shotType: "edge", isBoundary: true } },
  { text: "feathers a faint edge through to the keeper, but nobody appeals", expect: { shotType: "edge", fielderRole: "wicketkeeper" } },
  { text: "inside edge past the stumps, runs down to fine leg for one", runs: 1, expect: { shotType: "edge", fielderRole: "fine-leg" } },
  { text: "leading edge loops towards cover, falls just safe, single", runs: 1, expect: { shotType: "edge", fielderRole: "cover" } },
  { text: "top edge on the sweep, drops safely behind square leg, two runs", runs: 2, expect: { shotType: "edge", fielderRole: "square-leg" } },
  { text: "under edge past the keeper, very lucky, one run to third man", runs: 1, expect: { shotType: "edge", fielderRole: "third-man" } },
  { text: "outside edge along the ground to deep third, single taken", runs: 1, expect: { shotType: "edge", fielderRole: "deep-third", trajectory: "ground", minConfidence: 0.7 } },
  // — missed / beaten —
  { text: "beaten past the outside edge, lovely bowling in the corridor", expect: { shotType: "missed", line: "off", maxRadius: 0.1 } },
  { text: "play and a miss outside off stump, beaten for pace", expect: { shotType: "missed", deliveryType: "pace" } },
  { text: "swings and misses at a big turning leg break", expect: { shotType: "missed", deliveryType: "spin" } },
  { text: "through the gate but somehow misses the stumps, no run", expect: { shotType: "missed" } },
  { text: "beats the bat again, the corridor of uncertainty doing its job", expect: { shotType: "missed", line: "off" } },
  // ══════════════════════════════════════════════════════════════════════════
  // C. Delivery type, length & line
  // ══════════════════════════════════════════════════════════════════════════
  { text: "googly from the back of the hand, defended to silly point", expect: { deliveryType: "spin", shotType: "defend", fielderRole: "silly-point" } },
  { text: "leg break spitting out of the rough, blocked to short leg", expect: { deliveryType: "spin", shotType: "defend", fielderRole: "short-leg" } },
  { text: "off break turns in sharply, worked off the pads to square leg, one", runs: 1, expect: { deliveryType: "spin", shotType: "flick", fielderRole: "square-leg", minConfidence: 0.7 } },
  { text: "the doosra deceives him, dabbed uncertainly to backward point", expect: { deliveryType: "spin", shotType: "cut", fielderRole: "backward-point" } },
  { text: "carrom ball skids on, pushed to short cover, no run", expect: { deliveryType: "spin", shotType: "defend", fielderRole: "short-cover" } },
  { text: "arm ball goes straight on, driven to mid off", expect: { deliveryType: "spin", shotType: "drive", fielderRole: "mid-off" } },
  { text: "flipper hurries on, pulled away in front of square leg for four", runs: 4, expect: { deliveryType: "spin", shotType: "pull", isBoundary: true, minConfidence: 0.7 } },
  { text: "tossed up generously, driven on the up through extra cover, four", runs: 4, expect: { deliveryType: "spin", shotType: "drive", fielderRole: "extra-cover", isBoundary: true, minConfidence: 0.7 } },
  { text: "gives it air outside off, swept behind square leg for two", runs: 2, expect: { deliveryType: "spin", shotType: "sweep", minConfidence: 0.7 } },
  { text: "flatter and quicker, cut away to deep point for one", runs: 1, expect: { deliveryType: "spin", shotType: "cut", fielderRole: "deep-point", minConfidence: 0.7 } },
  { text: "fired in at leg stump, jammed out to short fine leg", expect: { deliveryType: "spin", fielderRole: "short-fine-leg" } },
  { text: "big turn past the outside edge, beaten all ends up", expect: { deliveryType: "spin", shotType: "missed" } },
  { text: "quicker one slid in, punched to cover, no run", expect: { deliveryType: "spin", shotType: "drive", fielderRole: "cover" } },
  { text: "drifts in and dips on him, smothered well", expect: { deliveryType: "spin", shotType: "defend" } },
  { text: "outswinger shapes away late, left alone outside off", expect: { deliveryType: "pace", shotType: "leave", line: "off", minConfidence: 0.7 } },
  { text: "inswinger angles in at the pads, flicked to midwicket for one", runs: 1, expect: { deliveryType: "pace", shotType: "flick", fielderRole: "midwicket", minConfidence: 0.7 } },
  { text: "reverse swing at 88mph, dug out from the blockhole", expect: { deliveryType: "pace", length: "yorker" } },
  { text: "seams away off a good length, beaten past the edge", expect: { deliveryType: "pace", length: "good", shotType: "missed", minConfidence: 0.7 } },
  { text: "nips back sharply through the gate, somehow survives", expect: { deliveryType: "pace", shotType: "missed" } },
  { text: "jags away off the deck, shoulders arms in the channel", expect: { deliveryType: "pace", shotType: "leave", line: "off" } },
  { text: "slower ball floated up, checked drive to mid off, no run", expect: { deliveryType: "pace", shotType: "drive", fielderRole: "mid-off" } },
  { text: "off cutter grips in the surface, pushed to cover", expect: { deliveryType: "pace", shotType: "defend", fielderRole: "cover" } },
  { text: "leg cutter angled across, steered to third man for one", runs: 1, expect: { deliveryType: "pace", shotType: "cut", fielderRole: "third-man", minConfidence: 0.7 } },
  { text: "sharp bouncer at the helmet, ducked under it, no run", expect: { deliveryType: "pace", length: "bouncer" } },
  { text: "chin music! swaying away from the bumper at the last moment", expect: { deliveryType: "pace", length: "bouncer" } },
  { text: "hits the deck hard, extra bounce takes the shoulder of the bat to gully", expect: { deliveryType: "pace", fielderRole: "gully" } },
  { text: "yorker speared in at 93mph, squeezed out to mid on", expect: { deliveryType: "pace", length: "yorker", fielderRole: "mid-on" } },
  { text: "wide yorker outside off, sliced to deep point for a single", runs: 1, expect: { length: "yorker", line: "wide-off", fielderRole: "deep-point" } },
  { text: "low full toss on leg, whipped to deep midwicket, two runs", runs: 2, expect: { length: "full", shotType: "flick", fielderRole: "deep-midwicket", minConfidence: 0.7 } },
  { text: "half volley on off, stroked through cover for four, delicious", runs: 4, expect: { length: "full", shotType: "drive", fielderRole: "cover", isBoundary: true, minConfidence: 0.7 } },
  { text: "pitched up and driven firmly to mid off, no run", expect: { length: "full", shotType: "drive", fielderRole: "mid-off", minConfidence: 0.7 } },
  { text: "overpitched on middle, on drive races away for four", runs: 4, expect: { length: "full", shotType: "drive", isBoundary: true, minConfidence: 0.7 } },
  { text: "full and straight, jammed out back to the bowler", expect: { length: "full" } },
  { text: "short of a length, ridden nicely and dropped to point", expect: { length: "short", fielderRole: "point", wagonZone: 7 } },
  { text: "back of a length at the ribs, tucked to backward square leg for one", runs: 1, expect: { deliveryType: "pace", shotType: "flick", fielderRole: "backward-square-leg", minConfidence: 0.7 } },
  { text: "long hop! sat up and begging, pulled brutally over deep square leg for six", runs: 6, expect: { length: "short", shotType: "pull", isBoundary: true, minConfidence: 0.7 } },
  { text: "dug in short, upper cut over third man for four!", runs: 4, expect: { length: "short", shotType: "cut", fielderRole: "third-man", isBoundary: true, minConfidence: 0.7 } },
  { text: "banged in halfway down, hooked away round the corner for one", runs: 1, expect: { length: "short", shotType: "pull", minConfidence: 0.7 } },
  { text: "good length on off stump, defended off the back foot", expect: { length: "good", line: "off", shotType: "defend", minConfidence: 0.7 } },
  { text: "top of off, absolutely immaculate, defended watchfully", expect: { line: "off", shotType: "defend" } },
  { text: "on a length in the corridor, left well alone", expect: { length: "good", line: "off", shotType: "leave", minConfidence: 0.7 } },
  { text: "stump to stump, nudged into the leg side for one", runs: 1, expect: { line: "middle", shotType: "flick" } },
  { text: "wicket to wicket and skiddy, defended to short midwicket", expect: { line: "middle", shotType: "defend", fielderRole: "short-midwicket" } },
  { text: "sliding down leg, glanced very fine for four", runs: 4, expect: { line: "wide-leg", shotType: "flick", isBoundary: true } },
  { text: "strays down leg, tickled past the keeper to the fine leg fence, four", runs: 4, expect: { line: "wide-leg", shotType: "flick", isBoundary: true, minConfidence: 0.7 } },
  { text: "way outside off, cut hard but straight to point, no run", expect: { line: "wide-off", shotType: "cut", fielderRole: "point", minConfidence: 0.7 } },
  { text: "full on the pads, clipped through midwicket, four runs", runs: 4, expect: { length: "full", line: "leg", shotType: "flick", fielderRole: "midwicket", isBoundary: true, minConfidence: 0.7 } },
  { text: "at the body, fended awkwardly towards short leg", expect: { line: "leg", fielderRole: "short-leg" } },
  { text: "into the hips, helped along to fine leg for a single", runs: 1, expect: { line: "leg", fielderRole: "fine-leg" } },
  { text: "on middle and leg, worked away to mid on", expect: { line: "middle", shotType: "flick", fielderRole: "mid-on" } },
  { text: "fourth stump line, steered with soft hands to gully", expect: { line: "off", shotType: "cut", fielderRole: "gully", minConfidence: 0.7 } },
  // ══════════════════════════════════════════════════════════════════════════
  // D. Trajectory & boundary outcome cross-checks
  // ══════════════════════════════════════════════════════════════════════════
  { text: "kept along the ground, through the covers for four", runs: 4, expect: { trajectory: "ground", isBoundary: true, minRadius: 1 } },
  { text: "races away along the carpet to the extra cover fence, four", runs: 4, expect: { trajectory: "ground", fielderRole: "extra-cover", isBoundary: true } },
  { text: "all along the ground, bisects the two sweepers, four runs", runs: 4, expect: { trajectory: "ground", isBoundary: true } },
  { text: "in the air but safe! drops between mid on and midwicket, two runs", runs: 2, expect: { trajectory: "lofted" } },
  { text: "lofted over the ring at cover, one bounce over the rope, FOUR", runs: 4, expect: { trajectory: "lofted", isBoundary: true, minRadius: 1 } },
  { text: "high and handsome over long on, that is out of here, SIX", runs: 6, expect: { trajectory: "lofted", fielderRole: "long-on", isBoundary: true, minRadius: 1 } },
  { text: "flat six over midwicket, like a tracer bullet!", runs: 6, expect: { trajectory: "flat", isBoundary: true, minRadius: 1 } },
  { text: "skies it miles up in the air, mid off settles under it... and drops it! single", runs: 1, expect: { trajectory: "skier", fielderRole: "mid-off" } },
  { text: "top edges the pull, steepling up over the keeper, drops safe, one run", runs: 1, expect: { shotType: "edge", trajectory: "skier" } },
  { text: "ballooned up off the splice, falls just wide of point", expect: { trajectory: "skier", fielderRole: "point" } },
  { text: "smoked flat over extra cover, one bounce into the boundary, four", runs: 4, expect: { shotType: "drive", isBoundary: true, minRadius: 1 } },
  { text: "swirling top edge, deep square leg circles underneath... spilled! two runs", runs: 2, expect: { shotType: "edge", trajectory: "skier", fielderRole: "deep-square-leg" } },
  { text: "beats the dive of sweeper cover and rolls into the fence, four", runs: 4, expect: { fielderRole: "sweeper-cover", isBoundary: true, minRadius: 1 } },
  { text: "trickles off the inside edge past leg stump, no run", expect: { shotType: "edge", trajectory: "ground" } },
  { text: "scurries away to the deep backward point boundary, four runs", runs: 4, expect: { fielderRole: "deep-backward-point", wagonZone: 7, isBoundary: true } },
  { text: "onto the roof! colossal hit over cow corner, six runs", runs: 6, expect: { trajectory: "lofted", fielderRole: "cow-corner", isBoundary: true } },
  { text: "chipped over mid on, lands safely, they scamper two", runs: 2, expect: { shotType: "loft", fielderRole: "mid-on" } },
  { text: "carries flat all the way over long off, incredible bat speed, SIX", runs: 6, expect: { isBoundary: true, fielderRole: "long-off", minRadius: 1 } },
  // ══════════════════════════════════════════════════════════════════════════
  // E. Wickets — every kind, scene-shaped
  // ══════════════════════════════════════════════════════════════════════════
  { text: "WICKET! Cleans him up with a searing yorker, middle stump cartwheels!", wicket: "bowled", expect: { shotType: "missed", length: "yorker", trajectory: "ground", maxRadius: 0.05, minConfidence: 0.7 } },
  { text: "WICKET! Castled! The inswinger sneaks through the gate and rattles the stumps", wicket: "bowled", expect: { shotType: "missed", deliveryType: "pace", maxRadius: 0.05, minConfidence: 0.7 } },
  { text: "WICKET! Chopped on! Cut too close to the stumps and drags it back onto off pole", wicket: "bowled", expect: { shotType: "edge", maxRadius: 0.05, minConfidence: 0.7 } },
  { text: "WICKET! Bowled him! Big turning leg break through the gate, timber!", wicket: "bowled", expect: { shotType: "missed", deliveryType: "spin", maxRadius: 0.05, minConfidence: 0.7 } },
  { text: "WICKET! Knocks back the leg stump with a toe crusher, no answer to that", wicket: "bowled", expect: { shotType: "missed", length: "yorker", maxRadius: 0.05 } },
  { text: "WICKET! Plays on! The cut shot comes off the under edge and crashes into the stumps", wicket: "bowled", expect: { shotType: "edge", maxRadius: 0.05 } },
  { text: "WICKET! Trapped in front! Skidded on with the arm ball, plumb LBW", wicket: "lbw", expect: { shotType: "missed", deliveryType: "spin", maxRadius: 0.05, minConfidence: 0.7 } },
  { text: "WICKET! Rapped on the pads by the nip backer, that is dead, LBW!", wicket: "lbw", expect: { shotType: "missed", deliveryType: "pace", maxRadius: 0.05 } },
  { text: "WICKET! Misses the sweep and is struck on the pad in front of middle, given!", wicket: "lbw", expect: { shotType: "sweep", maxRadius: 0.05, minConfidence: 0.7 } },
  { text: "WICKET! Pinned in front on the crease, full and straight does the job, LBW", wicket: "lbw", expect: { shotType: "missed", length: "full", maxRadius: 0.05 } },
  { text: "WICKET! Stumped! Dances down to the flighted ball, beaten in the flight, bails off in a flash", wicket: "stumped", expect: { deliveryType: "spin", shotType: "missed", maxRadius: 0.05, minConfidence: 0.7 } },
  { text: "WICKET! Comes down the track, yorked by the dip, keeper does the rest. Stumped!", wicket: "stumped", expect: { shotType: "missed", maxRadius: 0.05, minConfidence: 0.7 } },
  { text: "WICKET! Out of his crease for a moment, the googly beats everything, lightning stumping!", wicket: "stumped", expect: { deliveryType: "spin", shotType: "missed", maxRadius: 0.05, minConfidence: 0.7 } },
  { text: "WICKET! Caught at slip! The outswinger kisses the outside edge, regulation catch in the cordon", wicket: "caught", expect: { shotType: "edge", fielderRole: "slip", wagonZone: 8, minConfidence: 0.7 } },
  { text: "WICKET! Edged and taken! Feathers the leg cutter through to the keeper, huge wicket", wicket: "caught", expect: { shotType: "edge", fielderRole: "wicketkeeper", minConfidence: 0.7 } },
  { text: "WICKET! Skies the slog to deep midwicket who takes a calm catch under pressure", wicket: "caught", expect: { shotType: "slog", trajectory: "skier", fielderRole: "deep-midwicket", minConfidence: 0.7 } },
  { text: "WICKET! Holes out! The lofted drive picks out long off to the inch, simple catch", wicket: "caught", expect: { fielderRole: "long-off", minConfidence: 0.7 } },
  { text: "WICKET! Miscues the pull, top edge swirls to fine leg who judges it well", wicket: "caught", expect: { shotType: "edge", trajectory: "skier", fielderRole: "fine-leg", minConfidence: 0.7 } },
  { text: "WICKET! Drives on the up straight to short cover, hit it right at him", wicket: "caught", expect: { shotType: "drive", fielderRole: "short-cover", minConfidence: 0.7 } },
  { text: "WICKET! The sweep goes fine off the top edge, short fine leg takes it diving forward", wicket: "caught", expect: { shotType: "edge", fielderRole: "short-fine-leg", minConfidence: 0.7 } },
  { text: "WICKET! Cuts it straight to backward point, no timing on it, easy catch", wicket: "caught", expect: { shotType: "cut", fielderRole: "backward-point", wagonZone: 7, minConfidence: 0.7 } },
  { text: "WICKET! Chips it tamely to mid on, soft dismissal, the slower ball wins again", wicket: "caught", expect: { shotType: "loft", fielderRole: "mid-on", deliveryType: "pace", minConfidence: 0.7 } },
  { text: "WICKET! Gloves the bouncer down the leg side, keeper takes a screamer!", wicket: "caught", expect: { length: "bouncer", fielderRole: "wicketkeeper", minConfidence: 0.7 } },
  { text: "WICKET! Slog sweep straight down deep square leg's throat, taken inches inside the rope", wicket: "caught", expect: { shotType: "sweep", fielderRole: "deep-square-leg", minConfidence: 0.7 } },
  { text: "WICKET! Caught and bowled! Checked drive chipped straight back, snapped up in the follow-through", wicket: "caught and bowled", expect: { shotType: "loft", minConfidence: 0.7 } },
  { text: "WICKET! Leading edge loops back to the bowler, easiest caught and bowled you will see", wicket: "caught and bowled", expect: { shotType: "edge", minConfidence: 0.7 } },
  { text: "WICKET! Run out! Pushed to cover and set off, sent back too late, direct hit at the striker's end!", wicket: "run out", expect: { shotType: "run-out-scramble", fielderRole: "cover", minConfidence: 0.7 } },
  { text: "WICKET! Terrible mix-up! Both batters stranded mid-pitch, mid on throws down the stumps, run out", wicket: "run out", expect: { shotType: "run-out-scramble", fielderRole: "mid-on", minConfidence: 0.7 } },
  { text: "WICKET! Brilliant work from backward point, swoops and throws down the bowler's end, gone!", wicket: "run out", expect: { shotType: "run-out-scramble", fielderRole: "backward-point", minConfidence: 0.7 } },
  { text: "WICKET! Drags the pull back onto his own stumps... no wait, he has trodden on them! Hit wicket!", wicket: "hit wicket", expect: { shotType: "pull" } },
  { text: "WICKET! Loses his balance sweeping and knocks the bails off with his back leg, hit wicket!", wicket: "hit wicket", expect: { shotType: "sweep" } },
  // ══════════════════════════════════════════════════════════════════════════
  // F. Extras
  // ══════════════════════════════════════════════════════════════════════════
  { text: "wide, sprayed well outside off, the keeper dives to collect", extras: { type: "wide", runs: 1 }, expect: { shotType: "missed", line: "wide-off", runsScored: 0 } },
  { text: "wide down the leg side, flicked at and missed", extras: { type: "wide", runs: 1 }, expect: { line: "wide-leg", runsScored: 0 } },
  { text: "wide, the bouncer sails over his head, called immediately", extras: { type: "wide", runs: 1 }, expect: { length: "bouncer", runsScored: 0 } },
  { text: "five wides! down the leg side and beats everyone, races to the fine leg fence", extras: { type: "wide", runs: 5 }, expect: { line: "wide-leg", runsScored: 4 } },
  { text: "no ball! overstepping, and the free hit is coming up", extras: { type: "noball", runs: 1 }, expect: { runsScored: 0 } },
  { text: "byes, beats the bat and the keeper, they scamper one", extras: { type: "bye", runs: 1 }, expect: { runsScored: 1 } },
  { text: "four byes! the yorker beats everything including the keeper", extras: { type: "bye", runs: 4 }, expect: { length: "yorker", runsScored: 4 } },
  { text: "leg bye off the thigh pad, they steal a single to short leg", extras: { type: "legbye", runs: 1 }, expect: { runsScored: 1, fielderRole: "short-leg" } },
  { text: "leg byes, deflected off the hip down to fine leg for two", extras: { type: "legbye", runs: 2 }, expect: { runsScored: 2, fielderRole: "fine-leg" } },
  // ══════════════════════════════════════════════════════════════════════════
  // G. Left-handers — mirrored geometry
  // ══════════════════════════════════════════════════════════════════════════
  // For a leftie, "cuts to sweeper cover" is the RH mirror: zone 6 → zone 3.
  { text: "cuts it away to sweeper cover for one", runs: 1, hand: "left", expect: { shotType: "cut", fielderRole: "sweeper-cover", wagonZone: 3 } },
  { text: "flicks it off the pads to deep midwicket, single", runs: 1, hand: "left", expect: { shotType: "flick", fielderRole: "deep-midwicket", wagonZone: 6 } },
  { text: "pulls it hard to deep square leg for four", runs: 4, hand: "left", expect: { shotType: "pull", fielderRole: "deep-square-leg", wagonZone: 7, isBoundary: true } },
  { text: "drives through mid off, no run", hand: "left", expect: { shotType: "drive", fielderRole: "mid-off", wagonZone: 4 } },
  { text: "glances fine to long leg for a single", runs: 1, hand: "left", expect: { shotType: "flick", fielderRole: "long-leg", wagonZone: 8 } },
  { text: "edges it to first slip, dropped! No run", hand: "left", expect: { shotType: "edge", fielderRole: "slip", wagonZone: 1 } },
  { text: "sweeps hard to deep backward square leg, two runs", runs: 2, hand: "left", expect: { shotType: "sweep", fielderRole: "deep-backward-square-leg", wagonZone: 7 } },
  { text: "late cuts to third man for one", runs: 1, hand: "left", expect: { shotType: "cut", fielderRole: "third-man", wagonZone: 1 } },
  { text: "launches it over long on for six!", runs: 6, hand: "left", expect: { shotType: "loft", fielderRole: "long-on", wagonZone: 5, isBoundary: true } },
  { text: "slogs it over cow corner, huge six", runs: 6, hand: "left", expect: { shotType: "slog", fielderRole: "cow-corner", wagonZone: 5, isBoundary: true } },
  // ══════════════════════════════════════════════════════════════════════════
  // H. Sparse / generated lines — low signal MUST mean low confidence
  //    (Cricsheet replay feeds look exactly like this.)
  // ══════════════════════════════════════════════════════════════════════════
  { text: "Bumrah to Salt, no run", sparse: true, expect: { shotType: "defend", maxConfidence: 0.49, maxRadius: 0.15 } },
  { text: "Rashid to Kohli, 1 run", runs: 1, sparse: true, expect: { shotType: "drive", maxConfidence: 0.49, maxRadius: 0.5 } },
  { text: "Archer to Gill, 2 runs", runs: 2, sparse: true, expect: { shotType: "drive", maxConfidence: 0.49 } },
  { text: "Wood to Pandya, 3 runs", runs: 3, sparse: true, expect: { shotType: "drive", maxConfidence: 0.49 } },
  { text: "Curran to Suryakumar, FOUR", runs: 4, sparse: true, expect: { shotType: "drive", trajectory: "ground", isBoundary: true, maxConfidence: 0.49, minRadius: 1 } },
  { text: "Moeen to Pant, SIX", runs: 6, sparse: true, expect: { shotType: "loft", trajectory: "lofted", isBoundary: true, maxConfidence: 0.49, minRadius: 1 } },
  { text: "Stokes to Rahul, wide", extras: { type: "wide", runs: 1 }, sparse: true, expect: { shotType: "missed", maxConfidence: 0.49 } },
  { text: "Topley to Sharma, no ball, 1 run", runs: 1, extras: { type: "noball", runs: 1 }, sparse: true, expect: { maxConfidence: 0.49 } },
  { text: "Jadeja to Root, 1 bye", extras: { type: "bye", runs: 1 }, sparse: true, expect: { shotType: "leave", maxConfidence: 0.49 } },
  { text: "Siraj to Buttler, 1 leg bye", extras: { type: "legbye", runs: 1 }, sparse: true, expect: { maxConfidence: 0.49 } },
  { text: "gibberish commentary lorem ipsum dolor sit amet", sparse: true, expect: { shotType: "defend", maxConfidence: 0.49, maxRadius: 0.15 } },
  { text: "", sparse: true, expect: { shotType: "defend", maxConfidence: 0.49 } },
  { text: "OUT! Malan b Bumrah", wicket: "bowled", sparse: true, expect: { shotType: "missed", maxRadius: 0.05 } },
  { text: "OUT! Salt c Kohli b Chahal", wicket: "caught", sparse: true, expect: {} },
  { text: "OUT! Buttler run out (Jadeja)", wicket: "run out", sparse: true, expect: { shotType: "run-out-scramble" } },
  { text: "OUT! Brook st Pant b Kuldeep", wicket: "stumped", sparse: true, expect: { deliveryType: "spin", shotType: "missed", maxRadius: 0.05 } },
];
