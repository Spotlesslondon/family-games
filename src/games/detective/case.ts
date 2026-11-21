// The Detective case generator (concept claude/detective-case-v0.md, paper
// case claude/detective-paper-case-1.md; Joshua, 21 Nov 17:37: "Build
// detective").
//
// A case is built from a hidden truth: who took the thing, when it went, where
// everyone was, what everyone wore. Every line a player reads is written from
// that truth, so the case is always consistent, and the test reads the lines
// back to prove:
//   1. Read together, the evidence names exactly one person: the culprit.
//   2. Every innocent is ruled out by a stated fact (an alibi that covers the
//      whole time the thing went, or clothes that do not match the thread).
//   3. No one role's evidence names the culprit on its own: the table has to
//      talk.
//
// How a suspect is ruled out, the only two ways:
//   - Alibi: they were somewhere else from before the last photo with the
//     thing in it until after the first photo without it. The photos are in
//     Records; where people were is in Witnesses (and the garage fob log in
//     Records).
//   - Thread: Forensics found a wool thread of one colour; CCTV shows what
//     colour everyone wore. Anyone wearing another colour did not leave it.
// Who goes into the room is flavour, and a trap: at least one innocent is seen
// going in at a time when the thing was still there.

import { seededRng, shuffle } from "@/engine/rng";
import { LEVELS, type DetectiveLevel, type Evidence, type RoleKey } from "./shape";

const NAMES = ["Uncle Bob", "Auntie May", "Cousin Pip", "Grandpa Joe", "Nana Rose", "Cousin Kit", "Auntie Jen", "Uncle Raj"] as const;
const COLOURS = ["red", "green", "blue", "yellow", "purple", "orange"] as const;
const CLOTHES = ["scarf", "hat", "jumper", "cardigan"] as const;

export interface Theme {
  item: string;
  room: string;
  /** Where it sat, and where it is missing from. */
  spot: string;
  /** Something else Forensics finds, for colour only. */
  mark: string;
  story: (names: string[]) => string;
}

