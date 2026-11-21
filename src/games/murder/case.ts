// The Murder at Ashworth Hall case generator.
//
// The players are the suspects. One of them did it and is told so, with a
// cover story; everyone else tells the truth. Every case is built from a
// hidden truth and kept only if it passes the same checks the test runs:
//   1. Assume any one player is lying and everyone else tells the truth. Only
//      one such world holds together and leaves its liar unexplained: the one
//      where the murderer is the liar.
//   2. No single player's booklet, with what everyone can see (who wears
//      what), names the murderer on its own. The table has to talk.
// How someone is cleared: another player says they were together somewhere
// else for the whole time it could have happened, or their clothes are not
// the colour of the thread found in the library. Your own word never clears
// you: anyone could be lying.

import { seededRng, shuffle } from "@/engine/rng";
import type { Exhibit } from "@/games/detective/shape";
import { GUESTS, type Guest } from "./shape";

const COLOURS = ["red", "green", "blue", "yellow", "purple", "orange"] as const;
const CLOTHES = ["scarf", "hat", "jumper", "cardigan"] as const;
const ROOMS = ["conservatory", "kitchen", "billiard room", "garden", "music room", "study"] as const;
const SCENE = "library";
const HOUR = 9;

export const a = (word: string) => (/^[aeiou]/.test(word) ? `an ${word}` : `a ${word}`);
export const at = (m: number) => `${HOUR}:${String(m).padStart(2, "0")}`;

const INTROS: Record<string, string> = {
  "Major Ashby": "Retired soldier and old friend of Lord Ashworth. Loud, proud, and always first to the cheese board.",
  "Dr Penrose": "The family doctor. Calm, careful, and never without her bag.",
  "Lady Vane": "Lord Ashworth's sister. Wants the house, and does not hide it.",
  "Chef Rossi": "Cooked tonight's dinner. Will not stand for anyone criticising the soup.",
  "Miss Lark": "Lord Ashworth's secretary. Knows where every paper in the house is kept.",
  "Mr Finch": "The gardener. Muddy boots, kind eyes, says very little.",
  "Professor Quill": "Collector of old books. Has had his eye on the library for years.",
  "Madame Orla": "A fortune teller hired for the evening. Says she saw this coming.",
};

const SECRETS = [
  "You ate the last slice of trifle before pudding was served. If anyone mentions trifle, change the subject.",
  "You borrowed Lord Ashworth's best umbrella last spring and never gave it back.",
  "You cannot stand the soup but told the chef it was delicious.",
  "You came tonight hoping to be left something in the will.",
  "You have been secretly practising the piano in the music room for weeks.",
  "You once beat Lord Ashworth at chess by moving a piece when he was not looking.",
  "You snore. Loudly. Nobody here knows yet.",
  "You are terrified of the stuffed bear on the landing.",
];

/** A spoken statement: someone (and maybe a companion) in a room for a stretch of time. */
interface Stay {
  by: string;
  room: string;
  from: number;
  to: number;
  with: string | null;
}

export interface MurderTruth {
  guests: Guest[];
  murderer: string;
  /** The last message from Lord Ashworth, and when he was found. */
  alive: number;
  found: number;
  /** Where each innocent really was, as pairs or alone. */
  stays: Stay[];
  cover: Stay;
  cameraAt: number;
  herring: { who: string; in: number; out: number } | null;
}

export interface MurderCase {
  truth: MurderTruth;
  story: string;
  /** Per guest: secret, what they say in round 2, their round 3 clue. */
  booklets: Record<string, { secret: string; story: string; clue: { line: string; exhibit: Exhibit | null } }>;
  why: string[];
}

function pick<T>(xs: readonly T[], rng: () => number): T {
  return xs[Math.floor(rng() * xs.length)];
}
const between = (lo: number, hi: number, rng: () => number) => lo + Math.floor(rng() * (hi - lo + 1));

/**
 * Build a case for n players. Draws again from the same seed until the case
 * passes the fairness checks; the first draw usually does.
 */
export function buildMurder(seed: number, n: number): MurderCase {
  const rng = seededRng(seed);
  for (let attempt = 0; attempt < 200; attempt++) {
    const c = draw(rng, n);
    if (c && fair(c)) return c;
  }
  throw new Error(`no fair case for seed ${seed}, ${n} players`);
}