const list = (names: string[]) => (names.length <= 1 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`);

export const THEMES: Theme[] = [
  { item: "birthday cake", room: "kitchen", spot: "kitchen side", mark: "Icing smudges on the kitchen floor.", story: (n) => `The birthday cake was on the kitchen side. Now it is gone. ${list(n)} were in the house. Who took it?` },
  { item: "football trophy", room: "living room", spot: "trophy shelf", mark: "A clean square in the dust where the trophy stood.", story: (n) => `The football trophy was on the shelf in the living room. Now it is gone. ${list(n)} were in the house. Who took it?` },
  { item: "cookie jar", room: "kitchen", spot: "top of the fridge", mark: "Biscuit crumbs on the kitchen floor.", story: (n) => `The cookie jar was on top of the fridge. Now it is gone. ${list(n)} were in the house. Who took it?` },
  { item: "TV remote", room: "living room", spot: "arm of the sofa", mark: "The sofa cushions have been moved.", story: (n) => `The TV remote was on the arm of the sofa. Now it is gone, just before the big film. ${list(n)} were in the house. Who took it?` },
  { item: "tin of chocolates", room: "dining room", spot: "dining table", mark: "A gold wrapper under the dining table.", story: (n) => `The tin of chocolates was on the dining table. Now it is gone. ${list(n)} were in the house. Who took it?` },
  { item: "jigsaw box", room: "playroom", spot: "toy shelf", mark: "Two jigsaw pieces on the playroom floor.", story: (n) => `The new jigsaw was on the toy shelf in the playroom. Now it is gone. ${list(n)} were in the house. Who took it?` },
];

type Place = "garden" | "garage" | "upstairs" | "the loft";

export interface Truth {
  theme: Theme;
  hour: number;
  suspects: string[];
  culprit: string;
  /** Minutes past the hour: the last photo with the thing in it, the first without. */
  lastSeen: number;
  goneBy: number;
  wear: Record<string, { colour: string; clothes: string }>;
  stays: { who: string; place: Place; from: number; to: number; source: "neighbour" | "fob" | "statement" }[];
  /** Times someone walked into the room, and out again if they did. */
  visits: { who: string; in: number; out: number | null }[];
  /** How each innocent is ruled out, for the reveal. */
  ruledOut: Record<string, "alibi" | "thread">;
}

export interface Case {
  truth: Truth;
  story: string;
  evidence: Record<RoleKey, Evidence>;
  /** The reveal, one line per suspect. */
  why: string[];
}

/** "a red", "an orange". */
export const a = (word: string) => (/^[aeiou]/.test(word) ? `an ${word}` : `a ${word}`);

export const time = (hour: number, m: number) => `${hour}:${String(m).padStart(2, "0")}`;

function pick<T>(xs: readonly T[], rng: () => number): T {
  return xs[Math.floor(rng() * xs.length)];
}
const between = (a: number, b: number, rng: () => number) => a + Math.floor(rng() * (b - a + 1));

/** Build a case from its seed. The same seed and level always give the same case. */
export function buildCase(seed: number, level: DetectiveLevel): Case {
  const spec = LEVELS[level];
  const rng = seededRng(seed);
  const theme = pick(THEMES, rng);
  const hour = between(2, 5, rng);
  const suspects = shuffle([...NAMES], rng).slice(0, spec.suspects);
  const [culprit, ...innocents] = suspects;
  const lastSeen = between(8, 14, rng);
  const goneBy = lastSeen + (level === 1 ? between(6, 8, rng) : between(4, 6, rng));

  // Who is ruled out how. At least one by alibi (wearing the culprit's colour,
  // so the thread cannot clear them) and one by thread (no alibi that covers
  // the window). Any further suspect is either.
  const order = shuffle([...innocents], rng);
  const ruledOut: Record<string, "alibi" | "thread"> = {};
  ruledOut[order[0]] = "alibi";
  ruledOut[order[1]] = "thread";
  for (const extra of order.slice(2)) ruledOut[extra] = rng() < 0.5 ? "alibi" : "thread";

  const colours = shuffle([...COLOURS], rng);
  const guiltyColour = colours[0];
  const others = colours.slice(1);
  const wear: Truth["wear"] = {};
  let o = 0;
  for (const s of suspects) {
    const colour = s === culprit || ruledOut[s] === "alibi" ? guiltyColour : others[o++ % others.length];
    wear[s] = { colour, clothes: pick(CLOTHES, rng) };
  }

  // Alibis: somewhere else from before the last photo until after the first
  // empty one. Each alibied person gets their own place.
  const places: Place[] = spec.statements ? shuffle(["garden", "garage", "upstairs", "the loft"] as Place[], rng) : shuffle(["garden", "garage"] as Place[], rng);
  const stays: Truth["stays"] = [];
  const sourceOf = (place: Place): Truth["stays"][number]["source"] => (place === "garden" ? "neighbour" : place === "garage" ? "fob" : "statement");
  let p = 0;
  for (const s of order) {
    if (ruledOut[s] !== "alibi") continue;
    const place = places[p++ % places.length];
    stays.push({ who: s, place, from: between(1, lastSeen - 3, rng), to: between(goneBy + 2, goneBy + 15, rng), source: sourceOf(place) });
  }

  // Into the room: the culprit between the photos; a red herring (cleared by
  // the thread) in and out while the thing was still there.
  const visits: Truth["visits"] = [];
  const herrings = order.filter((s) => ruledOut[s] === "thread").slice(0, spec.herrings);
  for (const h of herrings) {
    const inAt = between(1, lastSeen - 4, rng);
    visits.push({ who: h, in: inAt, out: between(inAt + 1, lastSeen - 1, rng) });
  }

  // Level 2: a near miss. The culprit has an alibi that stops inside the
  // window, so a table that does not check the times clears the wrong person.
  let culpritIn = between(lastSeen + 1, goneBy - 1, rng);
  if (spec.nearMiss) {
    const place = places[p++ % places.length];
    const to = between(lastSeen + 1, goneBy - 2, rng);
    stays.push({ who: culprit, place, from: between(1, lastSeen - 3, rng), to, source: sourceOf(place) });
    culpritIn = between(to + 1, goneBy - 1, rng);
  }
  visits.push({ who: culprit, in: culpritIn, out: between(goneBy + 1, goneBy + 8, rng) });

  const truth: Truth = { theme, hour, suspects, culprit, lastSeen, goneBy, wear, stays, visits, ruledOut };
  return { truth, story: theme.story(suspects), evidence: writeEvidence(truth, level, rng), why: writeWhy(truth) };
}

function writeEvidence(t: Truth, level: DetectiveLevel, rng: () => number): Record<RoleKey, Evidence> {
  const at = (m: number) => time(t.hour, m);
  const { theme } = t;

  // CCTV: what everyone wore, then who walked where, in time order.
  const moves: [number, string][] = [];
  for (const s of t.stays) {
    if (s.place === "garden") {
      moves.push([s.from, `${at(s.from)} ${s.who} goes out of the back door.`]);
      moves.push([s.to, `${at(s.to)} ${s.who} comes back in by the back door.`]);
    } else if (s.place === "garage") {
      moves.push([s.from, `${at(s.from)} ${s.who} walks to the garage.`]);
      moves.push([s.to, `${at(s.to)} ${s.who} comes back from the garage.`]);
    } else {
      moves.push([s.from, `${at(s.from)} ${s.who} walks up the stairs.`]);
      moves.push([s.to, `${at(s.to)} ${s.who} comes down the stairs.`]);
    }
  }
  for (const v of t.visits) {
    moves.push([v.in, `${at(v.in)} ${v.who} walks into the ${theme.room}.`]);
    if (v.out !== null) moves.push([v.out, `${at(v.out)} ${v.who} walks out of the ${theme.room}.`]);
  }
  moves.sort((a, b) => a[0] - b[0]);
  const cctv: Evidence = {
    role: "cctv",
    title: "CCTV: the hall camera",
    lines: [...shuffle([...t.suspects], rng).map((s) => `${s} is wearing ${a(t.wear[s].colour)} ${t.wear[s].clothes}.`), ...moves.map(([, l]) => l)],
  };

  // Witnesses: the neighbour over the fence, and at level 2 what people say.
  const witnessLines: string[] = [];
  for (const s of t.stays) {
    if (s.source === "neighbour") witnessLines.push(`The neighbour watched the garden: ${s.who} was in the garden from ${at(s.from)} until ${at(s.to)}.`);
    if (s.source === "statement") witnessLines.push(`${s.who} says: I was ${s.place === "upstairs" ? "upstairs" : "in the loft"} from ${at(s.from)} until ${at(s.to)}.`);
  }
  if (witnessLines.length === 0) witnessLines.push("The neighbour watched the garden the whole time. Nobody went out into it.");

  // Records: the photos, and the garage fob log.
  const records: string[] = [];
  if (level >= 2) records.push(`Photo, ${at(between(1, t.lastSeen - 2, rng))}: the ${theme.item} is on the ${theme.spot}.`);
  records.push(`Photo, ${at(t.lastSeen)}: the ${theme.item} is on the ${theme.spot}.`);
  records.push(`Photo, ${at(t.goneBy)}: the ${theme.spot} is empty.`);
  for (const s of t.stays) {
    if (s.source === "fob") records.push(`The garage has no other door. ${s.who}'s key fob opened it at ${at(s.from)}, and ${s.who} left at ${at(s.to)}.`);
  }

  const forensics: Evidence = {
    role: "forensics",
    title: `Forensics: the ${theme.room}`,
    lines: [`${a(t.wear[t.culprit].colour).replace(/^a/, "A")} wool thread caught on the ${theme.spot}.`, theme.mark],
  };

  return {
    cctv,
    witness: { role: "witness", title: "Witnesses", lines: witnessLines },
    records: { role: "records", title: "Records", lines: records },
    forensics,
  };
}