function draw(rng: () => number, n: number): MurderCase | null {
  const names = shuffle([...GUESTS], rng).slice(0, n);
  const [murderer, ...innocents] = names;
  const colours = shuffle([...COLOURS], rng);
  const guilty = colours[0];

  // Pairs: innocents who were together and can vouch for each other. Anyone
  // wearing the murderer's colour must be in a pair, since the thread cannot
  // clear them. A lone innocent wears another colour.
  const order = shuffle([...innocents], rng);
  const pairs: [string, string][] = [];
  const solo: string[] = [];
  for (let i = 0; i + 1 < order.length; i += 2) pairs.push([order[i], order[i + 1]]);
  if (order.length % 2 === 1) solo.push(order[order.length - 1]);
  const sharers = new Set<string>([pairs[0][0]]);
  for (const [p] of pairs.slice(1)) if (rng() < 0.4) sharers.add(p);

  const others = colours.slice(1);
  let o = 0;
  const guests: Guest[] = names.map((name) => ({
    name,
    colour: name === murderer || sharers.has(name) ? guilty : others[o++ % others.length],
    clothes: pick(CLOTHES, rng),
    intro: INTROS[name],
  }));

  const alive = between(5, 12, rng);
  const found = between(30, 38, rng);
  const rooms = shuffle([...ROOMS], rng);
  const stays: Stay[] = [];
  let r = 0;
  for (const [p, q] of pairs) {
    const room = rooms[r++];
    const from = between(0, alive - 2, rng);
    const to = between(found + 2, found + 10, rng);
    stays.push({ by: p, room, from, to, with: q }, { by: q, room, from, to, with: p });
  }
  for (const s of solo) stays.push({ by: s, room: rooms[r++], from: between(0, alive - 2, rng), to: between(found + 2, found + 10, rng), with: null });
  const cover: Stay = { by: murderer, room: rooms[r++], from: between(0, alive - 2, rng), to: between(found + 2, found + 10, rng), with: null };
  const cameraAt = between(alive + 2, found - 4, rng);

  // A trap for the camera holder: a lone innocent (cleared by the thread) seen
  // going into the library before Lord Ashworth's last message.
  const herring = solo.length ? { who: solo[0], in: between(0, 1, rng), out: between(2, alive - 3, rng) } : null;
  if (herring) {
    const s = stays.find((x) => x.by === herring.who)!;
    s.from = Math.max(s.from, herring.out + 1);
    if (s.from >= alive) return null;
  }

  const truth: MurderTruth = { guests, murderer, alive, found, stays, cover, cameraAt, herring };
  return write(truth, rng);
}

function write(t: MurderTruth, rng: () => number): MurderCase | null {
  const look = (name: string) => t.guests.find((g) => g.name === name)!;
  const innocents = t.guests.map((g) => g.name).filter((x) => x !== t.murderer);

  // The three clues that matter go to three different innocents.
  const holders = shuffle([...innocents], rng);
  const [messageHolder, cameraHolder, threadHolder] = holders;
  const m = look(t.murderer);
  const clues: Record<string, { line: string; exhibit: Exhibit | null }> = {};
  clues[messageHolder] = {
    line: `Lord Ashworth messaged you at ${at(t.alive)}: "In the library. Bring me a cup of tea, would you?"`,
    exhibit: { kind: "chat", title: "Lord Ashworth", clock: at(t.alive + 1), messages: [{ sender: "Lord Ashworth", time: at(t.alive), text: "In the library. Bring me a cup of tea, would you?" }] },
  };
  const cameraLines = [`Hall camera, ${at(t.cameraAt)}: ${t.murderer} walks into the library.`];
  if (t.herring) cameraLines.unshift(`Hall camera, ${at(t.herring.in)}: ${t.herring.who} walks into the library, and out again at ${at(t.herring.out)}.`);
  clues[cameraHolder] = {
    line: cameraLines.join(" "),
    exhibit: { kind: "cctv", time: at(t.cameraAt), spot: "room", people: [{ name: t.murderer, colour: m.colour, clothes: m.clothes }], action: "in", room: SCENE },
  };
  clues[threadHolder] = {
    line: `${a(m.colour).replace(/^a/, "A")} wool thread caught on the library armchair.`,
    exhibit: { kind: "bag", colour: m.colour, spot: "library armchair", room: SCENE, mark: "A cold cup of tea on the desk, still full." },
  };
  const FILLER = [
    `You heard the grandfather clock in the hall strike nine.`,
    `The library window was shut and locked from the inside.`,
    `Somebody had moved the chess set in the hall.`,
    `The dog barked at the back door just before nine.`,
    `There was a smell of burnt toast from the kitchen all evening.`,
  ];
  const fillers = shuffle([...FILLER], rng);
  let f = 0;
  for (const g of t.guests) if (!clues[g.name]) clues[g.name] = { line: fillers[f++ % fillers.length], exhibit: null };

  const say = (s: Stay) => `You were in the ${s.room}${s.with ? ` with ${s.with}` : " on your own"} from ${at(s.from)} until ${at(s.to)}.`;
  const secrets = shuffle([...SECRETS], rng);
  const booklets: MurderCase["booklets"] = {};
  t.guests.forEach((g, i) => {
    const story = g.name === t.murderer ? say(t.cover) : say(t.stays.find((s) => s.by === g.name)!);
    booklets[g.name] = { secret: secrets[i % secrets.length], story, clue: clues[g.name] };
  });

  const why = [
    `${t.murderer} did it. The camera caught ${t.murderer} walking into the library at ${at(t.cameraAt)}, after Lord Ashworth's message at ${at(t.alive)} and before he was found at ${at(t.found)}. The thread on the armchair was ${m.colour} wool, and ${t.murderer} wore ${a(m.colour)} ${m.clothes}. The story about the ${t.cover.room} was a lie.`,
  ];
  for (const name of innocents) {
    const s = t.stays.find((x) => x.by === name)!;
    if (s.with) why.push(`${name} was in the ${s.room} with ${s.with} from ${at(s.from)} until ${at(s.to)}, and ${s.with} said so.`);
    else why.push(`${name} wore ${look(name).colour}, not ${m.colour}.${t.herring?.who === name ? ` ${name} did go into the library, but at ${at(t.herring.in)}, while Lord Ashworth was still alive.` : ""}`);
  }
  return {
    truth: t,
    story: `Dinner at Ashworth Hall. At ${at(t.found)}, Hobbs the butler found Lord Ashworth dead in the library, a cup of cold tea on the desk. Nobody has left the house. One of you did it.`,
    booklets,
    why,
  };
}

// ---- the checks ---------------------------------------------------------------

/** What a player says out loud, as facts. The murderer says their cover story, never "I did it". */
export interface Spoken {
  stays: Stay[];
  seen: { who: string; room: string; at: number }[];
  alive: number | null;
  thread: string | null;
}

export function spoken(c: MurderCase, name: string): Spoken {
  const t = c.truth;
  const out: Spoken = { stays: [], seen: [], alive: null, thread: null };
  const s = name === t.murderer ? t.cover : t.stays.find((x) => x.by === name)!;
  out.stays.push(s);
  const clue = c.booklets[name].clue.line;
  let mm: RegExpMatchArray | null;
  if ((mm = clue.match(/messaged you at (\d+:\d\d)/))) out.alive = mins(mm[1]);
  for (const x of clue.matchAll(/Hall camera, (\d+:\d\d): (.+?) walks into the library(?:, and out again at (\d+:\d\d))?\./g)) {
    out.seen.push({ who: x[2], room: SCENE, at: mins(x[1]) });
    if (x[3]) out.seen.push({ who: x[2], room: "hall", at: mins(x[3]) });
  }
  if ((mm = clue.match(/^An? (\w+) wool thread/))) out.thread = mm[1];
  return out;
}

const mins = (s: string) => Number(s.split(":")[1]);

/** Who is cleared by these statements (never by their own word), and whether they contradict each other. */
export function judge(c: MurderCase, speakers: string[], found: number, liar: string | null) {
  const t = c.truth;
  const all = speakers.map((s) => ({ who: s, said: spoken(c, s) }));
  const alive = all.map((x) => x.said.alive).find((v) => v !== null) ?? null;
  const thread = all.map((x) => x.said.thread).find((v) => v !== null) ?? null;
  // Where each person is placed, and by whom.
  const places: { who: string; room: string; from: number; to: number; by: string }[] = [];
  for (const { who, said } of all) {
    for (const s of said.stays) {
      places.push({ who, room: s.room, from: s.from, to: s.to, by: who });
      if (s.with) places.push({ who: s.with, room: s.room, from: s.from, to: s.to, by: who });
    }
    for (const x of said.seen) places.push({ who: x.who, room: x.room, from: x.at, to: x.at, by: who });
  }
  let consistent = true;
  for (const p of places) {
    for (const q of places) {
      if (p.who === q.who && p.room !== q.room && p.from <= q.to && q.from <= p.to) {
        // A sighting "out again" into the hall is a moment, not a clash with a stay that starts after it.
        consistent = false;
      }
    }
  }
  const cleared = (name: string) => {
    const g = t.guests.find((x) => x.name === name)!;
    if (thread !== null && g.colour !== thread) return true;
    if (alive === null) return false;
    return places.some((p) => p.who === name && p.by !== name && p.room !== SCENE && p.from <= alive && p.to >= found);
  };
  return { consistent, cleared, liar };
}

/** The worlds that hold together: assume one player lies and everyone else tells the truth. */
export function possibleMurderers(c: MurderCase): string[] {
  const t = c.truth;
  const names = t.guests.map((g) => g.name);
  return names.filter((liar) => {
    const j = judge(c, names.filter((x) => x !== liar), t.found, liar);
    return j.consistent && !j.cleared(liar);
  });
}

/** From one booklet and what everyone can see: who is still possible. */
export function fromOneBooklet(c: MurderCase, name: string): string[] {
  const t = c.truth;
  const j = judge(c, [name], t.found, null);
  return t.guests.map((g) => g.name).filter((x) => x !== name && !j.cleared(x));
}

export function fair(c: MurderCase): boolean {
  const t = c.truth;
  const worlds = possibleMurderers(c);
  if (worlds.length !== 1 || worlds[0] !== t.murderer) return false;
  // Nobody can name the murderer from their own booklet alone.
  for (const g of t.guests) if (g.name !== t.murderer && fromOneBooklet(c, g.name).length < 2) return false;
  return true;
}