function writeWhy(t: Truth): string[] {
  const at = (m: number) => time(t.hour, m);
  const { theme } = t;
  const c = t.culprit;
  const visit = t.visits.find((v) => v.who === c)!;
  const lines = [
    `${c} did it. The ${theme.item} went between ${at(t.lastSeen)} and ${at(t.goneBy)}. ${c} walked into the ${theme.room} at ${at(visit.in)}, wearing ${a(t.wear[c].colour)} ${t.wear[c].clothes}, and the thread on the ${theme.spot} was ${t.wear[c].colour} wool.`,
  ];
  for (const s of t.suspects) {
    if (s === c) continue;
    if (t.ruledOut[s] === "alibi") {
      const stay = t.stays.find((x) => x.who === s)!;
      const where = stay.place === "garden" ? "in the garden" : stay.place === "garage" ? "in the garage" : stay.place === "upstairs" ? "upstairs" : "in the loft";
      lines.push(`${s} was ${where} from ${at(stay.from)} until ${at(stay.to)}, the whole time it went.`);
    } else {
      const herring = t.visits.find((v) => v.who === s);
      lines.push(`${s} wore ${t.wear[s].colour}, not ${t.wear[c].colour}.${herring ? ` ${s} did go into the ${theme.room}, but at ${at(herring.in)}, while the ${theme.item} was still there.` : ""}`);
    }
  }
  return lines;
}
